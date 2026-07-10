import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { config } from '../config.js';
import { query } from '../db.js';
import { clasificarDocumento } from '../ai/anthropic.js';
import { indexarDocumento } from '../ai/embeddings.js';
import { normalizarModelo, registrarCosto } from '../ai/costos.js';
import { requireAuth } from './auth.js';

// pdf-parse solo tiene CJS + un script de test que rompe con ESM require; lo cargamos
// directo desde su implementación para evitar el script sin exportaciones.
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buf: Buffer,
) => Promise<{ text: string; numpages: number }>;

const router = Router();
router.use(requireAuth);

await fs.mkdir(config.storage.uploadsDir, { recursive: true });

const MAX_FILE_SIZE_MB = 25;
const upload = multer({
  dest: config.storage.uploadsDir,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
    fields: 10,
  },
});

/** Sube un documento a un expediente y dispara: OCR → clasificación IA → indexado RAG. */
router.post('/:expedienteId/upload', upload.single('file'), async (req: any, res) => {
  const expedienteId = Number(req.params.expedienteId);
  const expedienteTareaId = req.body?.expediente_tarea_id ? Number(req.body.expediente_tarea_id) : null;
  if (!req.file) return res.status(400).json({ error: 'file requerido' });

  const filename = req.file.originalname;
  const storagePath = req.file.path;
  const mime = req.file.mimetype;
  const size = req.file.size;

  // 1. Extraer texto (solo PDFs por ahora)
  let extractedText = '';
  let numPages = 0;
  try {
    if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      const buf = await fs.readFile(storagePath);
      const parsed = await pdfParse(buf);
      extractedText = parsed.text.trim();
      numPages = parsed.numpages;
    } else if (mime.startsWith('text/')) {
      extractedText = (await fs.readFile(storagePath, 'utf-8')).trim();
    }
  } catch (e) {
    console.warn('[docs] extract fail:', (e as Error).message);
  }

  // 2. Clasificar con IA (Haiku) + extraer metadatos
  let tipoDoc = 'otro';
  let metadata: Record<string, any> = {};
  let costClasificacion = 0;
  if (extractedText.length > 40) {
    try {
      const clas = await clasificarDocumento(filename, extractedText);
      tipoDoc = clas.tipo_doc;
      metadata = clas.metadata;
      costClasificacion = clas.costUsd;
      await registrarCosto({
        expedienteId,
        accion: 'clasificar_doc',
        modelo: normalizarModelo(config.ai.classifyModel),
        costUsd: clas.costUsd,
        actor: req.user?.name ?? 'anon',
        meta: { filename, tipo_doc: clas.tipo_doc },
      });
    } catch (e) {
      console.warn('[docs] clasificar fail:', (e as Error).message);
    }
  }

  // 3. Guardar en BD
  const insR = await query(
    `INSERT INTO dbo.documentos (expediente_id, expediente_tarea_id, filename, storage_path, mime_type, size_bytes, tipo_doc, extracted_text, metadata_json, ai_summary, uploaded_by)
     OUTPUT INSERTED.id
     VALUES (@e, @tarea, @fn, @sp, @m, @s, @t, @et, @md, @sum, @by)`,
    {
      e: expedienteId,
      tarea: expedienteTareaId,
      fn: filename,
      sp: storagePath,
      m: mime,
      s: size,
      t: tipoDoc,
      et: extractedText.slice(0, 500000),  // límite razonable
      md: JSON.stringify(metadata),
      sum: metadata.resumen ?? null,
      by: req.user?.name ?? 'anon',
    }
  );
  const documentoId = insR.recordset[0].id;

  // 4. Indexar embeddings (asíncrono no bloqueante para el usuario)
  let chunksIndexados = 0;
  if (extractedText.length > 200) {
    try {
      const idx = await indexarDocumento(documentoId, extractedText);
      chunksIndexados = idx.chunks;
      if (idx.costUsd > 0) {
        await registrarCosto({
          expedienteId,
          accion: 'embeddings',
          modelo: normalizarModelo(config.ai.embeddingModel),
          inputTokens: idx.tokens,
          costUsd: idx.costUsd,
          actor: req.user?.name ?? 'anon',
          meta: { documentoId, chunks: idx.chunks, filename },
        });
      }
    } catch (e) {
      console.warn('[docs] index fail:', (e as Error).message);
    }
  }

  await query(
    `INSERT INTO dbo.audit_log (actor, action, entity, entity_id, payload_json)
     VALUES (@a, 'upload_documento', 'documento', @id, @p)`,
    {
      a: req.user?.name ?? 'anon',
      id: documentoId,
      p: JSON.stringify({ filename, tipoDoc, numPages, chunksIndexados }),
    }
  );

  res.json({
    id: documentoId,
    filename,
    tipo_doc: tipoDoc,
    metadata,
    numPages,
    chunksIndexados,
    costUsd: costClasificacion,
  });
});

router.get('/:documentoId/download', async (req, res) => {
  const r = await query(
    `SELECT filename, storage_path, mime_type FROM dbo.documentos WHERE id = @id`,
    { id: Number(req.params.documentoId) }
  );
  const d = r.recordset[0];
  if (!d) return res.status(404).json({ error: 'no encontrado' });
  res.setHeader('Content-Type', d.mime_type ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${d.filename}"`);
  const stream = await fs.readFile(d.storage_path);
  res.send(stream);
});

router.delete('/:documentoId', async (req, res) => {
  const id = Number(req.params.documentoId);
  await query('DELETE FROM dbo.embeddings WHERE documento_id = @id', { id });
  await query('DELETE FROM dbo.documentos WHERE id = @id', { id });
  res.json({ ok: true });
});

export default router;
