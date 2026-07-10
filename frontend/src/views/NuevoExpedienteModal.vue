<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import api from '@/lib/api';

const emit = defineEmits<{ (e: 'cerrar'): void; (e: 'creado', payload: { id: number; folio: string }): void }>();

type Tab = 'pdf' | 'chat' | 'manual';
const tab = ref<Tab>('pdf');

interface Fondo { codigo: string; nombre: string; }
const fondos = ref<Fondo[]>([]);

// ── PDF tab ──────────────────────────
const pdfFile = ref<File | null>(null);
const pdfExtraido = ref<any>(null);
const pdfProcesando = ref(false);
const pdfError = ref('');
const dragOver = ref(false);

async function subirPdf() {
  if (!pdfFile.value) return;
  pdfProcesando.value = true;
  pdfError.value = '';
  pdfExtraido.value = null;
  try {
    const form = new FormData();
    form.append('file', pdfFile.value);
    const r = await api.post('/expedientes/desde-pdf', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    pdfExtraido.value = r.data;
    if (r.data.creado) {
      emit('creado', { id: r.data.id, folio: r.data.folio });
    }
  } catch (e: any) {
    pdfError.value = e.response?.data?.error ?? e.message;
  } finally {
    pdfProcesando.value = false;
  }
}

async function confirmarPdfManual() {
  const c = pdfExtraido.value?.campos ?? {};
  if (!c.nombre || !c.monto || !c.fondo_codigo) {
    pdfError.value = 'Completa nombre, monto y fondo antes de continuar.';
    return;
  }
  try {
    const r = await api.post('/expedientes', c);
    emit('creado', { id: r.data.id, folio: r.data.folio });
  } catch (e: any) {
    pdfError.value = e.response?.data?.error ?? e.message;
  }
}

function onDrop(ev: DragEvent) {
  ev.preventDefault();
  dragOver.value = false;
  const f = ev.dataTransfer?.files?.[0];
  if (f && f.type === 'application/pdf') {
    pdfFile.value = f;
  }
}

// ── Chat tab ─────────────────────────
interface ChatMsg { role: 'user' | 'assistant'; content: string; }
const chatHist = ref<ChatMsg[]>([]);
const chatInput = ref('');
const chatProcesando = ref(false);
const chatContainer = ref<HTMLElement | null>(null);

async function iniciarChat() {
  if (chatHist.value.length > 0) return;
  chatProcesando.value = true;
  try {
    const r = await api.post('/expedientes/desde-chat', { historial: [] });
    chatHist.value.push({ role: 'assistant', content: r.data.mensaje });
  } finally {
    chatProcesando.value = false;
  }
}

async function enviarChat() {
  const msg = chatInput.value.trim();
  if (!msg || chatProcesando.value) return;
  chatHist.value.push({ role: 'user', content: msg });
  chatInput.value = '';
  chatProcesando.value = true;
  await nextTick();
  scrollChatFin();
  try {
    const r = await api.post('/expedientes/desde-chat', { historial: chatHist.value });
    if (r.data.mensaje) {
      chatHist.value.push({ role: 'assistant', content: r.data.mensaje });
    }
    if (r.data.creado) {
      setTimeout(() => emit('creado', { id: r.data.id, folio: r.data.folio }), 1500);
    }
  } finally {
    chatProcesando.value = false;
    await nextTick();
    scrollChatFin();
  }
}

function scrollChatFin() {
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
}

watch(tab, (t) => {
  if (t === 'chat') iniciarChat();
});

// ── Manual tab ───────────────────────
const manual = ref({
  nombre: '',
  descripcion: '',
  monto: '',
  fondo_codigo: '',
  tipo_adjudicacion: '',
  municipio: '',
  responsable: '',
});
const manualError = ref('');
const manualGuardando = ref(false);

async function guardarManual() {
  if (!manual.value.nombre || !manual.value.monto || !manual.value.fondo_codigo) {
    manualError.value = 'Nombre, monto y fondo son requeridos';
    return;
  }
  manualError.value = '';
  manualGuardando.value = true;
  try {
    const payload: any = { ...manual.value, monto: Number(manual.value.monto) };
    if (!payload.tipo_adjudicacion) delete payload.tipo_adjudicacion;
    const r = await api.post('/expedientes', payload);
    emit('creado', { id: r.data.id, folio: r.data.folio });
  } catch (e: any) {
    manualError.value = e.response?.data?.error ?? e.message;
  } finally {
    manualGuardando.value = false;
  }
}

// ── Bootstrap ────────────────────────
onMounted(async () => {
  const r = await api.get('/fondos');
  fondos.value = r.data;
});

function fmtMoney(n: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

const tipoLabels: Record<string, string> = {
  LP: 'Licitación Pública',
  IR: 'Invitación Restringida',
  I3: 'Invitación a 3',
  AD: 'Adjudicación Directa',
};
</script>

<template>
  <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="emit('cerrar')">
    <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900">Nuevo expediente</h2>
          <p class="text-sm text-slate-500 mt-0.5">La IA puede leer una convocatoria, entrevistarte o dejarte llenar manual.</p>
        </div>
        <button @click="emit('cerrar')" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
      </div>

      <!-- Tabs -->
      <div class="px-6 pt-4 border-b border-slate-200 bg-slate-50 flex gap-1">
        <button
          @click="tab = 'pdf'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-t-lg transition',
            tab === 'pdf' ? 'bg-white text-brand-700 border border-slate-200 border-b-white -mb-px' : 'text-slate-600 hover:text-slate-900',
          ]"
        >
          📄 Subir convocatoria (PDF)
        </button>
        <button
          @click="tab = 'chat'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-t-lg transition',
            tab === 'chat' ? 'bg-white text-brand-700 border border-slate-200 border-b-white -mb-px' : 'text-slate-600 hover:text-slate-900',
          ]"
        >
          💬 Chat con IA
        </button>
        <button
          @click="tab = 'manual'"
          :class="[
            'px-4 py-2 text-sm font-medium rounded-t-lg transition',
            tab === 'manual' ? 'bg-white text-brand-700 border border-slate-200 border-b-white -mb-px' : 'text-slate-600 hover:text-slate-900',
          ]"
        >
          ✍️ Manual
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- ============ PDF ============ -->
        <div v-if="tab === 'pdf'">
          <div v-if="!pdfExtraido">
            <div
              @dragover.prevent="dragOver = true"
              @dragleave="dragOver = false"
              @drop="onDrop"
              :class="[
                'border-2 border-dashed rounded-xl p-10 text-center transition cursor-pointer',
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50',
              ]"
              @click="($refs.pdfInput as HTMLInputElement).click()"
            >
              <input ref="pdfInput" type="file" accept="application/pdf" class="hidden" @change="(e: any) => (pdfFile = e.target.files[0])" />
              <div class="text-4xl mb-2">📄</div>
              <div class="text-slate-700 font-medium">Arrastra aquí la convocatoria u oficio</div>
              <div class="text-sm text-slate-500 mt-1">o haz clic para seleccionar (PDF, máx 20 MB)</div>
              <div v-if="pdfFile" class="mt-4 inline-block bg-brand-100 text-brand-800 px-3 py-1 rounded-lg text-sm">
                {{ pdfFile.name }} · {{ (pdfFile.size / 1024).toFixed(0) }} KB
              </div>
            </div>
            <div class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
              💡 <strong>Cómo funciona:</strong> INEXPED IA leerá el PDF y extraerá nombre, monto, fondo, tipo de adjudicación, municipio y responsable automáticamente.
            </div>
            <button
              :disabled="!pdfFile || pdfProcesando"
              @click="subirPdf"
              class="mt-4 w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition"
            >
              {{ pdfProcesando ? 'Analizando con IA…' : 'Extraer datos y crear' }}
            </button>
          </div>

          <div v-else>
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
              <div class="font-semibold text-emerald-800">
                {{ pdfExtraido.creado ? '✓ Expediente creado' : '⚠ Extracción parcial' }}
              </div>
              <div class="text-sm text-emerald-700 mt-1">{{ pdfExtraido.mensaje }}</div>
              <div v-if="pdfExtraido.campos.razonamiento" class="text-xs text-emerald-600 mt-2 italic">
                IA: {{ pdfExtraido.campos.razonamiento }}
              </div>
              <div class="text-xs text-slate-500 mt-2">Confianza: {{ (pdfExtraido.campos.confianza * 100).toFixed(0) }}% · Costo IA: ${{ pdfExtraido.costUsd.toFixed(4) }}</div>
            </div>

            <div class="space-y-3 text-sm">
              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                  <label class="block text-xs font-medium text-slate-500 mb-1">Nombre</label>
                  <input v-model="pdfExtraido.campos.nombre" class="w-full rounded-lg border-slate-300 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1">Monto (MXN)</label>
                  <input v-model.number="pdfExtraido.campos.monto" type="number" class="w-full rounded-lg border-slate-300 text-sm" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1">Fondo</label>
                  <select v-model="pdfExtraido.campos.fondo_codigo" class="w-full rounded-lg border-slate-300 text-sm">
                    <option value="">Selecciona…</option>
                    <option v-for="f in fondos" :key="f.codigo" :value="f.codigo">{{ f.codigo }} — {{ f.nombre }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1">Tipo adjudicación</label>
                  <select v-model="pdfExtraido.campos.tipo_adjudicacion" class="w-full rounded-lg border-slate-300 text-sm">
                    <option v-for="(v, k) in tipoLabels" :key="k" :value="k">{{ k }} — {{ v }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-500 mb-1">Municipio</label>
                  <input v-model="pdfExtraido.campos.municipio" class="w-full rounded-lg border-slate-300 text-sm" />
                </div>
                <div class="col-span-2">
                  <label class="block text-xs font-medium text-slate-500 mb-1">Responsable</label>
                  <input v-model="pdfExtraido.campos.responsable" class="w-full rounded-lg border-slate-300 text-sm" />
                </div>
              </div>
            </div>

            <div v-if="pdfError" class="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">{{ pdfError }}</div>

            <div class="flex gap-3 mt-5">
              <button @click="pdfExtraido = null; pdfFile = null" class="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
                Otra vez
              </button>
              <button v-if="!pdfExtraido.creado" @click="confirmarPdfManual" class="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm">
                Crear con estos datos
              </button>
              <button v-else disabled class="flex-1 py-2 bg-emerald-600 text-white font-semibold rounded-lg text-sm">
                ✓ Creado — cerrando…
              </button>
            </div>
          </div>
        </div>

        <!-- ============ CHAT ============ -->
        <div v-if="tab === 'chat'" class="flex flex-col h-[500px]">
          <div ref="chatContainer" class="flex-1 overflow-y-auto space-y-3 pb-3">
            <div v-for="(m, i) in chatHist" :key="i" :class="m.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
              <div :class="[
                'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
                m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900',
              ]">
                {{ m.content }}
              </div>
            </div>
            <div v-if="chatProcesando" class="flex justify-start">
              <div class="bg-slate-100 text-slate-500 rounded-2xl px-4 py-2 text-sm">
                <span class="inline-block animate-pulse">INEXPED IA está pensando…</span>
              </div>
            </div>
          </div>

          <div class="border-t border-slate-200 pt-3 flex gap-2">
            <input
              v-model="chatInput"
              @keyup.enter="enviarChat"
              :disabled="chatProcesando"
              placeholder="Escribe tu respuesta…"
              class="flex-1 rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200 text-sm"
            />
            <button
              @click="enviarChat"
              :disabled="chatProcesando || !chatInput.trim()"
              class="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-semibold rounded-lg text-sm"
            >
              Enviar
            </button>
          </div>
          <div class="mt-2 text-xs text-slate-400 text-center">
            💡 Escribe libremente. La IA extraerá los datos y creará el expediente al final.
          </div>
        </div>

        <!-- ============ MANUAL ============ -->
        <div v-if="tab === 'manual'" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Nombre del proyecto *</label>
            <input v-model="manual.nombre" placeholder="Ej: Pavimentación calle Reforma" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea v-model="manual.descripcion" rows="2" placeholder="Detalle del alcance…" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Monto (MXN) *</label>
              <input v-model.number="manual.monto" type="number" placeholder="3200000" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200" />
              <div class="text-xs text-slate-500 mt-1">
                Sugerencia: <span class="font-mono">{{ fmtMoney(Number(manual.monto)) }}</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Fondo *</label>
              <select v-model="manual.fondo_codigo" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200">
                <option value="">Selecciona…</option>
                <option v-for="f in fondos" :key="f.codigo" :value="f.codigo">{{ f.codigo }} — {{ f.nombre }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Tipo adjudicación</label>
              <select v-model="manual.tipo_adjudicacion" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200">
                <option value="">Auto (según monto)</option>
                <option v-for="(v, k) in tipoLabels" :key="k" :value="k">{{ k }} — {{ v }}</option>
              </select>
              <div class="text-xs text-slate-500 mt-1">≤$1.5M → AD · $1.5-4M → IR · >$4M → LP</div>
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Municipio</label>
              <input v-model="manual.municipio" placeholder="Cuernavaca" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
              <input v-model="manual.responsable" placeholder="Ing. Nombre Apellido" class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200" />
            </div>
          </div>

          <div v-if="manualError" class="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">{{ manualError }}</div>

          <button
            @click="guardarManual"
            :disabled="manualGuardando"
            class="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-semibold rounded-lg transition"
          >
            {{ manualGuardando ? 'Creando…' : 'Crear expediente' }}
          </button>
          <div class="text-xs text-slate-500 text-center">
            🤖 Al crear, la IA genera automáticamente 4 borradores de documentos base (ficha técnica, oficio, programa de obra, dictamen).
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
