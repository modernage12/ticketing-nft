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
},

{
  path: '/create-event', // Il percorso URL
  name: 'create-event', // Nome univoco della route
  component: () => import('../views/CreateEventView.vue'), // Il componente Vue (verrà creato dopo)
  meta: {
      requiresAuth: true, // Richiede che l'utente sia loggato
      requiresAdmin: true // Richiede che l'utente sia admin
  }
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

router.beforeEach(async (to, from, next) => {
  // Ottieni lo store Pinia QUI DENTRO, non fuori
  const authStore = useAuthStore();

  // Assicurati che lo stato auth sia stato inizializzato se c'è un token
  // Questo è importante se l'utente ricarica la pagina
  if (authStore.token && !authStore.user) {
      console.log('Router Guard: Token presente ma user non caricato, chiamo fetchUser...');
      await authStore.fetchUser(); // Aspetta che i dati utente siano caricati
      console.log('Router Guard: fetchUser completato.');
  }


  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);

  const isAuthenticated = authStore.isLoggedIn; // Usa il computed getter
  const isAdmin = authStore.isAdmin; // Usa il computed getter (se lo hai aggiunto) o authStore.user?.isAdmin

  console.log(`Router Guard: Navigating to ${to.path}`);
  console.log(`Router Guard: requiresAuth=<span class="math-inline">\{requiresAuth\}, requiresAdmin\=</span>{requiresAdmin}, requiresGuest=${requiresGuest}`);
  console.log(`Router Guard: isAuthenticated=<span class="math-inline">\{isAuthenticated\}, isAdmin\=</span>{isAdmin}`);

  if (requiresAuth && !isAuthenticated) {
      // Se la route richiede login ma l'utente non è loggato -> vai al login
      console.log('Router Guard: Accesso negato (non autenticato), redirect a /login');
      next({
           name: 'login',
           // Opzionale: conserva la pagina richiesta per redirect dopo login
           query: { redirect: to.fullPath }
      });
  } else if (requiresAdmin && !isAdmin) {
      // Se la route richiede admin ma l'utente non è admin -> vai a una pagina sicura (es: my-tickets)
      console.log('Router Guard: Accesso negato (non admin), redirect a /my-tickets');
      next({ name: 'my-tickets' }); // O alla home, o a una pagina 'Forbidden'
  } else if (requiresGuest && isAuthenticated) {
       // Se la route richiede "ospite" (non loggato) ma l'utente è loggato -> vai a my-tickets
       console.log('Router Guard: Accesso negato (autenticato, pagina solo guest), redirect a /my-tickets');
       next({ name: 'my-tickets' }); // O alla home
  }
   else {
      // Tutto ok, procedi con la navigazione
      console.log('Router Guard: Accesso consentito.');
      next();
  }
});

export default router