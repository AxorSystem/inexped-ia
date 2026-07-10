import { chat } from './anthropic.js';
import { query } from '../db.js';

export interface CamposExpediente {
  nombre: string | null;
  descripcion: string | null;
  monto: number | null;
  fondo_codigo: string | null;
  tipo_adjudicacion: 'LP' | 'IR' | 'I3' | 'AD' | null;
  municipio: string | null;
  responsable: string | null;
  confianza: number;
  faltantes: string[];
  razonamiento?: string;
}

/** Umbrales oficiales 2026 en MXN para obra pública federal. */
function sugerirTipoPorMonto(monto: number | null): 'LP' | 'IR' | 'AD' | null {
  if (!monto) return null;
  if (monto <= 1_500_000) return 'AD';
  if (monto <= 4_000_000) return 'IR';
  return 'LP';
}

/**
 * Extrae los campos de un expediente a partir de texto libre.
 * Sirve tanto para convocatorias en PDF como para transcripciones de chat.
 */
export async function extraerCamposExpediente(texto: string, fondos: Array<{ codigo: string; nombre: string }>) {
  const catalogoFondos = fondos.map((f) => `${f.codigo}: ${f.nombre}`).join('\n');

  const system = `Eres un extractor de datos para expedientes de obra pública en México (GASFED).
Tu tarea es leer un documento o transcripción y devolver un JSON con los campos del expediente.
Solo respondes con JSON válido, sin markdown, sin explicaciones adicionales.

Fondos GASFED disponibles:
${catalogoFondos}

Tipos de adjudicación:
- LP  (Licitación Pública)                → obras > $4,000,000 MXN
- IR  (Invitación Restringida a 3+)       → obras entre $1,500,000 y $4,000,000
- I3  (Invitación a 3 personas)           → similar a IR, casos específicos
- AD  (Adjudicación Directa)              → obras ≤ $1,500,000 MXN

Reglas:
- Si un campo no aparece en el texto, ponlo en null y agrégalo a "faltantes".
- El monto va en MXN sin comas ni signos, número puro.
- El fondo_codigo debe ser EXACTAMENTE uno de los códigos del catálogo, o null.
- La confianza es 0.0 a 1.0 según qué tan clara es la información en el texto.`;

  const user = `Extrae los campos del siguiente texto y responde con este JSON exacto:

{
  "nombre": "string breve descriptivo de la obra o null",
  "descripcion": "descripción larga o null",
  "monto": number | null,
  "fondo_codigo": "código exacto del catálogo" | null,
  "tipo_adjudicacion": "LP" | "IR" | "I3" | "AD" | null,
  "municipio": "nombre del municipio" | null,
  "responsable": "nombre de la persona responsable" | null,
  "confianza": number entre 0 y 1,
  "faltantes": ["campo1", "campo2"],
  "razonamiento": "breve explicación de qué encontraste y qué inferiste"
}

Texto a analizar:
"""
${texto.slice(0, 12000)}
"""`;

  const r = await chat({
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: 800,
  });

  let parsed: any = { confianza: 0, faltantes: ['todos'] };
  try {
    const m = r.text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  } catch (e) {
    console.warn('[extractor] parse fail:', (e as Error).message);
  }

  const monto = parsed.monto && Number.isFinite(Number(parsed.monto)) ? Number(parsed.monto) : null;
  if (!parsed.tipo_adjudicacion && monto) {
    parsed.tipo_adjudicacion = sugerirTipoPorMonto(monto);
  }

  const campos: CamposExpediente = {
    nombre: parsed.nombre ?? null,
    descripcion: parsed.descripcion ?? null,
    monto,
    fondo_codigo: parsed.fondo_codigo ?? null,
    tipo_adjudicacion: parsed.tipo_adjudicacion ?? null,
    municipio: parsed.municipio ?? null,
    responsable: parsed.responsable ?? null,
    confianza: Number(parsed.confianza) || 0,
    faltantes: Array.isArray(parsed.faltantes) ? parsed.faltantes : [],
    razonamiento: parsed.razonamiento,
  };

  return { campos, costUsd: r.costUsd, usage: r.usage };
}

/**
 * Sondea al chat conversacional: qué campos falta preguntar,
 * y si ya se puede crear, retorna listo=true con los campos completos.
 */
export async function conversarParaCrear(
  historial: Array<{ role: 'user' | 'assistant'; content: string }>,
  fondos: Array<{ codigo: string; nombre: string }>,
) {
  const catalogoFondos = fondos.map((f) => `${f.codigo}: ${f.nombre}`).join('\n');

  const system = `Eres el asistente de INEXPED IA que ayuda a crear expedientes de obra pública en México.
Tu trabajo es entrevistar al usuario en lenguaje natural y extraer los datos del expediente.

Campos requeridos:
- nombre (breve, ej: "Rehabilitación de la escuela primaria Benito Juárez")
- monto en MXN
- fondo_codigo (uno de los disponibles)
- municipio
- responsable (nombre de quien lidera)

Fondos disponibles:
${catalogoFondos}

Comportamiento:
- Sé breve y amable. UNA pregunta por turno.
- No repitas campos que ya te dio el usuario.
- Cuando tengas los 5 campos requeridos, en tu respuesta di algo breve confirmando ("Perfecto, resumo tu expediente...")
  y AGREGA al final un bloque JSON con este formato exacto:
  <EXPEDIENTE_LISTO>
  { "nombre": "...", "descripcion": "...", "monto": 3200000, "fondo_codigo": "FAISM", "tipo_adjudicacion": "IR", "municipio": "...", "responsable": "..." }
  </EXPEDIENTE_LISTO>
- El tipo_adjudicacion lo infieres del monto:
    ≤ $1.5M → AD | $1.5M–$4M → IR | > $4M → LP
- Si el usuario no sabe algo, sugiere valores razonables y avanza.
- Nunca inventes datos que no dio: si no te dijo el municipio, pregúntalo.

Empieza con una bienvenida corta.`;

  const r = await chat({
    system,
    messages: historial,
    maxTokens: 500,
  });

  // Detecta si terminó
  const m = r.text.match(/<EXPEDIENTE_LISTO>([\s\S]*?)<\/EXPEDIENTE_LISTO>/);
  let listo = false;
  let campos: CamposExpediente | null = null;
  let mensajeVisible = r.text;

  if (m) {
    try {
      const raw = JSON.parse(m[1].trim().match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      const monto = raw.monto && Number.isFinite(Number(raw.monto)) ? Number(raw.monto) : null;
      campos = {
        nombre: raw.nombre ?? null,
        descripcion: raw.descripcion ?? null,
        monto,
        fondo_codigo: raw.fondo_codigo ?? null,
        tipo_adjudicacion: raw.tipo_adjudicacion ?? sugerirTipoPorMonto(monto),
        municipio: raw.municipio ?? null,
        responsable: raw.responsable ?? null,
        confianza: 1.0,
        faltantes: [],
      };
      listo = !!campos.nombre && !!campos.monto && !!campos.fondo_codigo && !!campos.municipio && !!campos.responsable;
      mensajeVisible = r.text.replace(/<EXPEDIENTE_LISTO>[\s\S]*?<\/EXPEDIENTE_LISTO>/, '').trim();
    } catch (e) {
      console.warn('[extractor/chat] parse fail:', (e as Error).message);
    }
  }

  return { mensaje: mensajeVisible, listo, campos, costUsd: r.costUsd, usage: r.usage };
}

/** Utility: consulta los fondos activos para pasar al extractor. */
export async function cargarCatalogoFondos() {
  const r = await query(`SELECT codigo, nombre FROM dbo.fondos WHERE activo = 1 ORDER BY codigo`);
  return r.recordset as Array<{ codigo: string; nombre: string }>;
}
