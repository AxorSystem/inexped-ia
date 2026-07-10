import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'dashboard', component: () => import('./views/DashboardView.vue') },
  { path: '/expedientes/:id', name: 'expediente', component: () => import('./views/ExpedienteView.vue'), props: true },
  { path: '/costos', name: 'costos', component: () => import('./views/CostosView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.isAuth) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.name === 'login' && auth.isAuth) return { name: 'dashboard' };
});
