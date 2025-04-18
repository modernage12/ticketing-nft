import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import MyTicketsView from '../views/MyTicketsView.vue' // <-- Importa la nuova view
import { useAuthStore } from '@/stores/auth' // <-- Importa lo store auth
import EventsView from '../views/EventsView.vue'
import MarketplaceView from '../views/MarketplaceView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' }, // Default a login
    { path: '/login', name: 'login', component: LoginView },
    { path: '/register', name: 'register', component: RegisterView },
    { // <-- NUOVA ROTTA PROTETTA
      path: '/my-tickets',
      name: 'my-tickets',
      component: MyTicketsView,
      meta: { requiresAuth: true } // Flag per indicare che richiede login
    },
    
	{
  path: '/events',
  name: 'events',
  component: EventsView,
  meta: { requiresAuth: true } // Richiede login per vedere gli eventi/comprare
},

{
  path: '/marketplace',
  name: 'marketplace',
  component: MarketplaceView,
  meta: { requiresAuth: true } // Richiede login per vedere il marketplace
},

{
  path: '/settings',
  name: 'settings',
  component: SettingsView, // Usa il componente importato sopra
  meta: { requiresAuth: true } // Assicura che richieda autenticazione
}

  ]
})

// Navigation Guard - Eseguito prima di ogni navigazione
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore(); // Ottieni lo store
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth); // La rotta richiede auth?

  // Se la rotta richiede auth E l'utente NON è loggato
  if (requiresAuth && !authStore.isLoggedIn) {
    console.log('Navigation Guard: Bloccato accesso, redirect a login');
    // Reindirizza alla pagina di login
    next({ name: 'login' });
  } else {
    // Altrimenti, permetti la navigazione
    next();
  }
});

export default router