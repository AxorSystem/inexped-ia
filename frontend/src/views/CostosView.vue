<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/lib/api';

interface Detalle {
  id: number;
  ts: string;
  expediente_id: number | null;
  expediente_folio: string | null;
  expediente_nombre: string | null;
  accion: string;
  modelo: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number;
  actor: string | null;
  meta: any;
}

interface Datos {
  total: { operaciones: number; cost_usd: number };
  por_accion: Array<{ accion: string; n: number; cost_usd: number }>;
  por_modelo: Array<{ modelo: string; n: number; cost_usd: number }>;
  por_dia: Array<{ dia: string; n: number; cost_usd: number }>;
  por_expediente: Array<{ expediente_id: number | null; folio: string | null; nombre: string | null; n: number; cost_usd: number }>;
  detalle: Detalle[];
}

const datos = ref<Datos | null>(null);
const cargando = ref(true);

const desde = ref('');
const hasta = ref('');
const accion = ref('');
const expedienteId = ref('');

async function cargar() {
  cargando.value = true;
  try {
    const params: Record<string, string> = {};
    if (desde.value) params.desde = desde.value;
    if (hasta.value) params.hasta = hasta.value;
    if (accion.value) params.accion = accion.value;
    if (expedienteId.value) params.expediente_id = expedienteId.value;
    const r = await api.get('/admin/costos', { params });
    datos.value = r.data;
  } finally {
    cargando.value = false;
  }
}

function reset() {
  desde.value = '';
  hasta.value = '';
  accion.value = '';
  expedienteId.value = '';
  cargar();
}

onMounted(cargar);

const totalMxn = computed(() => (datos.value?.total.cost_usd ?? 0) * 20);

function fmtUsd(n: number) {
  return `$${n.toFixed(4)} USD`;
}
function fmtMxn(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n);
}
function fmtTs(t: string) {
  return new Date(t).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtDia(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

const accionLabels: Record<string, { label: string; color: string; icon: string }> = {
  copiloto: { label: 'Copiloto (RAG)', color: 'bg-indigo-100 text-indigo-800', icon: '💬' },
  clasificar_doc: { label: 'Clasificar doc', color: 'bg-emerald-100 text-emerald-800', icon: '🏷️' },
  generar_draft: { label: 'Generar borrador', color: 'bg-orange-100 text-orange-800', icon: '✍️' },
  extraer_pdf: { label: 'Extraer de PDF', color: 'bg-blue-100 text-blue-800', icon: '📄' },
  extraer_chat: { label: 'Extraer chat', color: 'bg-cyan-100 text-cyan-800', icon: '🗨️' },
  embeddings: { label: 'Embeddings', color: 'bg-slate-100 text-slate-700', icon: '🔗' },
};

function accionInfo(a: string) {
  return accionLabels[a] ?? { label: a, color: 'bg-slate-100 text-slate-700', icon: '•' };
}

// Máximo del bar chart por día (últimos 30 días)
const barMax = computed(() => {
  const arr = datos.value?.por_dia ?? [];
  return arr.length ? Math.max(...arr.map((d) => d.cost_usd)) : 1;
});
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="mb-8 flex items-start justify-between gap-4">
      <div>
        <div class="text-xs font-mono text-slate-500 mb-1">SOLO OWNER · Vista interna</div>
        <h1 class="text-3xl font-bold text-slate-900">Costos de operación IA</h1>
        <p class="text-slate-600 mt-1">Registro de cada llamada a modelos y su costo individual.</p>
      </div>
      <router-link to="/" class="text-sm text-brand-700 hover:text-brand-900">← Volver al panel</router-link>
    </div>

    <!-- KPIs -->
    <div v-if="datos" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="card p-5">
        <div class="text-slate-500 text-xs font-medium uppercase tracking-wide">Total operaciones</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">{{ datos.total.operaciones }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-xs font-medium uppercase tracking-wide">Costo total (USD)</div>
        <div class="text-3xl font-bold text-emerald-700 mt-1">${{ datos.total.cost_usd.toFixed(4) }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-xs font-medium uppercase tracking-wide">Costo total (MXN ~$20)</div>
        <div class="text-3xl font-bold text-emerald-700 mt-1">{{ fmtMxn(totalMxn) }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-xs font-medium uppercase tracking-wide">Promedio por operación</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">
          ${{ (datos.total.operaciones ? datos.total.cost_usd / datos.total.operaciones : 0).toFixed(5) }}
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card p-4 mb-6 flex flex-wrap gap-3 items-end">
      <div>
        <label class="block text-xs font-medium text-slate-500 mb-1">Desde</label>
        <input v-model="desde" type="date" class="rounded-lg border-slate-300 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
        <input v-model="hasta" type="date" class="rounded-lg border-slate-300 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-500 mb-1">Acción</label>
        <select v-model="accion" class="rounded-lg border-slate-300 text-sm">
          <option value="">Todas</option>
          <option value="copiloto">Copiloto</option>
          <option value="clasificar_doc">Clasificar doc</option>
          <option value="generar_draft">Generar borrador</option>
          <option value="extraer_pdf">Extraer de PDF</option>
          <option value="extraer_chat">Extraer chat</option>
          <option value="embeddings">Embeddings</option>
        </select>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-500 mb-1">Expediente ID</label>
        <input v-model="expedienteId" type="number" placeholder="id" class="rounded-lg border-slate-300 text-sm w-24" />
      </div>
      <button @click="cargar" class="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg">Filtrar</button>
      <button @click="reset" class="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-sm rounded-lg">Limpiar</button>
    </div>

    <div v-if="cargando" class="text-center py-16 text-slate-500">Cargando…</div>

    <div v-else-if="datos" class="space-y-6">
      <!-- Costo por día -->
      <div class="card p-5">
        <h2 class="text-sm font-semibold text-slate-700 mb-4">Costo por día</h2>
        <div v-if="!datos.por_dia.length" class="text-sm text-slate-400 text-center py-4">Sin datos</div>
        <div v-else class="space-y-2">
          <div v-for="d in datos.por_dia" :key="d.dia" class="flex items-center gap-3">
            <div class="w-16 text-xs text-slate-500 font-mono">{{ fmtDia(d.dia) }}</div>
            <div class="flex-1 h-6 bg-slate-100 rounded overflow-hidden relative">
              <div class="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded"
                   :style="{ width: (d.cost_usd / barMax * 100) + '%' }"></div>
              <div class="absolute inset-0 flex items-center px-2 text-xs font-medium text-slate-800">
                ${{ d.cost_usd.toFixed(4) }} · {{ d.n }} op
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Grid: por acción y por modelo -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card p-5">
          <h2 class="text-sm font-semibold text-slate-700 mb-4">Por acción</h2>
          <table v-if="datos.por_accion.length" class="w-full text-sm">
            <thead>
              <tr class="text-xs text-slate-500 border-b border-slate-100">
                <th class="text-left py-2">Acción</th>
                <th class="text-right py-2"># op</th>
                <th class="text-right py-2">USD</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in datos.por_accion" :key="a.accion" class="border-b border-slate-50 last:border-0">
                <td class="py-2">
                  <span :class="'inline-block px-2 py-0.5 rounded text-xs ' + accionInfo(a.accion).color">
                    {{ accionInfo(a.accion).icon }} {{ accionInfo(a.accion).label }}
                  </span>
                </td>
                <td class="text-right text-slate-600">{{ a.n }}</td>
                <td class="text-right font-mono font-medium">${{ a.cost_usd.toFixed(4) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-sm text-slate-400 text-center py-4">Sin datos</div>
        </div>

        <div class="card p-5">
          <h2 class="text-sm font-semibold text-slate-700 mb-4">Por modelo</h2>
          <table v-if="datos.por_modelo.length" class="w-full text-sm">
            <thead>
              <tr class="text-xs text-slate-500 border-b border-slate-100">
                <th class="text-left py-2">Modelo</th>
                <th class="text-right py-2"># op</th>
                <th class="text-right py-2">USD</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in datos.por_modelo" :key="m.modelo" class="border-b border-slate-50 last:border-0">
                <td class="py-2 font-mono text-xs">{{ m.modelo }}</td>
                <td class="text-right text-slate-600">{{ m.n }}</td>
                <td class="text-right font-mono font-medium">${{ m.cost_usd.toFixed(4) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="text-sm text-slate-400 text-center py-4">Sin datos</div>
        </div>
      </div>

      <!-- Por expediente -->
      <div class="card p-5">
        <h2 class="text-sm font-semibold text-slate-700 mb-4">Por expediente</h2>
        <table v-if="datos.por_expediente.length" class="w-full text-sm">
          <thead>
            <tr class="text-xs text-slate-500 border-b border-slate-100">
              <th class="text-left py-2">Folio</th>
              <th class="text-left py-2">Nombre</th>
              <th class="text-right py-2"># op</th>
              <th class="text-right py-2">USD</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in datos.por_expediente" :key="e.expediente_id ?? -1" class="border-b border-slate-50 last:border-0">
              <td class="py-2 font-mono text-xs text-brand-700">
                <router-link v-if="e.expediente_id" :to="`/expedientes/${e.expediente_id}`" class="hover:underline">
                  {{ e.folio ?? '—' }}
                </router-link>
                <span v-else class="text-slate-400">(sin expediente)</span>
              </td>
              <td class="py-2 text-slate-700 truncate max-w-md">{{ e.nombre ?? '—' }}</td>
              <td class="text-right text-slate-600">{{ e.n }}</td>
              <td class="text-right font-mono font-medium">${{ e.cost_usd.toFixed(4) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="text-sm text-slate-400 text-center py-4">Sin datos</div>
      </div>

      <!-- Detalle live -->
      <div class="card overflow-hidden">
        <div class="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-slate-700">Últimas operaciones ({{ datos.detalle.length }})</h2>
          <button @click="cargar" class="text-xs text-brand-700 hover:text-brand-900">↻ Refrescar</button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr class="text-xs text-slate-500 uppercase tracking-wider">
                <th class="text-left px-4 py-2">Fecha/hora</th>
                <th class="text-left px-4 py-2">Acción</th>
                <th class="text-left px-4 py-2">Modelo</th>
                <th class="text-left px-4 py-2">Expediente</th>
                <th class="text-left px-4 py-2">Actor</th>
                <th class="text-right px-4 py-2">Input tk</th>
                <th class="text-right px-4 py-2">Output tk</th>
                <th class="text-right px-4 py-2">USD</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="d in datos.detalle" :key="d.id" class="hover:bg-slate-50/50">
                <td class="px-4 py-2 text-xs text-slate-500 whitespace-nowrap font-mono">{{ fmtTs(d.ts) }}</td>
                <td class="px-4 py-2">
                  <span :class="'inline-block px-2 py-0.5 rounded text-xs ' + accionInfo(d.accion).color">
                    {{ accionInfo(d.accion).icon }} {{ accionInfo(d.accion).label }}
                  </span>
                </td>
                <td class="px-4 py-2 font-mono text-xs text-slate-500">{{ d.modelo ?? '—' }}</td>
                <td class="px-4 py-2 text-xs">
                  <router-link v-if="d.expediente_id" :to="`/expedientes/${d.expediente_id}`" class="text-brand-700 font-mono hover:underline">
                    {{ d.expediente_folio ?? '#' + d.expediente_id }}
                  </router-link>
                  <span v-else class="text-slate-400">—</span>
                </td>
                <td class="px-4 py-2 text-xs text-slate-600">{{ d.actor ?? '—' }}</td>
                <td class="px-4 py-2 text-right text-xs text-slate-500 font-mono">{{ d.input_tokens ?? '—' }}</td>
                <td class="px-4 py-2 text-right text-xs text-slate-500 font-mono">{{ d.output_tokens ?? '—' }}</td>
                <td class="px-4 py-2 text-right font-mono font-semibold text-slate-900">{{ fmtUsd(d.cost_usd) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
