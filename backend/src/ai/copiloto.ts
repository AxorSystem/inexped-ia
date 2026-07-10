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

  // 2. Checklist normativo
  const checklistR = await query(
    `SELECT estado, tipo_doc, descripcion, obligatorio
       FROM dbo.checklist_items
      WHERE fondo_id = (SELECT fondo_id FROM dbo.expedientes WHERE id = @id)
      ORDER BY orden`,
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

Checklist normativo aplicable:
${checklistR.recordset.map((c: any) => `  [${c.estado}] ${c.tipo_doc}: ${c.descripcion}${c.obligatorio ? ' (obligatorio)' : ''}`).join('\n')}

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
 * Detecta faltantes en un expediente comparando docs subidos vs checklist.
 * Enriquece la salida con análisis de LLM sobre coherencia.
 */
export async function detectarFaltantes(expedienteId: number) {
  const expR = await query(
    `SELECT e.folio, e.nombre, e.estado, e.fondo_id, f.codigo AS fondo_codigo
       FROM dbo.expedientes e JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE e.id = @id`,
    { id: expedienteId }
  );
  if (!expR.recordset[0]) throw new Error('Expediente no encontrado');
  const exp = expR.recordset[0];

  const checklistR = await query(
    `SELECT estado, tipo_doc, descripcion, obligatorio, orden
       FROM dbo.checklist_items WHERE fondo_id = @f ORDER BY orden`,
    { f: exp.fondo_id }
  );

  const docsR = await query(
    `SELECT tipo_doc, COUNT(*) AS n FROM dbo.documentos
      WHERE expediente_id = @id AND tipo_doc IS NOT NULL
      GROUP BY tipo_doc`,
    { id: expedienteId }
  );

  const conteo = new Map<string, number>();
  for (const r of docsR.recordset) conteo.set(r.tipo_doc, r.n);

  const estados = ['planeacion', 'autorizado', 'ejecucion', 'cierre'];
  const idxEstado = estados.indexOf(exp.estado);

  const faltantes: Array<{ tipo: string; descripcion: string; estado: string; bloqueante: boolean }> = [];
  for (const item of checklistR.recordset) {
    // Solo consideramos ítems del estado actual y anteriores
    const idxItem = estados.indexOf(item.estado);
    if (idxItem > idxEstado) continue;
    const tiene = (conteo.get(item.tipo_doc) ?? 0) > 0;
    if (!tiene && item.obligatorio) {
      faltantes.push({
        tipo: item.tipo_doc,
        descripcion: item.descripcion,
        estado: item.estado,
        bloqueante: idxItem === idxEstado,
      });
    }
  }

  return {
    expediente: { folio: exp.folio, nombre: exp.nombre, estado: exp.estado, fondo: exp.fondo_codigo },
    total_documentos: [...conteo.values()].reduce((a, b) => a + b, 0),
    faltantes,
    puede_avanzar: faltantes.filter((f) => f.bloqueante).length === 0,
  };
}
