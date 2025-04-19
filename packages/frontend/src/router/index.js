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

// Navigation Guard - UNICO E CORRETTO
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore(); // Ottieni lo store
  console.log(`Router Guard: Navigando verso ${to.fullPath} da ${from.fullPath}`);

  // --- 1. Caricamento Dati Utente (se necessario) ---
  // Assicurati che lo stato auth sia stato inizializzato se c'è un token
  if (authStore.token && !authStore.user) {
      console.log('Router Guard: Token presente ma user non caricato, chiamo fetchUser...');
      try {
          await authStore.fetchUser(); // Aspetta che i dati utente siano caricati
          console.log('Router Guard: fetchUser completato. User:', authStore.user?.username, 'isAdmin:', authStore.isAdmin, 'isCreator:', authStore.isCreator);
      } catch (error) {
           console.error('Router Guard: Errore durante fetchUser. Potrebbe impedire accesso a rotte protette.', error);
           // Lasciamo che i controlli successivi gestiscano l'eventuale mancanza di auth/permessi
      }
  }

  // --- 2. Recupera Metadati Rotta e Stato Autenticazione ---
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin); // Usiamo questo per /create-event
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest);
  const isAuthenticated = authStore.isLoggedIn;
  const isAdmin = authStore.isAdmin;
  const isCreator = authStore.isCreator; // Assumendo che authStore lo esponga correttamente

  console.log(`Router Guard: Meta { requiresAuth: ${requiresAuth}, requiresAdmin: ${requiresAdmin}, requiresGuest: ${requiresGuest} }`);
  console.log(`Router Guard: Stato { isAuthenticated: ${isAuthenticated}, isAdmin: ${isAdmin}, isCreator: ${isCreator} }`);

  // --- 3. Logica di Controllo Accesso ---

  // Caso 1: Rotta richiede Autenticazione, ma utente non è loggato
  if (requiresAuth && !isAuthenticated) {
      console.log('Router Guard: Accesso negato (Non Autenticato). Redirect a /login.');
      next({
           name: 'login',
           query: { redirect: to.fullPath } // Opzionale: ricorda dove voleva andare
      });
      return; // Interrompi esecuzione
  }

  // Caso 2: Rotta richiede accesso Ospite (non loggato), ma utente è loggato
  if (requiresGuest && isAuthenticated) {
      console.log('Router Guard: Accesso negato (Autenticato su rotta Guest). Redirect a /events.');
      next('/events'); // O un'altra pagina di default per utenti loggati
      return; // Interrompi esecuzione
  }

  // Caso 3: Rotta richiede privilegi Admin/Creator (usiamo meta.requiresAdmin per questo)
  if (requiresAdmin) {
      // Questo controllo isAuthenticated è tecnicamente ridondante se requiresAdmin implica requiresAuth,
      // ma è una sicurezza in più. Se non fosse autenticato, sarebbe già stato gestito dal Caso 1.
      if (!isAuthenticated) {
           console.log('Router Guard: Accesso negato (Non Autenticato per rotta Admin/Creator). Redirect a /login.');
           next('/login');
           return;
      }
      // Qui l'utente è autenticato, controlliamo i ruoli:
      if (!isAdmin && !isCreator) { // <-- CONDIZIONE CORRETTA
          console.error(`Router Guard: Accesso negato (Privilegi Insufficienti) a ${to.fullPath}. Stato: isAdmin=${isAdmin}, isCreator=${isCreator}`);
          next('/'); // Reindirizza alla home (o pagina 'Accesso Negato')
          return; // Interrompi esecuzione
      }
       console.log(`Router Guard: Accesso Admin/Creator consentito a ${to.fullPath}.`);
  }

  // --- 4. Accesso Consentito ---
  // Se siamo arrivati fin qui, nessun controllo ha bloccato la navigazione
  console.log(`Router Guard: Accesso consentito a ${to.fullPath}. Chiamo next().`);
  next();
});

export default router