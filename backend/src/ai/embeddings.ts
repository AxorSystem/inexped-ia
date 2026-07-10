import OpenAI from 'openai';
import { config } from '../config.js';
import { query } from '../db.js';

const openai = new OpenAI({ apiKey: config.ai.openaiApiKey });

/** Divide texto en chunks de ~800 tokens (~3200 chars) con overlap 200 chars. */
export function chunkText(text: string, chunkSize = 3200, overlap = 200): string[] {
  if (!text || text.length < chunkSize) return text ? [text] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

/** Genera embeddings para un array de textos. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const resp = await openai.embeddings.create({
    model: config.ai.embeddingModel,
    input: texts,
  });
  return resp.data.map((d) => d.embedding);
}

/** Guarda los chunks + embeddings de un documento en SQL Server. */
export async function indexarDocumento(documentoId: number, texto: string): Promise<number> {
  const chunks = chunkText(texto);
  if (!chunks.length) return 0;
  const vectors = await embed(chunks);
  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO dbo.embeddings (documento_id, chunk_idx, chunk_text, vector_json)
       VALUES (@d, @i, @c, @v)`,
      { d: documentoId, i, c: chunks[i], v: JSON.stringify(vectors[i]) }
    );
  }
  return chunks.length;
}

/** Distancia coseno entre dos vectores. Retorna [0,2] (0=idénticos). */
export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const sim = dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
  return 1 - sim;
}

/**
 * Búsqueda semántica sobre los documentos de un expediente.
 * Retorna los top-K chunks más relevantes al query.
 */
export async function buscarChunks(expedienteId: number, queryText: string, topK = 5): Promise<Array<{
  chunk_text: string;
  documento_id: number;
  filename: string;
  score: number;
}>> {
  const [qVec] = await embed([queryText]);
  const r = await query(
    `SELECT e.chunk_text, e.documento_id, d.filename, e.vector_json
       FROM dbo.embeddings e
       JOIN dbo.documentos d ON d.id = e.documento_id
      WHERE d.expediente_id = @exp`,
    { exp: expedienteId }
  );
  const scored = r.recordset.map((row: any) => {
    const v = JSON.parse(row.vector_json) as number[];
    return {
      chunk_text: row.chunk_text,
      documento_id: row.documento_id,
      filename: row.filename,
      score: 1 - cosineDistance(qVec, v),  // similitud coseno
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
