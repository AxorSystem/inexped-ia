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
  <div class="min-h-screen flex flex-col">
    <nav v-if="showNav" class="bg-slate-900 text-white sticky top-0 z-10">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-3">
          <div class="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-800 rounded-lg flex items-center justify-center font-bold text-lg">
            IA
          </div>
          <div>
            <div class="font-bold text-lg leading-none">INEXPED</div>
            <div class="text-xs text-brand-300 font-medium tracking-wider">RENDICIÓN CON IA</div>
          </div>
        </router-link>
        <div class="flex items-center gap-4 text-sm">
          <span class="text-slate-300">{{ auth.user?.name || auth.user?.sub }}</span>
          <button @click="logout" class="text-slate-300 hover:text-white">Cerrar sesión</button>
        </div>
      </div>
    </nav>
    <router-view class="flex-1" />
  </div>
</template>
