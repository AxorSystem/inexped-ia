import { query } from '../db.js';

export type AccionCosto =
  | 'copiloto'
  | 'clasificar_doc'
  | 'generar_draft'
  | 'extraer_pdf'
  | 'extraer_chat'
  | 'embeddings';

/**
 * Registra el costo de una operación IA. Nunca lanza excepciones al caller:
 * un fallo en el tracking no debe romper la operación de negocio.
 */
export async function registrarCosto(opts: {
  expedienteId?: number | null;
  accion: AccionCosto;
  modelo?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd: number;
  actor?: string | null;
  meta?: Record<string, any> | null;
}) {
  try {
    await query(
      `INSERT INTO dbo.costos_ia
         (expediente_id, accion, modelo, input_tokens, output_tokens, cost_usd, actor, meta_json)
       VALUES (@exp, @ac, @mo, @it, @ot, @co, @act, @meta)`,
      {
        exp: opts.expedienteId ?? null,
        ac: opts.accion,
        mo: opts.modelo ?? null,
        it: opts.inputTokens ?? null,
        ot: opts.outputTokens ?? null,
        co: Number(opts.costUsd) || 0,
        act: opts.actor ?? null,
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
      },
    );
  } catch (e) {
    console.warn('[costos] tracking fail:', (e as Error).message);
  }
}

const NORM: Record<string, string> = {
  'claude-sonnet-4-5-20250929': 'sonnet-4-5',
  'claude-haiku-4-5-20251001': 'haiku-4-5',
  'text-embedding-3-small': 'embedding-3-small',
};
export function normalizarModelo(m: string | null | undefined): string {
  if (!m) return 'desconocido';
  return NORM[m] ?? m;
}
