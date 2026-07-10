import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.ai.anthropicApiKey });

export interface ChatResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
  costUsd: number;
}

// Precios julio 2026 por 1M tokens
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

function estimateCost(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const p = PRICES[model] ?? { input: 3, output: 15 };
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}

export async function chat(opts: {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  maxTokens?: number;
}): Promise<ChatResult> {
  const model = opts.model ?? config.ai.chatModel;
  const resp = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
  });
  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  return {
    text,
    usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
    costUsd: estimateCost(model, resp.usage),
  };
}

/**
 * Clasifica el tipo de documento con Haiku (más barato).
 * Retorna uno de: factura | contrato | oficio | acta | evidencia | otro
 */
export async function clasificarDocumento(filename: string, extractedText: string): Promise<{
  tipo_doc: string;
  metadata: Record<string, any>;
  costUsd: number;
}> {
  const preview = extractedText.slice(0, 3000);
  const r = await chat({
    model: config.ai.classifyModel,
    maxTokens: 400,
    system:
      'Eres un clasificador de documentos gubernamentales mexicanos del sector obra pública. Respondes SOLO con un JSON válido, sin markdown, sin explicaciones.',
    messages: [
      {
        role: 'user',
        content: `Clasifica el tipo del siguiente documento y extrae metadatos clave.

Filename: ${filename}
Contenido (extracto):
"""
${preview}
"""

Responde con este JSON exacto:
{
  "tipo_doc": "factura" | "contrato" | "oficio" | "acta" | "estimacion" | "bitacora" | "finiquito" | "evidencia" | "otro",
  "rfc_emisor": string | null,
  "rfc_receptor": string | null,
  "monto_total": number | null,
  "fecha": "YYYY-MM-DD" | null,
  "resumen": string
}`,
      },
    ],
  });

  let parsed: any = { tipo_doc: 'otro', resumen: '' };
  try {
    const jsonMatch = r.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[ai] JSON parse fallo:', (e as Error).message);
  }

  const { tipo_doc, resumen, ...metadata } = parsed;
  return {
    tipo_doc: tipo_doc || 'otro',
    metadata: { ...metadata, resumen },
    costUsd: r.costUsd,
  };
}
