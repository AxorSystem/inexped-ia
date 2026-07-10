<script setup lang="ts">
import { ref, onMounted, nextTick, useTemplateRef } from 'vue';
import api from '@/lib/api';

const props = defineProps<{ id: string }>();

interface Documento {
  id: number;
  filename: string;
  tipo_doc: string;
  metadata: any;
  ai_summary: string;
  uploaded_at: string;
}

interface Expediente {
  id: number;
  folio: string;
  nombre: string;
  descripcion: string;
  monto: number;
  municipio: string;
  responsable: string;
  estado: string;
  fondo_codigo: string;
  fondo_nombre: string;
  documentos: Documento[];
}

const expediente = ref<Expediente | null>(null);
const faltantes = ref<any>(null);
const historial = ref<Array<{ role: string; content: string; created_at: string }>>([]);
const pregunta = ref('');
const cargandoChat = ref(false);
const cargandoUpload = ref(false);
const chatContainer = useTemplateRef<HTMLDivElement>('chatContainer');

async function cargar() {
  const [expR, falR, histR] = await Promise.all([
    api.get(`/expedientes/${props.id}`),
    api.get(`/expedientes/${props.id}/faltantes`),
    api.get(`/expedientes/${props.id}/copiloto/historial`),
  ]);
  expediente.value = expR.data;
  faltantes.value = falR.data;
  historial.value = histR.data;
  await nextTick();
  scrollChat();
}

function scrollChat() {
  const c = chatContainer.value;
  if (c) c.scrollTop = c.scrollHeight;
}

onMounted(cargar);

async function preguntar() {
  const q = pregunta.value.trim();
  if (!q || cargandoChat.value) return;
  cargandoChat.value = true;
  historial.value.push({ role: 'user', content: q, created_at: new Date().toISOString() });
  pregunta.value = '';
  await nextTick();
  scrollChat();
  try {
    const r = await api.post(`/expedientes/${props.id}/copiloto`, { pregunta: q });
    historial.value.push({
      role: 'assistant',
      content: r.data.respuesta,
      created_at: new Date().toISOString(),
    });
    await nextTick();
    scrollChat();
  } catch (e: any) {
    historial.value.push({
      role: 'assistant',
      content: `❌ Error: ${e.response?.data?.error || e.message}`,
      created_at: new Date().toISOString(),
    });
  } finally {
    cargandoChat.value = false;
  }
}

async function uploadFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  cargandoUpload.value = true;
  const fd = new FormData();
  fd.append('file', file);
  try {
    await api.post(`/documentos/${props.id}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await cargar();
  } finally {
    cargandoUpload.value = false;
    (ev.target as HTMLInputElement).value = '';
  }
}

async function avanzar() {
  try {
    await api.post(`/expedientes/${props.id}/avanzar`);
    await cargar();
  } catch (e: any) {
    alert(e.response?.data?.error || 'Error al avanzar');
  }
}

const estadoLabel: Record<string, string> = {
  planeacion: 'Planeación',
  autorizado: 'Autorizado',
  ejecucion: 'Ejecución',
  cierre: 'Cierre',
  cerrado: 'Cerrado',
};

const orden = ['planeacion', 'autorizado', 'ejecucion', 'cierre', 'cerrado'];

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
}
</script>

<template>
  <div v-if="!expediente" class="max-w-7xl mx-auto px-6 py-16 text-center text-slate-500">Cargando expediente…</div>
  <div v-else class="max-w-7xl mx-auto px-6 py-8">
    <!-- Header -->
    <div class="mb-6">
      <router-link to="/" class="text-brand-700 text-sm hover:text-brand-900 flex items-center gap-1 mb-3">
        ← Panel de expedientes
      </router-link>
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <span class="font-mono text-lg text-brand-700 font-semibold">{{ expediente.folio }}</span>
            <span :class="'badge badge-' + expediente.estado">{{ estadoLabel[expediente.estado] }}</span>
          </div>
          <h1 class="text-2xl font-bold text-slate-900 max-w-3xl">{{ expediente.nombre }}</h1>
          <p class="text-slate-600 mt-1">{{ expediente.municipio }} · {{ expediente.responsable }}</p>
        </div>
        <div class="text-right">
          <div class="text-slate-500 text-sm">Monto autorizado</div>
          <div class="text-2xl font-bold text-slate-900">{{ fmtMoney(expediente.monto) }}</div>
          <div class="text-xs text-slate-500 mt-1">{{ expediente.fondo_codigo }} · {{ expediente.fondo_nombre }}</div>
        </div>
      </div>
    </div>

    <!-- Progress -->
    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-semibold text-slate-700">Avance del expediente</div>
        <button v-if="expediente.estado !== 'cerrado' && faltantes?.puede_avanzar" @click="avanzar" class="btn-primary text-sm py-1.5">
          Avanzar a {{ estadoLabel[orden[orden.indexOf(expediente.estado) + 1]] }} →
        </button>
        <button v-else-if="expediente.estado !== 'cerrado'" disabled class="btn-primary text-sm py-1.5 opacity-50">
          Bloqueado (hay faltantes)
        </button>
      </div>
      <div class="flex items-center gap-2">
        <template v-for="(s, i) in orden.slice(0, 4)" :key="s">
          <div class="flex-1">
            <div class="text-xs font-medium mb-1.5"
              :class="orden.indexOf(expediente.estado) >= i ? 'text-brand-700' : 'text-slate-400'">
              {{ estadoLabel[s] }}
            </div>
            <div class="h-2 rounded-full"
              :class="orden.indexOf(expediente.estado) >= i ? 'bg-brand-600' : 'bg-slate-200'"></div>
          </div>
        </template>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left col: docs + faltantes -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Faltantes -->
        <div v-if="faltantes && faltantes.faltantes.length" class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-slate-900">
              🔍 Detección IA de faltantes
              <span class="text-red-600">({{ faltantes.faltantes.length }})</span>
            </h3>
          </div>
          <div class="space-y-2">
            <div v-for="f in faltantes.faltantes" :key="f.tipo + f.estado"
                 class="border rounded-lg p-3 flex items-start gap-3"
                 :class="f.bloqueante ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'">
              <div class="text-2xl">{{ f.bloqueante ? '⛔' : '⚠️' }}</div>
              <div class="flex-1">
                <div class="font-medium text-sm">{{ f.descripcion }}</div>
                <div class="text-xs mt-0.5" :class="f.bloqueante ? 'text-red-700' : 'text-yellow-700'">
                  Etapa: {{ estadoLabel[f.estado] }} · {{ f.bloqueante ? 'Bloquea avance' : 'Recordatorio' }}
                </div>
              </div>
              <span class="badge bg-white text-slate-700 border border-slate-200">{{ f.tipo }}</span>
            </div>
          </div>
        </div>
        <div v-else-if="faltantes" class="card p-5 border-emerald-200 bg-emerald-50">
          <div class="flex items-center gap-3">
            <div class="text-2xl">✅</div>
            <div>
              <div class="font-semibold text-emerald-900">Expediente completo para la etapa actual</div>
              <div class="text-sm text-emerald-700">No hay faltantes bloqueantes. Puede avanzar al siguiente estado.</div>
            </div>
          </div>
        </div>

        <!-- Documentos -->
        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-slate-900">📄 Documentos ({{ expediente.documentos.length }})</h3>
            <label class="btn-primary text-sm py-1.5 cursor-pointer">
              <span v-if="!cargandoUpload">+ Subir documento</span>
              <span v-else>Procesando IA…</span>
              <input type="file" class="hidden" @change="uploadFile" :disabled="cargandoUpload" accept=".pdf,.txt" />
            </label>
          </div>
          <div v-if="!expediente.documentos.length" class="text-center py-10 text-slate-500">
            Sin documentos aún. Sube un PDF y la IA lo clasificará automáticamente.
          </div>
          <div v-else class="divide-y divide-slate-100">
            <div v-for="d in expediente.documentos" :key="d.id" class="py-3 flex items-start gap-4">
              <div class="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                PDF
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-slate-900 truncate">{{ d.filename }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="badge bg-brand-100 text-brand-800">{{ d.tipo_doc }}</span>
                  <span v-if="d.metadata?.monto_total" class="text-xs text-slate-500">
                    {{ fmtMoney(d.metadata.monto_total) }}
                  </span>
                  <span v-if="d.metadata?.fecha" class="text-xs text-slate-500">· {{ d.metadata.fecha }}</span>
                  <span v-if="d.metadata?.rfc_emisor" class="text-xs text-slate-500">· RFC {{ d.metadata.rfc_emisor }}</span>
                </div>
                <div v-if="d.ai_summary" class="text-sm text-slate-600 mt-1.5 italic">
                  🤖 {{ d.ai_summary }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right col: chat IA -->
      <div class="card flex flex-col h-[calc(100vh-16rem)] sticky top-24">
        <div class="border-b border-slate-100 p-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center text-white text-sm font-bold">
              IA
            </div>
            <div>
              <div class="font-semibold text-slate-900 text-sm">Copiloto INEXPED</div>
              <div class="text-xs text-slate-500">Basado en Claude Sonnet 4.5 · RAG sobre documentos</div>
            </div>
          </div>
        </div>

        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="!historial.length" class="text-center py-8">
            <div class="text-4xl mb-3">💬</div>
            <div class="text-slate-500 text-sm">Pregúntame sobre este expediente</div>
            <div class="text-slate-400 text-xs mt-2">Ej: "¿Qué documentos me faltan?"</div>
          </div>
          <div v-for="(m, i) in historial" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm prose-msg whitespace-pre-wrap"
                 :class="m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'">
              {{ m.content }}
            </div>
          </div>
          <div v-if="cargandoChat" class="flex justify-start">
            <div class="bg-slate-100 rounded-2xl px-4 py-2.5 text-sm text-slate-500 italic">
              Consultando IA…
            </div>
          </div>
        </div>

        <form @submit.prevent="preguntar" class="border-t border-slate-100 p-3 flex gap-2">
          <input v-model="pregunta" placeholder="Escribe tu pregunta…" :disabled="cargandoChat"
                 class="flex-1 rounded-lg border-slate-300 text-sm focus:border-brand-500 focus:ring focus:ring-brand-200" />
          <button type="submit" :disabled="cargandoChat || !pregunta.trim()" class="btn-primary text-sm py-2 px-3">
            Enviar
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
