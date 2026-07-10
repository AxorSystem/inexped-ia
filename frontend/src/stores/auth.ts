import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/lib/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('inexped_token'));
  const user = ref<any>(JSON.parse(localStorage.getItem('inexped_user') || 'null'));

  const isAuth = computed(() => !!token.value);

  async function login(email: string, password: string) {
    const r = await api.post('/auth/login', { email, password });
    token.value = r.data.token;
    user.value = r.data.user;
    localStorage.setItem('inexped_token', r.data.token);
    localStorage.setItem('inexped_user', JSON.stringify(r.data.user));
  }

  function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('inexped_token');
    localStorage.removeItem('inexped_user');
  }

  return { token, user, isAuth, login, logout };
});
