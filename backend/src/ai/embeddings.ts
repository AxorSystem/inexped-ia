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

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
  costUsd: number;
}

// Precio text-embedding-3-small: $0.02 por 1M tokens
const EMBED_PRICE_PER_M = 0.02;

/** Genera embeddings para un array de textos y devuelve tokens/costo. */
export async function embed(texts: string[]): Promise<EmbedResult> {
  if (!texts.length) return { vectors: [], tokens: 0, costUsd: 0 };
  const resp = await openai.embeddings.create({
    model: config.ai.embeddingModel,
    input: texts,
  });
  const tokens = resp.usage?.total_tokens ?? 0;
  return {
    vectors: resp.data.map((d) => d.embedding),
    tokens,
    costUsd: (tokens * EMBED_PRICE_PER_M) / 1_000_000,
  };
}

/**
 * Guarda los chunks + embeddings de un documento en SQL Server.
 * Retorna número de chunks, tokens usados y costo.
 */
export async function indexarDocumento(
  documentoId: number,
  texto: string,
): Promise<{ chunks: number; tokens: number; costUsd: number }> {
  const chunks = chunkText(texto);
  if (!chunks.length) return { chunks: 0, tokens: 0, costUsd: 0 };
  const r = await embed(chunks);
  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO dbo.embeddings (documento_id, chunk_idx, chunk_text, vector_json)
       VALUES (@d, @i, @c, @v)`,
      { d: documentoId, i, c: chunks[i], v: JSON.stringify(r.vectors[i]) },
    );
  }
  return { chunks: chunks.length, tokens: r.tokens, costUsd: r.costUsd };
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
  const embR = await embed([queryText]);
  const qVec = embR.vectors[0];
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
