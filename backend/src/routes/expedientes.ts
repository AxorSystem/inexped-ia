import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from './auth.js';
import { detectarFaltantes, preguntarCopiloto } from '../ai/copiloto.js';

const router = Router();
router.use(requireAuth);

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
