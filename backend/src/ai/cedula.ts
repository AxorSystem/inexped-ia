import fs from 'node:fs/promises';
import path from 'node:path';
import { chat } from './anthropic.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { normalizarModelo, registrarCosto } from './costos.js';

/**
 * Genera la Cédula Consolidada de Rendición de Cuentas ASF para un expediente.
 * Es el "resultado final" que el municipio entrega al auditor.
 * Reúne los 30+ documentos y produce un documento único con IA que
 * certifica el cumplimiento normativo de las 6 fases.
 */
export async function generarCedulaAsf(expedienteId: number, actor: string) {
  // 1. Datos del expediente
  const expR = await query(
    `SELECT e.id, e.folio, e.nombre, e.descripcion, e.monto, e.municipio, e.responsable,
            e.tipo_adjudicacion, e.estado, e.created_at, e.updated_at,
            f.codigo AS fondo_codigo, f.nombre AS fondo_nombre
       FROM dbo.expedientes e
       JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE e.id = @id`,
    { id: expedienteId },
  );
  if (!expR.recordset[0]) throw new Error('Expediente no encontrado');
  const e = expR.recordset[0];

  // 2. Fases con sus tareas
  const tareasR = await query(
    `SELECT fa.orden AS fase_orden, fa.clave AS fase_clave, fa.nombre AS fase_nombre,
            et.orden, et.nombre, et.estado, et.completada_at, et.completada_por,
            tc.fundamento_legal,
            (SELECT COUNT(*) FROM dbo.documentos d WHERE d.expediente_tarea_id = et.id) AS n_docs
       FROM dbo.expediente_tareas et
       JOIN dbo.fases fa ON fa.id = et.fase_id
       JOIN dbo.tareas_catalogo tc ON tc.id = et.tarea_catalogo_id
      WHERE et.expediente_id = @id
      ORDER BY fa.orden, et.orden`,
    { id: expedienteId },
  );

  // 3. Docs
  const docsR = await query(
    `SELECT d.filename, d.tipo_doc, d.uploaded_at, d.expediente_tarea_id
       FROM dbo.documentos d WHERE d.expediente_id = @id ORDER BY d.uploaded_at`,
    { id: expedienteId },
  );

  const totalTareas = tareasR.recordset.length;
  const completadas = tareasR.recordset.filter((t: any) => t.estado === 'completada' || t.estado === 'no_aplica').length;
  const cumplimientoPct = totalTareas === 0 ? 0 : Math.round((completadas / totalTareas) * 100);

  // 4. Arma el resumen estructurado para el prompt
  const fasesGrouped: Record<string, any[]> = {};
  for (const t of tareasR.recordset as any[]) {
    const k = `${t.fase_clave} · ${t.fase_nombre}`;
    if (!fasesGrouped[k]) fasesGrouped[k] = [];
    fasesGrouped[k].push(t);
  }
  const resumenFases = Object.entries(fasesGrouped)
    .map(([fase, ts]) => {
      const lines = ts
        .map((t) => `  ${t.orden}. [${t.estado}] ${t.nombre} — ${t.n_docs} docs — ${t.fundamento_legal ?? 's/f'}`)
        .join('\n');
      return `Fase ${fase} (${ts.filter((t) => t.estado === 'completada' || t.estado === 'no_aplica').length}/${ts.length}):\n${lines}`;
    })
    .join('\n\n');

  const system = `Eres un redactor jurídico especialista en rendición de cuentas del Gasto Federalizado (GASFED) en México.
Tu tarea es producir una CÉDULA CONSOLIDADA DE RENDICIÓN DE CUENTAS que el municipio entrega al auditor de la Auditoría Superior de la Federación (ASF).

Requisitos del documento:
- Formato: markdown formal, con secciones numeradas.
- Estilo: institucional, cita fundamentos legales (LOPSRM, LGCG, LCF, Lineamientos GASFED, Reglamento LOPSRM).
- Tono: sobrio, sin superlativos. No inventes datos.
- Contenido obligatorio:
  1. Portada con folio, nombre de la obra, fondo, monto, municipio
  2. Certificación de cierre firmada por el responsable
  3. Resumen ejecutivo (5-8 líneas)
  4. Cumplimiento por fase (I a VI): explica qué se hizo en cada fase, cuántas tareas cumplen y su base legal
  5. Índice de documentos anexos (numerado, con la clave fase.tarea)
  6. Conclusión y declaración de cumplimiento normativo
  7. Anexos (mención de los documentos que se acompañan)
- Extensión: entre 1200 y 1800 palabras.
- Al final, INCLUYE una tabla resumen con: monto ejecutado, tareas cumplidas, % cumplimiento, documentos entregados.`;

  const user = `Genera la Cédula Consolidada para el siguiente expediente cerrado.

DATOS DEL EXPEDIENTE:
- Folio: ${e.folio}
- Obra: ${e.nombre}
- Descripción: ${e.descripcion ?? '(sin descripción adicional)'}
- Fondo: ${e.fondo_codigo} — ${e.fondo_nombre}
- Monto autorizado y ejercido: $${(e.monto ?? 0).toLocaleString('es-MX')} MXN
- Tipo de adjudicación: ${e.tipo_adjudicacion ?? 'N/D'}
- Municipio: ${e.municipio ?? 'N/D'}
- Responsable: ${e.responsable ?? 'N/D'}
- Estado: ${e.estado}
- Cumplimiento global: ${completadas}/${totalTareas} tareas (${cumplimientoPct}%)
- Total de documentos anexos: ${docsR.recordset.length}

DETALLE DE FASES Y TAREAS (con estado, documentos y fundamento legal):
${resumenFases}

Redacta ahora la Cédula Consolidada.`;

  const result = await chat({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 4000,
  });

  await registrarCosto({
    expedienteId,
    accion: 'generar_draft',
    modelo: normalizarModelo(config.ai.chatModel),
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    costUsd: result.costUsd,
    actor,
    meta: { tipo: 'cedula_asf', totalDocs: docsR.recordset.length, cumplimientoPct },
  });

  // 5. Persiste como documento del expediente
  const draftsDir = path.join(config.storage.uploadsDir, 'drafts');
  await fs.mkdir(draftsDir, { recursive: true });
  const filename = `cedula-rendicion-asf-${e.folio}.md`;
  const storagePath = path.join(draftsDir, `${expedienteId}-cedula-asf.md`);
  const cuerpo = `# Cédula Consolidada de Rendición de Cuentas
> **${e.folio}** · ${e.nombre}
> Generada por INEXPED IA el ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
> Revisar y firmar por el responsable antes de entregar al auditor.

---

${result.text}
`;
  await fs.writeFile(storagePath, cuerpo, 'utf-8');
  const size = Buffer.byteLength(cuerpo, 'utf-8');

  const insR = await query(
    `INSERT INTO dbo.documentos
       (expediente_id, expediente_tarea_id, filename, storage_path, mime_type, size_bytes,
        tipo_doc, extracted_text, metadata_json, ai_summary, uploaded_by)
     OUTPUT INSERTED.id
     VALUES (@e, NULL, @fn, @sp, @m, @s, @td, @et, @md, @sum, @by)`,
    {
      e: expedienteId,
      fn: filename,
      sp: storagePath,
      m: 'text/markdown',
      s: size,
      td: 'cedula_asf',
      et: result.text,
      md: JSON.stringify({
        generado_por: 'ia',
        tipo: 'cedula_asf',
        cumplimiento_pct: cumplimientoPct,
        tareas_total: totalTareas,
        tareas_completadas: completadas,
        docs_anexos: docsR.recordset.length,
        costUsd: result.costUsd,
      }),
      sum: `Cédula Consolidada de Rendición ASF. Cumplimiento ${cumplimientoPct}%.`,
      by: actor,
    },
  );

  return {
    documentoId: insR.recordset[0].id,
    filename,
    contenido: cuerpo,
    cumplimientoPct,
    tareasTotal: totalTareas,
    tareasCompletadas: completadas,
    docsAnexos: docsR.recordset.length,
    costUsd: result.costUsd,
    usage: result.usage,
  };
}
