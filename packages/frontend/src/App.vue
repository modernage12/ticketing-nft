<script setup>
// Importiamo i componenti di Vue Router e i lifecycle hooks di Vue
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { onMounted } from 'vue';

// Importiamo lo store Pinia per l'autenticazione
import { useAuthStore } from '@/stores/auth';

// Otteniamo l'istanza dello store e del router
const authStore = useAuthStore();
const router = useRouter(); // Lo usiamo per il logout programmatico se necessario

// Funzione da chiamare al click del bottone Logout
const handleLogout = () => {
  authStore.logout(); // Chiama l'azione dello store (che già reindirizza a /login)
};

// Al montaggio del componente principale App.vue, proviamo a:
// 1. Caricare il token da localStorage (se esiste)
// 2. Se il token esiste, proviamo a recuperare i dati utente
onMounted(() => {
  console.log("App.vue onMounted: Provo a caricare token e utente...");
  // Codice commentato per il test:
  // authStore.loadToken();
  // if (authStore.isLoggedIn) {
  //   authStore.fetchUser();
  // } else {
  //   console.log("App.vue onMounted: Nessun token trovato.");
  // }
  console.log("App.vue onMounted: Caricamento iniziale DISABILITATO per test.");
}); // <-- FINE CORRETTA con });

</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="logo">
        Ticketing NFT </div>
      <nav class="navigation">
        <template v-if="authStore.isLoggedIn">
          <RouterLink to="/events">Eventi</RouterLink>
          <RouterLink to="/my-tickets">I Miei Biglietti</RouterLink>
          <RouterLink to="/marketplace">Marketplace</RouterLink>
          <button @click="handleLogout" class="logout-button">Logout ({{ authStore.user?.username }})</button>
          </template>

        <template v-if="!authStore.isLoggedIn">
          <RouterLink to="/login">Login</RouterLink>
          <RouterLink to="/register">Registrati</RouterLink>
        </template>
      </nav>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>&copy; 2025 Ticketing NFT Project</p>
    </footer>
  </div>
</template>

<style scoped>
/* Stili semplici per il layout e la navigazione */
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex; /* Usa Flexbox per allineare logo e nav */
  justify-content: space-between; /* Spinge logo a sx e nav a dx */
  align-items: center; /* Allinea verticalmente al centro */
  padding: 1rem 2rem;
  background-color: #1a1a1a;
  border-bottom: 1px solid #333;
  /* Facciamo sì che l'header occupi tutta la larghezza */
  width: 100%;
}

.logo {
  font-weight: bold;
  font-size: 1.5rem;
}

.navigation {
  display: flex; /* Usa Flexbox anche per i link interni */
  align-items: center;
  gap: 1rem; /* Aggiunge spazio tra i link/bottoni */
}

.navigation a, .navigation button {
  text-decoration: none;
  color: #a0a0a0;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  transition: background-color 0.2s, color 0.2s;
  white-space: nowrap; /* Evita che il testo vada a capo, es. nel bottone Logout */
}

.navigation a:hover, .navigation button:hover {
  background-color: #333;
  color: #fff;
}

/* Stile specifico per il link attivo */
.navigation a.router-link-exact-active {
  color: #ffffff;
  background-color: #007bff; /* Blu come esempio */
}

/* Stile bottone Logout */
.navigation button.logout-button {
  background: none;
  border: 1px solid #a0a0a0;
  color: #a0a0a0;
  cursor: pointer;
  font-size: inherit; /* Usa la stessa dimensione degli altri link */
}
.navigation button.logout-button:hover {
   border-color: #fff;
}


.app-main {
  flex-grow: 1; /* Fa sì che il main occupi lo spazio verticale rimanente */

  /* Centratura e larghezza massima del contenuto principale */
  width: 100%; /* Occupa tutta la larghezza disponibile... */
  max-width: 1100px; /* ...ma non più di 1100px (puoi aggiustare questo valore) */
  margin-left: auto; /* Imposta margine sinistro automatico */
  margin-right: auto; /* Imposta margine destro automatico (insieme centrano l'elemento) */
  padding: 2rem; /* Aggiunge spazio interno sopra/sotto e ai lati */
}

.app-footer {
  text-align: center;
  padding: 1rem;
  margin-top: auto; /* Spinge il footer in basso se il contenuto è poco */
  font-size: 0.8rem;
  color: #666;
  border-top: 1px solid #333;
  background-color: #1a1a1a; /* Stesso sfondo dell'header */
  width: 100%; /* Occupa tutta la larghezza */
}

/* Stili semplici per il layout e la navigazione */
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  width: 100%;
}

.logo {
  font-weight: bold;
  font-size: 1.5rem;
  color: var(--color-heading);
}

.navigation {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.navigation a, .navigation button {
  text-decoration: none;
  color: var(--color-text);
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  transition: color 0.2s, background-color 0.2s;
  white-space: nowrap;
}

.navigation a:hover {
  color: var(--color-primary);
}

/* Stile specifico per il link attivo */
.navigation a.router-link-exact-active {
  color: var(--color-text-on-primary);
  background-color: var(--color-primary);
}

/* Stile bottone Logout */
.navigation button.logout-button {
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  font-size: inherit;
}

.navigation button.logout-button:hover {
  border-color: var(--color-text);
  background-color: var(--color-background-mute);
}

.app-main {
  flex-grow: 1;
  width: 100%;
  max-width: 1100px;
  margin-left: auto;
  margin-right: auto;
  padding: 2rem;
}

.app-footer {
  text-align: center;
  padding: 1rem;
  margin-top: auto;
  font-size: 0.8rem;
  color: var(--color-text-light);
  border-top: 1px solid var(--color-border);
  background-color: var(--color-background-soft);
  width: 100%;
}
</style>