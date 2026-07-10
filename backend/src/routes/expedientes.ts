import { Router } from 'express';
import multer from 'multer';
import { createRequire } from 'node:module';
import { query } from '../db.js';
import { requireAuth } from './auth.js';
import { detectarFaltantes, preguntarCopiloto } from '../ai/copiloto.js';
import {
  cargarCatalogoFondos,
  conversarParaCrear,
  extraerCamposExpediente,
} from '../ai/extractor.js';
import { generarDraftsBase } from '../ai/drafts.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buf: Buffer,
) => Promise<{ text: string; numpages: number }>;

const router = Router();
router.use(requireAuth);

/** Multer en memoria: no persistimos el PDF, solo extraemos texto. */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

/**
 * Instancia las tareas del catálogo para un expediente recién creado.
 * Replica en JS el cursor de schema-v2.sql: filtra fase IV por tipo_adjudicacion.
 */
async function instanciarTareas(expedienteId: number, tipoAdj: string) {
  await query(
    `INSERT INTO dbo.expediente_tareas (expediente_id, tarea_catalogo_id, fase_id, orden, nombre)
     SELECT @exp, tc.id, tc.fase_id, tc.orden, tc.nombre
       FROM dbo.tareas_catalogo tc
      WHERE tc.tipos_adjudicacion IS NULL
         OR CHARINDEX(@tipo, tc.tipos_adjudicacion) > 0
      ORDER BY tc.fase_id, tc.orden`,
    { exp: expedienteId, tipo: tipoAdj },
  );
}

/** Genera un folio propuesto: 2026-<FONDO>-<seq> por fondo. */
async function proponerFolio(fondoCodigo: string): Promise<string> {
  const anio = 2026;
  const r = await query(
    `SELECT COUNT(*) AS n FROM dbo.expedientes e
       JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE f.codigo = @c AND YEAR(e.created_at) = @y`,
    { c: fondoCodigo, y: anio },
  );
  const seq = String((r.recordset[0]?.n ?? 0) + 1).padStart(3, '0');
  return `${anio}-${fondoCodigo}-${seq}`;
}

/**
 * Crea el expediente en BD, instancia sus tareas y dispara la generación
 * de drafts IA (fire-and-forget para no bloquear la respuesta).
 * Es el helper común que usan los 3 endpoints (manual, PDF, chat).
 */
interface DatosCreacion {
  nombre: string;
  monto: number;
  fondo_codigo: string;
  tipo_adjudicacion?: string | null;
  descripcion?: string | null;
  municipio?: string | null;
  responsable?: string | null;
}

async function crearExpediente(campos: DatosCreacion, actor: string) {
  if (!campos.nombre || !campos.monto || !campos.fondo_codigo) {
    throw new Error('Faltan campos obligatorios (nombre, monto, fondo_codigo)');
  }
  const fondoR = await query(`SELECT id FROM dbo.fondos WHERE codigo = @c`, { c: campos.fondo_codigo });
  const fondoId = fondoR.recordset[0]?.id;
  if (!fondoId) throw new Error(`Fondo no encontrado: ${campos.fondo_codigo}`);

  const folio = await proponerFolio(campos.fondo_codigo);
  const tipoAdj = campos.tipo_adjudicacion ?? 'IR';

  const insR = await query(
    `INSERT INTO dbo.expedientes
       (folio, nombre, descripcion, monto, municipio, responsable, fondo_id, estado, tipo_adjudicacion, created_at, updated_at)
     OUTPUT INSERTED.id
     VALUES (@fo, @nm, @ds, @mo, @mu, @re, @fi, 'planeacion', @ta, SYSUTCDATETIME(), SYSUTCDATETIME())`,
    {
      fo: folio,
      nm: campos.nombre,
      ds: campos.descripcion ?? null,
      mo: campos.monto,
      mu: campos.municipio ?? null,
      re: campos.responsable ?? null,
      fi: fondoId,
      ta: tipoAdj,
    },
  );
  const expedienteId = insR.recordset[0].id as number;

  await instanciarTareas(expedienteId, tipoAdj);

  await query(
    `INSERT INTO dbo.audit_log (actor, action, entity, entity_id, payload_json)
     VALUES (@a, 'crear_expediente', 'expediente', @id, @p)`,
    { a: actor, id: expedienteId, p: JSON.stringify({ folio, ...campos }) },
  );

  // Fire-and-forget: los drafts se generan en background
  generarDraftsBase(expedienteId).catch((e) => {
    console.error('[expediente] drafts fail:', e);
  });

  return { id: expedienteId, folio };
}

/** Lista todos los expedientes con datos agregados. */
router.get('/', async (req, res) => {
  const r = await query(`
    SELECT e.id, e.folio, e.nombre, e.monto, e.municipio, e.responsable, e.estado, e.updated_at,
           f.codigo AS fondo_codigo, f.nombre AS fondo_nombre,
           (SELECT COUNT(*) FROM dbo.documentos d WHERE d.expediente_id = e.id) AS docs_count
      FROM dbo.expedientes e
      JOIN dbo.fondos f ON f.id = e.fondo_id
     ORDER BY e.updated_at DESC
  `);
  res.json(r.recordset);
});

/**
 * Crear expediente manual (form clásico).
 * Body: { nombre, monto, fondo_codigo, tipo_adjudicacion, municipio?, responsable?, descripcion? }
 */
router.post('/', async (req: any, res) => {
  const b = req.body ?? {};
  if (!b.nombre || !b.monto || !b.fondo_codigo) {
    return res.status(400).json({ error: 'nombre, monto y fondo_codigo son requeridos' });
  }
  try {
    const monto = Number(b.monto);
    let tipoAdj = b.tipo_adjudicacion;
    if (!tipoAdj) {
      if (monto <= 1_500_000) tipoAdj = 'AD';
      else if (monto <= 4_000_000) tipoAdj = 'IR';
      else tipoAdj = 'LP';
    }
    const created = await crearExpediente(
      {
        nombre: String(b.nombre),
        descripcion: b.descripcion ?? null,
        monto,
        fondo_codigo: String(b.fondo_codigo),
        tipo_adjudicacion: tipoAdj,
        municipio: b.municipio ?? null,
        responsable: b.responsable ?? null,
      },
      req.user?.name ?? 'anon',
    );
    res.json({ ...created, mensaje: 'Expediente creado. Generando borradores IA en segundo plano...' });
  } catch (e: any) {
    console.error('[expedientes/crear]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Crear expediente subiendo una convocatoria/oficio en PDF.
 * IA extrae los campos automáticamente.
 * Body multipart: file (PDF)
 */
router.post('/desde-pdf', uploadMemory.single('file'), async (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'file (PDF) requerido' });
  try {
    // 1. Extrae texto del PDF
    const parsed = await pdfParse(req.file.buffer as Buffer);
    const texto = parsed.text.trim();
    if (texto.length < 40) {
      return res.status(400).json({ error: 'no se pudo extraer texto legible del PDF' });
    }

    // 2. Extrae los campos con Claude
    const fondos = await cargarCatalogoFondos();
    const { campos, costUsd } = await extraerCamposExpediente(texto, fondos);

    // 3. Si no hay datos mínimos, devuelve la extracción para confirmación manual
    if (!campos.nombre || !campos.monto || !campos.fondo_codigo) {
      return res.json({
        creado: false,
        campos,
        costUsd,
        mensaje: 'Extracción parcial. Complementa los campos faltantes y confirma para crear.',
      });
    }

    // 4. Crea el expediente
    const created = await crearExpediente(
      {
        nombre: campos.nombre,
        descripcion: campos.descripcion,
        monto: campos.monto,
        fondo_codigo: campos.fondo_codigo,
        tipo_adjudicacion: campos.tipo_adjudicacion ?? 'IR',
        municipio: campos.municipio,
        responsable: campos.responsable,
      },
      req.user?.name ?? 'anon',
    );

    res.json({
      creado: true,
      ...created,
      campos,
      costUsd,
      mensaje: 'Expediente creado. Borradores IA generándose en segundo plano.',
    });
  } catch (e: any) {
    console.error('[expedientes/desde-pdf]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Crear expediente por chat conversacional.
 * Body: { historial: [{role, content}, ...] }
 * Responde con siguiente mensaje o, cuando ya tiene todo, crea el expediente.
 */
router.post('/desde-chat', async (req: any, res) => {
  const historial = Array.isArray(req.body?.historial) ? req.body.historial : [];
  try {
    const fondos = await cargarCatalogoFondos();
    const { mensaje, listo, campos, costUsd } = await conversarParaCrear(historial, fondos);

    if (!listo || !campos || !campos.nombre || !campos.monto || !campos.fondo_codigo) {
      return res.json({ creado: false, mensaje, costUsd });
    }

    const created = await crearExpediente(
      {
        nombre: campos.nombre,
        descripcion: campos.descripcion,
        monto: campos.monto,
        fondo_codigo: campos.fondo_codigo,
        tipo_adjudicacion: campos.tipo_adjudicacion ?? 'IR',
        municipio: campos.municipio,
        responsable: campos.responsable,
      },
      req.user?.name ?? 'anon',
    );

    res.json({
      creado: true,
      ...created,
      campos,
      mensaje,
      costUsd,
    });
  } catch (e: any) {
    console.error('[expedientes/desde-chat]', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/dashboard/kpis', async (req, res) => {
  const [total, porEstado, montoTotal, docsTotal] = await Promise.all([
    query('SELECT COUNT(*) AS n FROM dbo.expedientes'),
    query(`SELECT estado, COUNT(*) AS n FROM dbo.expedientes GROUP BY estado`),
    query('SELECT SUM(monto) AS total FROM dbo.expedientes'),
    query('SELECT COUNT(*) AS n FROM dbo.documentos'),
  ]);
  const estados: Record<string, number> = { planeacion: 0, autorizado: 0, ejecucion: 0, cierre: 0, cerrado: 0 };
  for (const r of porEstado.recordset) estados[r.estado] = r.n;
  res.json({
    total_expedientes: total.recordset[0].n,
    monto_total: montoTotal.recordset[0].total ?? 0,
    documentos_totales: docsTotal.recordset[0].n,
    por_estado: estados,
  });
});

/** Detalle del expediente. */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const r = await query(
    `SELECT e.*, f.codigo AS fondo_codigo, f.nombre AS fondo_nombre
       FROM dbo.expedientes e JOIN dbo.fondos f ON f.id = e.fondo_id WHERE e.id = @id`,
    { id }
  );
  if (!r.recordset[0]) return res.status(404).json({ error: 'no encontrado' });
  const docsR = await query(
    `SELECT id, filename, tipo_doc, metadata_json, ai_summary, uploaded_at, expediente_tarea_id
       FROM dbo.documentos WHERE expediente_id = @id ORDER BY uploaded_at DESC`,
    { id }
  );
  const docs = docsR.recordset.map((d: any) => ({
    ...d,
    metadata: d.metadata_json ? JSON.parse(d.metadata_json) : null,
  }));
  res.json({ ...r.recordset[0], documentos: docs });
});

/**
 * Retorna las 6 fases del expediente con sus tareas + documentos + progreso.
 * Es el endpoint principal de la vista de detalle.
 */
router.get('/:id/fases', async (req, res) => {
  const id = Number(req.params.id);
  const fasesR = await query('SELECT id, orden, clave, nombre, icono, color FROM dbo.fases ORDER BY orden');
  const tareasR = await query(
    `SELECT et.id, et.fase_id, et.orden, et.nombre, et.estado, et.observaciones,
            et.completada_at, et.completada_por,
            tc.descripcion, tc.fundamento_legal, tc.obligatorio,
            (SELECT COUNT(*) FROM dbo.documentos d WHERE d.expediente_tarea_id = et.id) AS docs_count
       FROM dbo.expediente_tareas et
       JOIN dbo.tareas_catalogo tc ON tc.id = et.tarea_catalogo_id
      WHERE et.expediente_id = @id
      ORDER BY et.fase_id, et.orden`,
    { id }
  );

  const tareasPorFase = new Map<number, any[]>();
  for (const t of tareasR.recordset) {
    if (!tareasPorFase.has(t.fase_id)) tareasPorFase.set(t.fase_id, []);
    tareasPorFase.get(t.fase_id)!.push(t);
  }

  const fases = fasesR.recordset.map((f: any) => {
    const tareas = tareasPorFase.get(f.id) ?? [];
    const total = tareas.length;
    const completadas = tareas.filter((t) => t.estado === 'completada' || t.estado === 'no_aplica').length;
    return {
      ...f,
      tareas,
      total,
      completadas,
      progreso: total === 0 ? 0 : Math.round((completadas / total) * 100),
    };
  });

  res.json(fases);
});

/** Faltantes detectados por reglas + LLM. */
router.get('/:id/faltantes', async (req, res) => {
  try {
    const result = await detectarFaltantes(Number(req.params.id));
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Copiloto RAG: pregunta abierta sobre el expediente. */
router.post('/:id/copiloto', async (req, res) => {
  const id = Number(req.params.id);
  const { pregunta } = req.body ?? {};
  if (!pregunta || typeof pregunta !== 'string') {
    return res.status(400).json({ error: 'pregunta requerida' });
  }
  try {
    const result = await preguntarCopiloto(id, pregunta);
    // registra en historial
    await query(
      `INSERT INTO dbo.chat_messages (expediente_id, role, content) VALUES (@id, 'user', @c)`,
      { id, c: pregunta }
    );
    await query(
      `INSERT INTO dbo.chat_messages (expediente_id, role, content, tokens_input, tokens_output, cost_usd)
       VALUES (@id, 'assistant', @c, @ti, @to, @cost)`,
      {
        id,
        c: result.respuesta,
        ti: result.usage.input_tokens,
        to: result.usage.output_tokens,
        cost: result.costUsd,
      }
    );
    res.json(result);
  } catch (e: any) {
    console.error('[copiloto]', e);
    res.status(500).json({ error: e.message });
  }
});

/** Historial de chat. */
router.get('/:id/copiloto/historial', async (req, res) => {
  const r = await query(
    `SELECT role, content, created_at FROM dbo.chat_messages
      WHERE expediente_id = @id ORDER BY created_at ASC`,
    { id: Number(req.params.id) }
  );
  res.json(r.recordset);
});

/** Avanza el expediente al siguiente estado (solo si NO hay tareas obligatorias pendientes). */
router.post('/:id/avanzar', async (req, res) => {
  const id = Number(req.params.id);
  const estadoR = await query(`SELECT estado FROM dbo.expedientes WHERE id = @id`, { id });
  if (!estadoR.recordset[0]) return res.status(404).json({ error: 'no encontrado' });
  const orden = ['planeacion', 'autorizado', 'ejecucion', 'cierre', 'cerrado'];
  const idx = orden.indexOf(estadoR.recordset[0].estado);
  if (idx === orden.length - 1) return res.status(400).json({ error: 'ya está cerrado' });

  const faltantes = await detectarFaltantes(id);
  if (!faltantes.puede_cerrar) {
    return res.status(409).json({
      error: 'hay tareas obligatorias pendientes',
      obligatorias_pendientes: faltantes.obligatorias_pendientes,
      faltantes: faltantes.faltantes.filter((f) => f.obligatorio),
    });
  }
  const nuevoEstado = orden[idx + 1];
  await query(
    `UPDATE dbo.expedientes SET estado = @e, updated_at = SYSUTCDATETIME() WHERE id = @id`,
    { e: nuevoEstado, id }
  );
  res.json({ estado_anterior: estadoR.recordset[0].estado, estado_nuevo: nuevoEstado });
});

export default router;
