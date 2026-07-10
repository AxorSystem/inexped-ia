import fs from 'node:fs/promises';
import path from 'node:path';
import { chat } from './anthropic.js';
import { config } from '../config.js';
import { query } from '../db.js';
import { indexarDocumento } from './embeddings.js';
import { normalizarModelo, registrarCosto } from './costos.js';

/**
 * Datos mínimos que necesita cada draft.
 */
interface ContextoExpediente {
  id: number;
  folio: string;
  nombre: string;
  descripcion: string | null;
  monto: number | null;
  municipio: string | null;
  responsable: string | null;
  fondo_codigo: string;
  fondo_nombre: string;
  tipo_adjudicacion: string | null;
}

/**
 * Definición de un draft: qué tarea del catálogo lo consume y cómo prompt-earlo.
 * (fase, orden) → identifica la tarea; el nombre humano lo lee de catálogo.
 */
const DRAFTS = [
  {
    faseId: 1,
    orden: 1,
    slug: 'ficha-tecnica',
    titulo: 'Ficha técnica del proyecto',
    prompt: (e: ContextoExpediente) => `Redacta la FICHA TÉCNICA de un proyecto de obra pública mexicano.
Debe incluir:
1. Datos generales (folio, nombre, municipio, responsable)
2. Objeto y descripción de la obra
3. Fondo y monto autorizado
4. Metas físicas y financieras
5. Ubicación
6. Beneficiarios estimados
7. Fundamento legal aplicable (Art. 24 LCF, Lineamientos GASFED)

Formato: markdown con encabezados y viñetas. Formal, para funcionario público mexicano.
Alcance: máximo 400 palabras.

Datos del expediente:
- Folio: ${e.folio}
- Nombre: ${e.nombre}
- Descripción: ${e.descripcion ?? '(usa el nombre para inferir alcance)'}
- Municipio: ${e.municipio ?? '(por definir)'}
- Responsable: ${e.responsable ?? '(por asignar)'}
- Fondo: ${e.fondo_codigo} · ${e.fondo_nombre}
- Monto: $${e.monto?.toLocaleString('es-MX') ?? 'N/D'} MXN`,
  },
  {
    faseId: 1,
    orden: 4,
    slug: 'oficio-asignacion',
    titulo: 'Oficio de asignación de recursos',
    prompt: (e: ContextoExpediente) => `Redacta un OFICIO oficial de asignación de recursos del ${e.fondo_codigo} para la obra "${e.nombre}".
El oficio va del Tesorero Municipal al Director de Obras Públicas.
Debe incluir:
- Membrete institucional (H. Ayuntamiento de ${e.municipio ?? 'N/D'})
- Número de oficio (usa uno realista con el folio ${e.folio})
- Ciudad y fecha
- Destinatario
- Asunto: asignación de recursos
- Cuerpo con el monto, fuente de financiamiento y proyecto
- Fundamentación legal (Art. 34 LGCG, Art. 24 LCF, lineamientos del fondo)
- Instrucción de dar inicio a los actos preparatorios
- Firma del Tesorero

Formato: markdown que emule el formato de oficio oficial. Formal, alcance máximo 350 palabras.

Datos:
- Folio del proyecto: ${e.folio}
- Municipio: ${e.municipio ?? '[MUNICIPIO]'}
- Monto: $${e.monto?.toLocaleString('es-MX') ?? 'N/D'} MXN
- Responsable a quien se dirige: ${e.responsable ?? 'C. Director de Obras Públicas'}`,
  },
  {
    faseId: 2,
    orden: 2,
    slug: 'programa-obra',
    titulo: 'Programa de obra anual (calendario propuesto)',
    prompt: (e: ContextoExpediente) => `Genera un PROGRAMA DE OBRA ANUAL para el proyecto.
Debe incluir:
1. Descripción del proyecto
2. Tabla de hitos con: etapa, fecha inicio, fecha fin, duración, entregable
3. Etapas típicas para una obra de este monto (${e.monto?.toLocaleString('es-MX') ?? 'sin definir'}):
   - Actos preparatorios (contratación) — 4 a 8 semanas según tipo ${e.tipo_adjudicacion ?? 'a definir'}
   - Ejecución — dividida en 3 estimaciones
   - Cierre y finiquito
4. Duración total realista para el monto
5. Fundamento: Art. 21 LGCG

Formato: markdown con tabla. Fechas relativas desde "T0 = firma de contrato".
Alcance: máximo 500 palabras.

Proyecto: ${e.nombre}
Monto: $${e.monto?.toLocaleString('es-MX') ?? 'N/D'} MXN
Tipo de adjudicación: ${e.tipo_adjudicacion ?? 'por definir'}
Municipio: ${e.municipio ?? 'N/D'}`,
  },
  {
    faseId: 4,
    orden: 2,
    slug: 'dictamen-procedimiento',
    titulo: 'Dictamen del procedimiento de adjudicación',
    prompt: (e: ContextoExpediente) => `Redacta el DICTAMEN DEL PROCEDIMIENTO DE ADJUDICACIÓN que justifica el tipo elegido para esta obra.
Tipo de procedimiento elegido: ${e.tipo_adjudicacion ?? 'IR'} (${{
      LP: 'Licitación Pública',
      IR: 'Invitación Restringida a cuando menos 3 personas',
      I3: 'Invitación a 3 personas',
      AD: 'Adjudicación Directa',
    }[e.tipo_adjudicacion ?? 'IR']})

Debe incluir:
1. Antecedentes del proyecto (folio ${e.folio}, monto)
2. Marco jurídico:
   - Art. 27, 28, 42 y 43 de la LOPSRM
   - Presupuesto de Egresos de la Federación 2026, umbrales de contratación
3. Análisis: por qué se eligió ese tipo dado el monto de $${e.monto?.toLocaleString('es-MX') ?? 'N/D'} MXN
   - Regla: ≤ $1.5M puede ser AD | $1.5M–$4M IR o I3 | > $4M LP obligatoria
4. Determinación fundada y motivada
5. Firma del Comité de Adquisiciones

Formato: markdown formal. Máximo 500 palabras.

Municipio: ${e.municipio ?? 'N/D'}
Fondo: ${e.fondo_codigo}`,
  },
];

/**
 * Genera los 4 drafts base de un expediente recién creado.
 * Se los adjunta como documentos a las tareas correspondientes.
 * Se ejecuta en background: la respuesta al usuario no espera esto.
 */
export async function generarDraftsBase(expedienteId: number) {
  const expR = await query(
    `SELECT e.id, e.folio, e.nombre, e.descripcion, e.monto, e.municipio, e.responsable, e.tipo_adjudicacion,
            f.codigo AS fondo_codigo, f.nombre AS fondo_nombre
       FROM dbo.expedientes e
       JOIN dbo.fondos f ON f.id = e.fondo_id
      WHERE e.id = @id`,
    { id: expedienteId },
  );
  const e = expR.recordset[0] as ContextoExpediente;
  if (!e) throw new Error('Expediente no encontrado para drafts');

  const draftsDir = path.join(config.storage.uploadsDir, 'drafts');
  await fs.mkdir(draftsDir, { recursive: true });

  const resultados: Array<{ slug: string; ok: boolean; error?: string; documentoId?: number }> = [];

  for (const d of DRAFTS) {
    try {
      // Ubica la tarea correspondiente en el expediente
      const tareaR = await query(
        `SELECT et.id FROM dbo.expediente_tareas et
          WHERE et.expediente_id = @id AND et.fase_id = @fase AND et.orden = @orden`,
        { id: expedienteId, fase: d.faseId, orden: d.orden },
      );
      const tareaId = tareaR.recordset[0]?.id;
      if (!tareaId) {
        resultados.push({ slug: d.slug, ok: false, error: 'tarea no encontrada' });
        continue;
      }

      // Prompt Claude
      const r = await chat({
        system:
          'Eres un redactor jurídico especialista en documentos de obra pública en México. Escribes con formalidad institucional, citas fundamentos legales cuando corresponden y produces documentos listos para firmar.',
        messages: [{ role: 'user', content: d.prompt(e) }],
        maxTokens: 2000,
      });

      // Guarda en disco como .md
      const filename = `borrador-${d.slug}-${e.folio}.md`;
      const storagePath = path.join(draftsDir, `${expedienteId}-${d.slug}.md`);
      const cuerpo = `# ${d.titulo}\n\n> _Borrador generado por IA para el expediente **${e.folio}**._\n> _Revisa, edita y firma._\n\n---\n\n${r.text}\n`;
      await fs.writeFile(storagePath, cuerpo, 'utf-8');
      const size = Buffer.byteLength(cuerpo, 'utf-8');

      // Inserta como documento vinculado a la tarea
      const insR = await query(
        `INSERT INTO dbo.documentos
           (expediente_id, expediente_tarea_id, filename, storage_path, mime_type, size_bytes,
            tipo_doc, extracted_text, metadata_json, ai_summary, uploaded_by)
         OUTPUT INSERTED.id
         VALUES (@e, @t, @fn, @sp, @m, @s, @td, @et, @md, @sum, @by)`,
        {
          e: expedienteId,
          t: tareaId,
          fn: filename,
          sp: storagePath,
          m: 'text/markdown',
          s: size,
          td: 'borrador_ia',
          et: r.text,
          md: JSON.stringify({
            generado_por: 'ia',
            modelo: 'claude-sonnet-4-5',
            slug: d.slug,
            costUsd: r.costUsd,
            tokens: r.usage,
          }),
          sum: `Borrador IA: ${d.titulo}. Revisa y firma.`,
          by: 'INEXPED IA',
        },
      );
      const documentoId = insR.recordset[0].id;

      await registrarCosto({
        expedienteId,
        accion: 'generar_draft',
        modelo: normalizarModelo(config.ai.chatModel),
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
        costUsd: r.costUsd,
        actor: 'INEXPED IA',
        meta: { slug: d.slug, titulo: d.titulo, documentoId },
      });

      // Indexa para que el copiloto pueda citarlo
      try {
        const idx = await indexarDocumento(documentoId, r.text);
        if (idx.costUsd > 0) {
          await registrarCosto({
            expedienteId,
            accion: 'embeddings',
            modelo: normalizarModelo(config.ai.embeddingModel),
            inputTokens: idx.tokens,
            costUsd: idx.costUsd,
            actor: 'INEXPED IA',
            meta: { documentoId, slug: d.slug, chunks: idx.chunks },
          });
        }
      } catch (e) {
        console.warn('[drafts] index fail:', (e as Error).message);
      }

      resultados.push({ slug: d.slug, ok: true, documentoId });
    } catch (err) {
      console.error(`[drafts] fallo ${d.slug}:`, err);
      resultados.push({ slug: d.slug, ok: false, error: (err as Error).message });
    }
  }

  await query(
    `INSERT INTO dbo.audit_log (actor, action, entity, entity_id, payload_json)
     VALUES ('INEXPED IA', 'generar_drafts', 'expediente', @id, @p)`,
    { id: expedienteId, p: JSON.stringify(resultados) },
  );

  return resultados;
}
