<script setup lang="ts">
interface Gerente {
  n: number;
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  estado: 'activo' | 'proximo';
  progreso?: number;
}

const gerentes: Gerente[] = [
  {
    n: 1,
    titulo: 'Contabilidad y Finanzas',
    descripcion: 'Recursos, registros contables y cumplimiento financiero',
    icono: '📊',
    color: 'from-blue-500 to-blue-700',
    estado: 'proximo',
  },
  {
    n: 2,
    titulo: 'Obra Pública',
    descripcion: 'Planeación, contratación, ejecución y supervisión técnica',
    icono: '🏗',
    color: 'from-amber-500 to-amber-700',
    estado: 'activo',
    progreso: 100,
  },
  {
    n: 3,
    titulo: 'Adquisiciones, Arrendamientos y Servicios',
    descripcion: 'Compras, contratos y cumplimiento normativo',
    icono: '🛒',
    color: 'from-emerald-500 to-emerald-700',
    estado: 'proximo',
  },
  {
    n: 4,
    titulo: 'Transparencia, Comunicación y Difusión',
    descripcion: 'Publicidad, transparencia proactiva y evidencia pública',
    icono: '📢',
    color: 'from-purple-500 to-purple-700',
    estado: 'proximo',
  },
  {
    n: 5,
    titulo: 'Seguimiento, Cierre y Rendición de Cuentas',
    descripcion: 'Integración del expediente, indicadores, solventación de observaciones y cierre',
    icono: '✅',
    color: 'from-rose-500 to-rose-700',
    estado: 'proximo',
  },
];

const etapasAsf = [
  { n: 1, nombre: 'Notificación de inicio', dias: 'Día 1' },
  { n: 2, nombre: 'Planeación de auditoría', dias: 'Días 1-20' },
  { n: 3, nombre: 'Ejecución de auditoría', dias: 'Días 21-120' },
  { n: 4, nombre: 'Resultados preliminares', dias: 'Días 121-135' },
  { n: 5, nombre: 'Solventación', dias: 'Días 136-165' },
  { n: 6, nombre: 'Análisis de solventación', dias: 'Días 166-190' },
  { n: 7, nombre: 'Elaboración del informe individual', dias: 'Días 191-210' },
  { n: 8, nombre: 'Entrega a Cámara de Diputados', dias: 'Días 211-220' },
  { n: 9, nombre: 'Revisión Cámara de Diputados', dias: 'Días 221-260' },
  { n: 10, nombre: 'Dictamen y aprobación', dias: 'Días 261-300' },
  { n: 11, nombre: 'Publicación Cuenta Pública', dias: 'Año siguiente' },
  { n: 12, nombre: 'Seguimiento y promoción de acciones', dias: 'Permanente' },
];
</script>

<template>
  <div class="max-w-7xl mx-auto px-6 py-10">
    <!-- Header -->
    <div class="text-center mb-10">
      <div class="inline-block px-4 py-1.5 bg-amber-100 text-amber-900 rounded-full text-xs font-bold tracking-widest mb-3">
        ARQUITECTURA DEL PRODUCTO COMPLETO
      </div>
      <h1 class="text-4xl font-bold text-slate-900">GASFED IA · INEXPED</h1>
      <p class="text-slate-600 mt-3 max-w-2xl mx-auto">
        Ecosistema de <strong>5 Gerentes Virtuales</strong> coordinados por un <strong>CEO Virtual</strong> con IA,
        para cubrir el ciclo completo del Gasto Federalizado municipal.
      </p>
    </div>

    <!-- CEO en el centro -->
    <div class="flex justify-center mb-8">
      <div class="w-64 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 text-center shadow-2xl border border-amber-500/40">
        <div class="w-16 h-16 mx-auto bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-3xl mb-3">
          🏛
        </div>
        <div class="text-xs text-amber-400 font-bold tracking-widest">CEO VIRTUAL</div>
        <div class="text-lg font-bold mt-1">GASFED IA</div>
        <div class="text-xs text-slate-400 mt-3 leading-relaxed">
          Dirección estratégica, coordinación e integración basada en IA
        </div>
      </div>
    </div>

    <!-- Grid de 5 Gerentes -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-16">
      <div
        v-for="g in gerentes"
        :key="g.n"
        class="relative bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
      >
        <!-- Badge estado -->
        <div class="absolute top-3 right-3">
          <span v-if="g.estado === 'activo'" class="inline-block bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Activo
          </span>
          <span v-else class="inline-block bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
            Próximo
          </span>
        </div>

        <div :class="`w-14 h-14 bg-gradient-to-br ${g.color} rounded-2xl flex items-center justify-center text-3xl text-white mb-3`">
          {{ g.icono }}
        </div>
        <div class="text-xs text-slate-500 font-mono mb-0.5">GERENTE VIRTUAL {{ g.n }}</div>
        <div class="font-bold text-slate-900 text-sm leading-snug mb-2">{{ g.titulo }}</div>
        <div class="text-xs text-slate-600 leading-relaxed">{{ g.descripcion }}</div>

        <div v-if="g.estado === 'activo'" class="mt-3 pt-3 border-t border-slate-100">
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-slate-500">Implementado</span>
            <span class="font-bold text-emerald-600">{{ g.progreso }}%</span>
          </div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" :style="{ width: g.progreso + '%' }"></div>
          </div>
          <router-link to="/" class="mt-2 block text-center text-xs text-brand-700 hover:text-brand-900 font-semibold">
            Ver demo →
          </router-link>
        </div>
      </div>
    </div>

    <!-- Beneficios generales -->
    <div class="bg-white border border-slate-200 rounded-2xl p-6 mb-16">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
        <div>
          <div class="text-3xl mb-2">🎯</div>
          <div class="font-bold text-slate-900 text-sm">Visión integral</div>
          <div class="text-xs text-slate-600 mt-1">Todas las áreas conectadas para decisiones inteligentes</div>
        </div>
        <div>
          <div class="text-3xl mb-2">🛡</div>
          <div class="font-bold text-slate-900 text-sm">Cumplimiento normativo</div>
          <div class="text-xs text-slate-600 mt-1">Reducción de riesgos y observaciones ASF</div>
        </div>
        <div>
          <div class="text-3xl mb-2">📈</div>
          <div class="font-bold text-slate-900 text-sm">Eficiencia</div>
          <div class="text-xs text-slate-600 mt-1">Procesos optimizados y automatizados con IA</div>
        </div>
        <div>
          <div class="text-3xl mb-2">✅</div>
          <div class="font-bold text-slate-900 text-sm">Rendición de cuentas</div>
          <div class="text-xs text-slate-600 mt-1">Transparencia y confianza en cada etapa</div>
        </div>
      </div>
    </div>

    <!-- Proceso ASF alineado -->
    <div class="mb-16">
      <div class="text-center mb-6">
        <div class="inline-block px-4 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold tracking-widest mb-2">
          ALINEADO CON EL PROCESO OFICIAL ASF
        </div>
        <h2 class="text-2xl font-bold text-slate-900">Proceso de Fiscalización · 12 etapas · 300+ días</h2>
        <p class="text-slate-500 text-sm mt-1">Desde la notificación de auditoría hasta la publicación en Cuenta Pública</p>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div v-for="e in etapasAsf" :key="e.n" class="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
          <div class="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
            {{ e.n }}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-800 text-xs leading-tight">{{ e.nombre }}</div>
            <div class="text-[10px] text-slate-500 font-mono mt-0.5">{{ e.dias }}</div>
          </div>
        </div>
      </div>
      <div class="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
        <div class="text-sm text-emerald-900">
          <strong>La Cédula Consolidada</strong> que genera INEXPED IA se entrega en las etapas
          <span class="font-mono bg-white px-2 py-0.5 rounded">3 → 5</span>
          y reduce dramáticamente el tiempo de solventación de observaciones.
        </div>
      </div>
    </div>

    <!-- Autoría -->
    <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-8 text-center">
      <div class="text-xs text-amber-400 font-bold tracking-widest mb-2">AUTORÍA Y METODOLOGÍA</div>
      <div class="text-2xl font-bold">Ing. Enrique Ocampo Rojas</div>
      <div class="text-slate-400 text-sm mt-1">Más de 25 años de experiencia en gestión pública, obra pública y fiscalización</div>
      <div class="mt-6 flex flex-wrap justify-center gap-3 text-xs">
        <span class="px-3 py-1 bg-white/10 rounded-full">⚙ Gestión pública y fiscalización</span>
        <span class="px-3 py-1 bg-white/10 rounded-full">🏛 Obra pública y desarrollo municipal</span>
        <span class="px-3 py-1 bg-white/10 rounded-full">🧠 Soluciones tecnológicas con IA</span>
        <span class="px-3 py-1 bg-white/10 rounded-full">✅ Compromiso con la transparencia</span>
      </div>
      <a href="https://www.gasfed.mx" target="_blank" rel="noreferrer" class="mt-6 inline-block text-amber-400 hover:text-amber-300 text-sm font-semibold">
        www.gasfed.mx →
      </a>
    </div>
  </div>
</template>
