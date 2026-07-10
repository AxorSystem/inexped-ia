import { chat } from './anthropic.js';
import { buscarChunks } from './embeddings.js';
import { query } from '../db.js';

/**
 * Copiloto RAG sobre un expediente.
 * 1. Busca los chunks más relevantes de los docs del expediente.
 * 2. Trae el contexto del expediente y su checklist.
 * 3. Le pide a Claude una respuesta citando las fuentes.
 */
export async function preguntarCopiloto(expedienteId: number, pregunta: string) {
  // 1. Contexto del expediente
  const expR = await query(
    `SELECT e.folio, e.nombre, e.descripcion, e.monto, e.municipio, e.responsable, e.estado, f.codigo AS fondo_codigo, f.nombre AS fondo_nombre
       FROM dbo.expedientes e
       JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE e.id = @id`,
    { id: expedienteId }
  );
  if (!expR.recordset[0]) throw new Error('Expediente no encontrado');
  const exp = expR.recordset[0];

  // 2. Fases con tareas (nueva estructura V2)
  const fasesR = await query(
    `SELECT f.clave, f.nombre AS fase_nombre,
            et.orden, et.nombre AS tarea, et.estado
       FROM dbo.expediente_tareas et
       JOIN dbo.fases f ON f.id = et.fase_id
      WHERE et.expediente_id = @id
      ORDER BY et.fase_id, et.orden`,
    { id: expedienteId }
  );

  // 3. Documentos ya subidos
  const docsR = await query(
    `SELECT id, filename, tipo_doc, metadata_json, ai_summary
       FROM dbo.documentos WHERE expediente_id = @id`,
    { id: expedienteId }
  );

  // 4. Búsqueda semántica de chunks relevantes
  let chunks: Array<{ chunk_text: string; filename: string; score: number }> = [];
  if (docsR.recordset.length > 0) {
    chunks = await buscarChunks(expedienteId, pregunta, 5);
  }

  // 5. Construye el prompt con citas
  const fuentes = chunks
    .map((c, i) => `[fuente ${i + 1}: ${c.filename}, similitud ${c.score.toFixed(2)}]\n${c.chunk_text.slice(0, 800)}`)
    .join('\n\n---\n\n');

  const system = `Eres el copiloto de INEXPED IA, un asistente experto en rendición de cuentas del Gasto Federalizado (GASFED) en México.

Tu papel:
- Responder al responsable del expediente con precisión, en español.
- Citar SIEMPRE las fuentes cuando uses información de un documento ("según [fuente 1]", etc.).
- Si detectas faltantes en el expediente, señálalos claramente.
- Si no tienes información suficiente en los documentos, dilo honestamente.
- Tono profesional pero claro. Evita jerga jurídica innecesaria.
- Nunca inventes datos.

Contexto del expediente:
- Folio: ${exp.folio}
- Nombre: ${exp.nombre}
- Fondo: ${exp.fondo_codigo} · ${exp.fondo_nombre}
- Monto: $${exp.monto?.toLocaleString('es-MX') ?? 'N/D'} MXN
- Municipio: ${exp.municipio ?? 'N/D'}
- Responsable: ${exp.responsable ?? 'N/D'}
- Estado actual: ${exp.estado}

Descripción: ${exp.descripcion ?? 'sin descripción'}

Estructura del expediente por fase (6 fases estándar de obra pública):
${(() => {
  const porFase = new Map<string, Array<{orden:number; tarea:string; estado:string; fase_nombre:string}>>();
  for (const r of fasesR.recordset as Array<any>) {
    if (!porFase.has(r.clave)) porFase.set(r.clave, []);
    porFase.get(r.clave)!.push(r);
  }
  return [...porFase.entries()]
    .map(([clave, tareas]) => {
      const done = tareas.filter((t) => t.estado === 'completada' || t.estado === 'no_aplica').length;
      const total = tareas.length;
      const header = `Fase ${clave} · ${tareas[0].fase_nombre} — ${done}/${total} completadas`;
      const lines = tareas
        .map((t) => `    ${clave}.${t.orden} [${t.estado}] ${t.tarea}`)
        .join('\n');
      return `${header}\n${lines}`;
    })
    .join('\n\n');
})()}

Documentos actualmente en el expediente:
${docsR.recordset.map((d: any) => `  - ${d.filename} (${d.tipo_doc ?? 'sin clasificar'})`).join('\n') || '  (ninguno todavía)'}
`;

  const userContent = fuentes
    ? `Pregunta del usuario: ${pregunta}\n\nInformación relevante de los documentos:\n\n${fuentes}`
    : `Pregunta del usuario: ${pregunta}\n\n(No hay documentos indexados en este expediente todavía.)`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 1200,
  });

  return {
    respuesta: result.text,
    fuentes: chunks.map((c) => ({ filename: c.filename, score: c.score })),
    usage: result.usage,
    costUsd: result.costUsd,
  };
}

/**
 * Detecta tareas pendientes (obligatorias, aún no completadas) por fase.
 * Se usa para el resumen ejecutivo y para bloquear el "avanzar" del expediente.
 */
export async function detectarFaltantes(expedienteId: number) {
  const expR = await query(
    `SELECT e.folio, e.nombre, e.estado, f.codigo AS fondo_codigo
       FROM dbo.expedientes e JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE e.id = @id`,
    { id: expedienteId }
  );
  if (!expR.recordset[0]) throw new Error('Expediente no encontrado');
  const exp = expR.recordset[0];

  const pendientesR = await query(
    `SELECT et.id, et.orden, et.nombre, et.estado,
            fa.clave AS fase_clave, fa.nombre AS fase_nombre, fa.orden AS fase_orden,
            tc.obligatorio
       FROM dbo.expediente_tareas et
       JOIN dbo.fases fa ON fa.id = et.fase_id
       JOIN dbo.tareas_catalogo tc ON tc.id = et.tarea_catalogo_id
      WHERE et.expediente_id = @id
        AND et.estado IN ('pendiente', 'observada')
      ORDER BY fa.orden, et.orden`,
    { id: expedienteId }
  );

  const faltantes = pendientesR.recordset.map((r: any) => ({
    id: r.id,
    fase: r.fase_clave,
    fase_nombre: r.fase_nombre,
    orden: r.orden,
    nombre: r.nombre,
    estado: r.estado,
    obligatorio: !!r.obligatorio,
  }));

  const totalR = await query(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estado IN ('completada','no_aplica') THEN 1 ELSE 0 END) AS done
       FROM dbo.expediente_tareas WHERE expediente_id = @id`,
    { id: expedienteId }
  );
  const total = totalR.recordset[0].total ?? 0;
  const done = totalR.recordset[0].done ?? 0;

  return {
    expediente: { folio: exp.folio, nombre: exp.nombre, estado: exp.estado, fondo: exp.fondo_codigo },
    progreso_pct: total === 0 ? 0 : Math.round((done / total) * 100),
    total_tareas: total,
    completadas: done,
    faltantes,
    obligatorias_pendientes: faltantes.filter((f) => f.obligatorio).length,
    puede_cerrar: faltantes.filter((f) => f.obligatorio).length === 0,
  };
}
