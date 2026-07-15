<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const showNav = computed(() => auth.isAuth && route.name !== 'login');

function logout() {
  auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50">
    <nav v-if="showNav" class="bg-gradient-to-r from-slate-950 to-slate-900 text-white sticky top-0 z-10 border-b border-amber-500/20 shadow-lg">
      <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-3">
          <div class="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center font-bold text-slate-900 text-lg shadow-md">
            🏛
          </div>
          <div>
            <div class="font-bold text-lg leading-none tracking-wide">
              GASFED IA · <span class="text-amber-400">INEXPED</span>
            </div>
            <div class="text-xs text-slate-400 font-medium tracking-wider mt-0.5">
              ASEGURAMIENTO DEL GASTO FEDERALIZADO
            </div>
          </div>
        </router-link>
        <div class="flex items-center gap-5 text-sm">
          <router-link to="/roadmap" class="text-slate-300 hover:text-amber-400 transition-colors">
            🗺 Arquitectura
          </router-link>
          <span class="text-slate-500">|</span>
          <span class="text-slate-300">{{ auth.user?.name || auth.user?.sub }}</span>
          <button @click="logout" class="text-slate-300 hover:text-white">Cerrar sesión</button>
        </div>
      </div>
    </nav>

    <router-view class="flex-1" />

    <footer v-if="showNav" class="bg-slate-900 text-slate-300 border-t border-amber-500/20 mt-12">
      <div class="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded flex items-center justify-center text-slate-900 font-bold">🏛</div>
          <div>
            <div class="font-semibold text-white">GASFED IA · INEXPED</div>
            <div class="text-xs text-slate-400">Transparencia que genera confianza</div>
          </div>
        </div>
        <div class="text-center md:text-right text-xs text-slate-400">
          <div>
            <span class="font-semibold text-amber-400">AUTORÍA:</span>
            Ing. Enrique Ocampo Rojas
            <span class="text-slate-500">·</span>
            25 años de experiencia
          </div>
          <div class="mt-1">
            <a href="https://www.gasfed.mx" target="_blank" rel="noreferrer" class="hover:text-amber-400">www.gasfed.mx</a>
            <span class="text-slate-500 mx-2">·</span>
            <span>Gestión pública · Obra pública · Rendición de cuentas</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
