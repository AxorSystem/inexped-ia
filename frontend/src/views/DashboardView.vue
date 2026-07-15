<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/lib/api';
import NuevoExpedienteModal from './NuevoExpedienteModal.vue';

const mostrarNuevo = ref(false);

interface Expediente {
  id: number;
  folio: string;
  nombre: string;
  monto: number;
  municipio: string;
  responsable: string;
  estado: string;
  updated_at: string;
  fondo_codigo: string;
  fondo_nombre: string;
  docs_count: number;
}

interface Kpis {
  total_expedientes: number;
  monto_total: number;
  documentos_totales: number;
  por_estado: Record<string, number>;
}

const router = useRouter();

function onCreado(payload: { id: number; folio: string }) {
  mostrarNuevo.value = false;
  router.push(`/expedientes/${payload.id}`);
}

const expedientes = ref<Expediente[]>([]);
const kpis = ref<Kpis | null>(null);
const loading = ref(true);
const filtro = ref('');
const filtroEstado = ref('');

async function cargar() {
  loading.value = true;
  try {
    const [exps, kpisR] = await Promise.all([
      api.get('/expedientes'),
      api.get('/expedientes/dashboard/kpis'),
    ]);
    expedientes.value = exps.data;
    kpis.value = kpisR.data;
  } finally {
    loading.value = false;
  }
}

onMounted(cargar);

const filtrados = computed(() => {
  let list = expedientes.value;
  if (filtroEstado.value) list = list.filter((e) => e.estado === filtroEstado.value);
  if (filtro.value) {
    const q = filtro.value.toLowerCase();
    list = list.filter(
      (e) =>
        e.folio.toLowerCase().includes(q) ||
        e.nombre.toLowerCase().includes(q) ||
        (e.municipio || '').toLowerCase().includes(q)
    );
  }
  return list;
});

function fmtMoney(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const estadoLabel: Record<string, string> = {
  planeacion: 'Planeación',
  autorizado: 'Autorizado',
  ejecucion: 'Ejecución',
  cierre: 'Cierre',
  cerrado: 'Cerrado',
};
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-8">
      <div>
        <div class="text-xs font-bold text-amber-700 tracking-widest uppercase mb-1">Gerente Virtual · Obra Pública</div>
        <h1 class="text-3xl font-bold text-slate-900">Panel de expedientes</h1>
        <p class="text-slate-600 mt-1">Ciclo integral de gestión de obra pública · Cumplimiento GASFED</p>
      </div>
      <div class="flex items-center gap-2">
        <router-link
          to="/costos"
          class="inline-flex items-center gap-1 px-3 py-2.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          title="Costos internos (owner)"
        >
          <span>$</span>
          <span class="hidden md:inline">Costos IA</span>
        </router-link>
        <button
          @click="mostrarNuevo = true"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg shadow-sm transition"
        >
          <span class="text-lg leading-none">+</span>
          Nuevo expediente
          <span class="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">IA</span>
        </button>
      </div>
    </div>

    <NuevoExpedienteModal v-if="mostrarNuevo" @cerrar="mostrarNuevo = false" @creado="onCreado" />

    <!-- KPIs -->
    <div v-if="kpis" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="card p-5">
        <div class="text-slate-500 text-sm font-medium">Total expedientes</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">{{ kpis.total_expedientes }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-sm font-medium">Monto total</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">{{ fmtMoney(kpis.monto_total) }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-sm font-medium">Documentos indexados</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">{{ kpis.documentos_totales }}</div>
      </div>
      <div class="card p-5">
        <div class="text-slate-500 text-sm font-medium">En ejecución</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">{{ kpis.por_estado.ejecucion }}</div>
      </div>
    </div>

    <!-- Filter bar -->
    <div class="card p-4 mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
      <input
        v-model="filtro"
        placeholder="Buscar por folio, nombre, municipio…"
        class="flex-1 rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200"
      />
      <select v-model="filtroEstado" class="rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200 md:w-56">
        <option value="">Todos los estados</option>
        <option value="planeacion">Planeación</option>
        <option value="autorizado">Autorizado</option>
        <option value="ejecucion">Ejecución</option>
        <option value="cierre">Cierre</option>
        <option value="cerrado">Cerrado</option>
      </select>
    </div>

    <!-- Table -->
    <div class="card overflow-hidden">
      <div v-if="loading" class="text-center py-16 text-slate-500">Cargando…</div>
      <div v-else-if="!filtrados.length" class="text-center py-16 text-slate-500">Sin expedientes que coincidan.</div>
      <table v-else class="w-full">
        <thead class="bg-slate-50 border-b border-slate-200">
          <tr>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Folio</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fondo</th>
            <th class="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Municipio</th>
            <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Monto</th>
            <th class="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Docs</th>
            <th class="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
            <th class="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actualizado</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="e in filtrados" :key="e.id" @click="router.push(`/expedientes/${e.id}`)" class="hover:bg-brand-50/50 cursor-pointer transition-colors">
            <td class="px-5 py-4 font-mono text-sm text-brand-700 font-medium">{{ e.folio }}</td>
            <td class="px-5 py-4">
              <div class="font-medium text-slate-900 max-w-md">{{ e.nombre }}</div>
              <div class="text-xs text-slate-500">{{ e.responsable }}</div>
            </td>
            <td class="px-5 py-4"><span class="badge bg-slate-100 text-slate-700">{{ e.fondo_codigo }}</span></td>
            <td class="px-5 py-4 text-sm text-slate-600">{{ e.municipio }}</td>
            <td class="px-5 py-4 text-right font-medium text-slate-900">{{ fmtMoney(e.monto) }}</td>
            <td class="px-5 py-4 text-center text-sm text-slate-600">{{ e.docs_count }}</td>
            <td class="px-5 py-4 text-center"><span :class="'badge badge-' + e.estado">{{ estadoLabel[e.estado] || e.estado }}</span></td>
            <td class="px-5 py-4 text-right text-sm text-slate-500">{{ fmtDate(e.updated_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
