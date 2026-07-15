<script setup lang="ts">
import { ref, onMounted, nextTick, useTemplateRef, computed } from 'vue';
import api from '@/lib/api';

const props = defineProps<{ id: string }>();

interface Tarea {
  id: number;
  fase_id: number;
  orden: number;
  nombre: string;
  descripcion: string;
  fundamento_legal: string;
  obligatorio: boolean;
  estado: 'pendiente' | 'completada' | 'observada' | 'no_aplica';
  observaciones: string | null;
  completada_at: string | null;
  completada_por: string | null;
  docs_count: number;
  paso_id: number | null;
  etapa_asf: number | null;
}
interface Paso {
  id: number;
  fase_id: number;
  orden_global: number;
  orden_en_fase: number;
  nombre: string;
  descripcion: string | null;
  tareas: Tarea[];
  total: number;
  completadas: number;
  progreso: number;
}
interface Fase {
  id: number;
  orden: number;
  clave: string;
  nombre: string;
  color: string;
  pasos: Paso[];
  tareas: Tarea[];
  total: number;
  completadas: number;
  progreso: number;
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
  tipo_adjudicacion: string;
  fondo_codigo: string;
  fondo_nombre: string;
}

const expediente = ref<Expediente | null>(null);
const fases = ref<Fase[]>([]);
const faseAbierta = ref<number | null>(null);
const tareaSeleccionada = ref<Tarea | null>(null);
const docsTarea = ref<any[]>([]);
const historial = ref<Array<{ role: string; content: string; created_at: string }>>([]);
const pregunta = ref('');
const cargandoChat = ref(false);
const cargandoUpload = ref(false);
const chatContainer = useTemplateRef<HTMLDivElement>('chatContainer');

// ── Cédula ASF ────────────────────────
const cedula = ref<{ documentoId: number; filename: string; contenido: string;
  cumplimientoPct: number; tareasTotal: number; tareasCompletadas: number;
  docsAnexos: number; costUsd: number } | null>(null);
const cedulaGenerando = ref(false);
const cedulaError = ref('');
const mostrarCedula = ref(false);

async function verCedulaExistente() {
  // Busca si ya hay una Cédula generada previa (tipo_doc='cedula_asf')
  if (!expediente.value) return;
  const docs = await api.get(`/expedientes/${expediente.value.id}`);
  const cedulaDoc = docs.data.documentos?.find((d: any) => d.tipo_doc === 'cedula_asf');
  if (!cedulaDoc) return;
  const r = await api.get(`/expedientes/${expediente.value.id}/documentos/${cedulaDoc.id}/contenido`);
  cedula.value = {
    documentoId: cedulaDoc.id,
    filename: r.data.filename,
    contenido: r.data.contenido,
    cumplimientoPct: r.data.metadata?.cumplimiento_pct ?? 0,
    tareasTotal: r.data.metadata?.tareas_total ?? 0,
    tareasCompletadas: r.data.metadata?.tareas_completadas ?? 0,
    docsAnexos: r.data.metadata?.docs_anexos ?? 0,
    costUsd: r.data.metadata?.costUsd ?? 0,
  };
}

async function generarCedula() {
  if (!expediente.value) return;
  cedulaGenerando.value = true;
  cedulaError.value = '';
  try {
    const r = await api.post(`/expedientes/${expediente.value.id}/cedula`);
    cedula.value = r.data;
    mostrarCedula.value = true;
    await cargar();
  } catch (e: any) {
    cedulaError.value = e.response?.data?.error ?? e.message;
  } finally {
    cedulaGenerando.value = false;
  }
}

function descargarCedula() {
  if (!cedula.value) return;
  const blob = new Blob([cedula.value.contenido], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cedula.value.filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function cargar() {
  const [expR, fasesR, histR] = await Promise.all([
    api.get(`/expedientes/${props.id}`),
    api.get(`/expedientes/${props.id}/fases`),
    api.get(`/expedientes/${props.id}/copiloto/historial`),
  ]);
  expediente.value = expR.data;
  fases.value = fasesR.data;
  historial.value = histR.data;
  // Abre la primera fase que no esté 100%
  if (faseAbierta.value === null) {
    const primeraIncompleta = fases.value.find((f) => f.progreso < 100);
    faseAbierta.value = (primeraIncompleta ?? fases.value[0])?.id ?? null;
  }
  // Si está cerrado, intenta recuperar la Cédula ya generada
  if (expediente.value?.estado === 'cerrado') {
    verCedulaExistente().catch(() => {});
  }
  await nextTick();
  scrollChat();
}

function scrollChat() {
  const c = chatContainer.value;
  if (c) c.scrollTop = c.scrollHeight;
}

onMounted(cargar);

async function toggleFase(faseId: number) {
  faseAbierta.value = faseAbierta.value === faseId ? null : faseId;
}

async function verTarea(t: Tarea) {
  tareaSeleccionada.value = t;
  const r = await api.get(`/tareas/${t.id}/documentos`);
  docsTarea.value = r.data;
}

function cerrarTarea() {
  tareaSeleccionada.value = null;
  docsTarea.value = [];
}

async function cambiarEstadoTarea(tarea: Tarea, nuevoEstado: string) {
  await api.patch(`/tareas/${tarea.id}`, { estado: nuevoEstado });
  await cargar();
  if (tareaSeleccionada.value?.id === tarea.id) {
    tareaSeleccionada.value = { ...tarea, estado: nuevoEstado as any };
  }
}

async function uploadFileATarea(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file || !tareaSeleccionada.value) return;
  cargandoUpload.value = true;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('expediente_tarea_id', String(tareaSeleccionada.value.id));
  try {
    await api.post(`/documentos/${props.id}/upload`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Recarga docs de la tarea + fases (para reflejar docs_count)
    const r = await api.get(`/tareas/${tareaSeleccionada.value.id}/documentos`);
    docsTarea.value = r.data;
    await cargar();
  } finally {
    cargandoUpload.value = false;
    (ev.target as HTMLInputElement).value = '';
  }
}

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
    historial.value.push({ role: 'assistant', content: r.data.respuesta, created_at: new Date().toISOString() });
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

const progresoTotal = computed(() => {
  if (!fases.value.length) return 0;
  const total = fases.value.reduce((s, f) => s + f.total, 0);
  const done = fases.value.reduce((s, f) => s + f.completadas, 0);
  return total === 0 ? 0 : Math.round((done / total) * 100);
});

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}

const estadoLabel: Record<string, string> = {
  planeacion: 'Planeación',
  autorizado: 'Autorizado',
  ejecucion: 'Ejecución',
  cierre: 'Cierre',
  cerrado: 'Cerrado',
};

const tipoAdjLabel: Record<string, string> = {
  LP: 'Licitación Pública',
  IR: 'Invitación Restringida',
  I3: 'Invitación a 3',
  AD: 'Adjudicación Directa',
};

const estadoTareaLabel: Record<string, string> = {
  pendiente: 'Pendiente',
  completada: 'Completada',
  observada: 'Con observaciones',
  no_aplica: 'No aplica',
};

const iconoFase: Record<string, string> = {
  info: '📋',
  calendar: '📅',
  dollar: '💰',
  handshake: '🤝',
  briefcase: '💼',
  archive: '📦',
};
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
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <span class="font-mono text-lg text-brand-700 font-semibold">{{ expediente.folio }}</span>
            <span :class="'badge badge-' + expediente.estado">{{ estadoLabel[expediente.estado] }}</span>
            <span v-if="expediente.tipo_adjudicacion" class="badge bg-slate-100 text-slate-700">
              {{ tipoAdjLabel[expediente.tipo_adjudicacion] || expediente.tipo_adjudicacion }}
            </span>
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

    <!-- ==================== RESULTADO FINAL (solo si cerrado) ==================== -->
    <div v-if="expediente.estado === 'cerrado'" class="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white overflow-hidden shadow-sm">
      <div class="p-6 border-b border-emerald-100 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white text-3xl shrink-0">✓</div>
        <div class="flex-1">
          <div class="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Resultado final</div>
          <h2 class="text-2xl font-bold text-slate-900">Expediente cerrado y listo para auditoría ASF</h2>
          <p class="text-sm text-slate-600 mt-1">Todas las tareas de las 6 fases fueron cumplidas y documentadas conforme al marco normativo GASFED.</p>
        </div>
      </div>

      <!-- Métricas -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-emerald-100 divide-x divide-emerald-100">
        <div class="p-4 text-center">
          <div class="text-xs text-slate-500 uppercase tracking-wider">Cumplimiento</div>
          <div class="text-2xl font-bold text-emerald-700 mt-1">{{ progresoTotal }}%</div>
        </div>
        <div class="p-4 text-center">
          <div class="text-xs text-slate-500 uppercase tracking-wider">Tareas cumplidas</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">
            {{ fases.reduce((s, f) => s + f.completadas, 0) }}/{{ fases.reduce((s, f) => s + f.total, 0) }}
          </div>
        </div>
        <div class="p-4 text-center">
          <div class="text-xs text-slate-500 uppercase tracking-wider">Documentos anexos</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">{{ cedula?.docsAnexos ?? '—' }}</div>
        </div>
        <div class="p-4 text-center">
          <div class="text-xs text-slate-500 uppercase tracking-wider">Monto ejercido</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">{{ fmtMoney(expediente.monto) }}</div>
        </div>
      </div>

      <!-- CTA Cédula ASF -->
      <div class="p-6">
        <div v-if="!cedula" class="flex flex-col md:flex-row items-center gap-4">
          <div class="flex-1">
            <div class="text-sm font-semibold text-slate-800 mb-1">🏛 Cédula Consolidada de Rendición de Cuentas ASF</div>
            <div class="text-sm text-slate-600">Documento único que se entrega al auditor. INEXPED IA consolida las 6 fases y los {{ fases.reduce((s, f) => s + f.total, 0) }} elementos del expediente en un solo archivo formal, con fundamentos legales citados.</div>
          </div>
          <button
            @click="generarCedula"
            :disabled="cedulaGenerando"
            class="whitespace-nowrap px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow-sm transition"
          >
            {{ cedulaGenerando ? 'Generando…' : 'Generar Cédula ASF' }}
          </button>
        </div>

        <div v-else>
          <div class="flex flex-col md:flex-row items-start md:items-center gap-4 mb-4">
            <div class="flex-1">
              <div class="text-sm font-semibold text-emerald-800 mb-1">✓ Cédula Consolidada generada</div>
              <div class="text-xs text-slate-500 font-mono">{{ cedula.filename }}</div>
            </div>
            <div class="flex gap-2">
              <button @click="mostrarCedula = !mostrarCedula" class="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-sm rounded-lg">
                {{ mostrarCedula ? 'Ocultar' : 'Ver' }}
              </button>
              <button @click="descargarCedula" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg">
                Descargar (.md)
              </button>
              <button @click="generarCedula" :disabled="cedulaGenerando" class="px-4 py-2 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm rounded-lg">
                Regenerar
              </button>
            </div>
          </div>

          <!-- Contenido inline de la cédula -->
          <div v-if="mostrarCedula" class="mt-4 p-6 bg-white border border-slate-200 rounded-lg max-h-[70vh] overflow-y-auto whitespace-pre-wrap text-sm text-slate-800 leading-relaxed font-serif">{{ cedula.contenido }}</div>
        </div>

        <div v-if="cedulaError" class="mt-3 bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">{{ cedulaError }}</div>
      </div>
    </div>

    <!-- Progreso global -->
    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold text-slate-700">Progreso del expediente</div>
        <div class="text-sm font-bold text-brand-700">{{ progresoTotal }}%</div>
      </div>
      <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full transition-all"
             :style="{ width: progresoTotal + '%' }"></div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left col: 6 fases acordeón -->
      <div class="lg:col-span-2 space-y-3">
        <div v-for="f in fases" :key="f.id" class="card overflow-hidden">
          <!-- Cabecera de la fase (clickable) -->
          <button @click="toggleFase(f.id)"
                  class="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                 :style="{ background: f.color + '20', color: f.color }">
              {{ iconoFase[f.icono || 'info'] || '📋' }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-xs font-mono text-slate-500 font-semibold">{{ f.clave }}</span>
                <span class="font-semibold text-slate-900 truncate">{{ f.nombre }}</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="h-1.5 flex-1 max-w-xs bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all" :style="{ width: f.progreso + '%', backgroundColor: f.color }"></div>
                </div>
                <span class="text-xs text-slate-500 font-medium whitespace-nowrap">
                  {{ f.completadas }}/{{ f.total }} · {{ f.progreso }}%
                </span>
              </div>
            </div>
            <svg :class="{ 'rotate-180': faseAbierta === f.id }" class="w-5 h-5 text-slate-400 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </button>

          <!-- Contenido de la fase (pasos > tareas) -->
          <div v-if="faseAbierta === f.id" class="border-t border-slate-100">
            <div v-for="p in f.pasos" :key="p.id" class="border-b border-slate-100 last:border-b-0">
              <!-- Cabecera del paso -->
              <div class="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50">
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                     :style="{ background: f.color }">
                  {{ p.orden_global }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-slate-800">{{ p.nombre }}</div>
                  <div v-if="p.descripcion" class="text-xs text-slate-500 truncate">{{ p.descripcion }}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <div class="h-1 w-16 bg-slate-200 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" :style="{ width: p.progreso + '%', backgroundColor: f.color }"></div>
                  </div>
                  <span class="text-xs text-slate-500 font-mono whitespace-nowrap">{{ p.completadas }}/{{ p.total }}</span>
                </div>
              </div>

              <!-- Tareas del paso -->
              <div v-for="t in p.tareas" :key="t.id"
                   class="flex items-center gap-3 pl-14 pr-4 py-2.5 hover:bg-brand-50/40 cursor-pointer border-t border-slate-50"
                   @click="verTarea(t)">
                <div class="shrink-0">
                  <div v-if="t.estado === 'completada'" class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px]">✓</div>
                  <div v-else-if="t.estado === 'observada'" class="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center text-white text-[10px]">!</div>
                  <div v-else-if="t.estado === 'no_aplica'" class="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-white text-[10px]">—</div>
                  <div v-else class="w-5 h-5 rounded-full border-2 border-slate-300"></div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-slate-800 truncate">{{ t.nombre }}</div>
                </div>
                <div v-if="t.etapa_asf" class="text-[10px] text-slate-400 font-mono shrink-0 hidden md:block">
                  ASF·{{ t.etapa_asf }}
                </div>
                <div v-if="t.docs_count > 0" class="text-xs text-brand-700 font-medium shrink-0">
                  {{ t.docs_count }} 📎
                </div>
              </div>
              <div v-if="p.tareas.length === 0" class="pl-14 pr-4 py-3 text-xs text-slate-400 italic border-t border-slate-50">
                (sin tareas específicas para este tipo de expediente)
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right col: chat IA -->
      <div class="card flex flex-col h-[calc(100vh-16rem)] sticky top-24">
        <div class="border-b border-slate-100 p-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center text-white text-sm font-bold">IA</div>
            <div>
              <div class="font-semibold text-slate-900 text-sm">Copiloto INEXPED</div>
              <div class="text-xs text-slate-500">Motor INEXPED IA · RAG normativo</div>
            </div>
          </div>
        </div>
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="!historial.length" class="text-center py-8">
            <div class="text-4xl mb-3">💬</div>
            <div class="text-slate-500 text-sm">Pregúntame sobre este expediente</div>
            <div class="text-slate-400 text-xs mt-2">Ej: "¿Qué tareas de la fase III están pendientes?"</div>
          </div>
          <div v-for="(m, i) in historial" :key="i" class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm prose-msg whitespace-pre-wrap"
                 :class="m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'">
              {{ m.content }}
            </div>
          </div>
          <div v-if="cargandoChat" class="flex justify-start">
            <div class="bg-slate-100 rounded-2xl px-4 py-2.5 text-sm text-slate-500 italic">Consultando IA…</div>
          </div>
        </div>
        <form @submit.prevent="preguntar" class="border-t border-slate-100 p-3 flex gap-2">
          <label for="copiloto-input" class="sr-only">Pregunta al copiloto</label>
          <input id="copiloto-input" v-model="pregunta" placeholder="Escribe tu pregunta…" :disabled="cargandoChat"
                 class="flex-1 rounded-lg border-slate-300 text-sm focus:border-brand-500 focus:ring focus:ring-brand-200" />
          <button type="submit" :disabled="cargandoChat || !pregunta.trim()" class="btn-primary text-sm py-2 px-3">Enviar</button>
        </form>
      </div>
    </div>

    <!-- Modal detalle de tarea -->
    <div v-if="tareaSeleccionada" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-20 flex items-center justify-center p-4" @click.self="cerrarTarea">
      <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div class="p-6 border-b border-slate-100">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="text-xs text-slate-500 font-mono mb-1">
                Fase {{ fases.find((f) => f.id === tareaSeleccionada?.fase_id)?.clave }}.{{ tareaSeleccionada.orden }}
              </div>
              <h3 class="text-lg font-bold text-slate-900">{{ tareaSeleccionada.nombre }}</h3>
              <p class="text-sm text-slate-600 mt-1">{{ tareaSeleccionada.descripcion }}</p>
              <p v-if="tareaSeleccionada.fundamento_legal" class="text-xs text-slate-500 mt-2 italic">
                Fundamento: {{ tareaSeleccionada.fundamento_legal }}
              </p>
            </div>
            <button @click="cerrarTarea" class="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
          </div>
        </div>

        <div class="p-6 overflow-y-auto flex-1 space-y-6">
          <!-- Estado -->
          <div>
            <div class="text-sm font-semibold text-slate-700 mb-2">Estado</div>
            <div class="flex flex-wrap gap-2">
              <button v-for="s in ['pendiente','completada','observada','no_aplica']" :key="s"
                      @click="cambiarEstadoTarea(tareaSeleccionada!, s)"
                      class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                      :class="tareaSeleccionada.estado === s
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'">
                {{ estadoTareaLabel[s] }}
              </button>
            </div>
            <div v-if="tareaSeleccionada.completada_at" class="text-xs text-slate-500 mt-2">
              Completada el {{ fmtDate(tareaSeleccionada.completada_at) }} por {{ tareaSeleccionada.completada_por }}
            </div>
          </div>

          <!-- Documentos -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-semibold text-slate-700">Documentos ({{ docsTarea.length }})</div>
              <label class="btn-primary text-xs py-1.5 cursor-pointer">
                <span v-if="!cargandoUpload">+ Subir documento</span>
                <span v-else>Procesando IA…</span>
                <input type="file" class="hidden" @change="uploadFileATarea" :disabled="cargandoUpload" accept=".pdf,.txt" />
              </label>
            </div>
            <div v-if="!docsTarea.length" class="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-lg">
              Sin documentos aún.<br>La IA analizará el PDF al subirlo.
            </div>
            <div v-else class="space-y-2">
              <div v-for="d in docsTarea" :key="d.id" class="flex items-start gap-3 p-3 border border-slate-200 rounded-lg">
                <div class="w-8 h-8 bg-brand-100 rounded flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">PDF</div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-slate-900 truncate">{{ d.filename }}</div>
                  <div class="flex items-center gap-2 mt-1 flex-wrap">
                    <span class="badge bg-brand-100 text-brand-800">{{ d.tipo_doc }}</span>
                    <span v-if="d.metadata?.monto_total" class="text-xs text-slate-500">
                      {{ fmtMoney(d.metadata.monto_total) }}
                    </span>
                    <span v-if="d.metadata?.fecha" class="text-xs text-slate-500">· {{ d.metadata.fecha }}</span>
                    <span v-if="d.metadata?.rfc_emisor" class="text-xs text-slate-500">· RFC {{ d.metadata.rfc_emisor }}</span>
                  </div>
                  <div v-if="d.ai_summary" class="text-xs text-slate-600 mt-1.5 italic">🤖 {{ d.ai_summary }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
