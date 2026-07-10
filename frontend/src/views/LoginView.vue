<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const email = ref('demo@inexped.mx');
const password = ref('demo2026');
const loading = ref(false);
const error = ref('');
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    router.push((route.query.redirect as string) || '/');
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Error al iniciar sesión';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen grid lg:grid-cols-2">
    <!-- Left: Branding -->
    <div class="hidden lg:flex flex-col justify-between p-16 bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 text-white">
      <div>
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center font-bold text-2xl border border-white/20">
            IA
          </div>
          <div>
            <div class="font-extrabold text-2xl">INEXPED</div>
            <div class="text-brand-300 tracking-widest text-sm font-semibold">RENDICIÓN CON IA</div>
          </div>
        </div>
      </div>
      <div>
        <h1 class="text-4xl font-bold leading-tight mb-6">
          Rendición de cuentas segura, oportuna y auditable del GASFED.
        </h1>
        <p class="text-brand-200 text-lg mb-8 leading-relaxed">
          Inteligencia Artificial al servicio de la transparencia, el control y la eficiencia en la administración de recursos públicos.
        </p>
        <div class="grid grid-cols-2 gap-6">
          <div>
            <div class="text-3xl font-bold">4</div>
            <div class="text-brand-300 text-sm">Fondos GASFED activos</div>
          </div>
          <div>
            <div class="text-3xl font-bold">100%</div>
            <div class="text-brand-300 text-sm">Trazabilidad documental</div>
          </div>
          <div>
            <div class="text-3xl font-bold">24/7</div>
            <div class="text-brand-300 text-sm">Monitoreo IA de expedientes</div>
          </div>
          <div>
            <div class="text-3xl font-bold">0</div>
            <div class="text-brand-300 text-sm">Observaciones ASF esperadas</div>
          </div>
        </div>
      </div>
      <div class="text-brand-300 text-sm">
        © 2026 INEXPED IA · Todos los derechos reservados
      </div>
    </div>

    <!-- Right: Form -->
    <div class="flex items-center justify-center p-8 lg:p-16">
      <div class="w-full max-w-md">
        <div class="lg:hidden flex items-center gap-3 mb-8">
          <div class="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-800 rounded-lg flex items-center justify-center text-white font-bold">IA</div>
          <div>
            <div class="font-bold text-lg">INEXPED</div>
            <div class="text-xs text-brand-700 tracking-wider">RENDICIÓN CON IA</div>
          </div>
        </div>

        <h2 class="text-2xl font-bold text-slate-900 mb-2">Iniciar sesión</h2>
        <p class="text-slate-600 mb-8">Accede a tu panel de administración de expedientes.</p>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Correo institucional</label>
            <input v-model="email" type="email" required class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200 focus:ring-opacity-50" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
            <input v-model="password" type="password" required class="w-full rounded-lg border-slate-300 focus:border-brand-500 focus:ring focus:ring-brand-200 focus:ring-opacity-50" />
          </div>
          <div v-if="error" class="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
            {{ error }}
          </div>
          <button type="submit" :disabled="loading" class="btn-primary w-full text-base py-2.5">
            {{ loading ? 'Ingresando…' : 'Ingresar al sistema' }}
          </button>
        </form>

        <div class="mt-8 text-xs text-slate-500 border-t border-slate-200 pt-4">
          <div class="font-medium text-slate-700 mb-1">Acceso demo</div>
          Usuario: cualquier correo · Contraseña: <code class="bg-slate-100 px-1.5 py-0.5 rounded">demo2026</code>
        </div>
      </div>
    </div>
  </div>
</template>
