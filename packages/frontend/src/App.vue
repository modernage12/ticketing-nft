<script setup>
// Importiamo i componenti di Vue Router e i lifecycle hooks di Vue
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { onMounted } from 'vue';

// Importiamo lo store Pinia per l'autenticazione
import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet';

// Otteniamo l'istanza dello store e del router
const authStore = useAuthStore();
const router = useRouter(); // Lo usiamo per il logout programmatico se necessario
const walletStore = useWalletStore();

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
        AMPHI </div>
      <nav class="navigation">
        <template v-if="authStore.isLoggedIn">
          <RouterLink to="/events">Eventi</RouterLink>
          <RouterLink to="/my-tickets">I Miei Biglietti</RouterLink>
          <RouterLink to="/marketplace">Marketplace</RouterLink>
          <RouterLink to="/settings">Impostazioni</RouterLink>
          <RouterLink v-if="authStore.isLoggedIn && (authStore.isAdmin || authStore.isCreator)" to="/create-event">Crea Evento</RouterLink>
          <button @click="handleLogout" class="logout-button">Logout ({{ authStore.user?.username }})</button>
          </template>

        <template v-if="!authStore.isLoggedIn">
          <RouterLink to="/login">Login</RouterLink>
          <RouterLink to="/register">Registrati</RouterLink>
        </template>
        <template v-if="walletStore.isUsingExternalWallet">
            <div class="wallet-section">
               <template v-if="!walletStore.isConnected">
                 <button @click="walletStore.connectWallet" :disabled="walletStore.isConnecting" class="wallet-button connect">
                   {{ walletStore.isConnecting ? 'Connessione...' : 'Collega Wallet' }}
                 </button>
                 <p v-if="walletStore.error" class="wallet-error">{{ walletStore.error }}</p>
               </template>

               <template v-else>
                 <span class="wallet-address">Wallet: {{ walletStore.shortAddress }}</span>
                 <button @click="walletStore.disconnectWallet" class="wallet-button disconnect">
                   Disconnetti
                 </button>
               </template>
            </div>
        </template>
      </nav>
    </header>

    <main class="app-main">
      <RouterView />
    </main>

    <footer class="app-footer">
      <p>&copy; 2025 AMPHI</p>
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

.wallet-section {
  margin-left: auto; /* Spinge la sezione a destra */
  display: flex;
  align-items: center;
  gap: 0.75rem; /* Leggero aumento dello spazio */
}

.wallet-button {
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 0.9em;
  white-space: nowrap;
  transition: color 0.2s, background-color 0.2s, border-color 0.2s;
}
.wallet-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Usiamo una variabile '--color-success' per il verde, se non esiste puoi definirla
   in :root nel tuo main.css o sostituirla con un colore es. #42b983 */
.wallet-button.connect:hover:not(:disabled) {
   border-color: var(--color-success, #42b983);
   color: var(--color-success, #42b983);
   /* Sfondo leggermente più visibile */
   background-color: var(--color-success-bg, rgba(66, 185, 131, 0.15));
}

/* Usiamo una variabile '--color-danger' per il rosso */
.wallet-button.disconnect:hover {
   border-color: var(--color-danger, #dc3545);
   color: var(--color-danger, #dc3545);
   background-color: var(--color-danger-bg, rgba(220, 53, 69, 0.15));
}

.wallet-address {
   font-size: 0.9em;
   color: var(--color-text-light); /* Usiamo il grigio chiaro del footer */
   background-color: var(--color-background-mute); /* Sfondo leggero per distinguerlo */
   padding: 0.3rem 0.6rem; /* Stesso padding dei bottoni */
   border-radius: 4px;
   white-space: nowrap;
}

.wallet-error {
    color: var(--color-danger, #dc3545);
    font-size: 0.8em;
    margin: 0; /* Rimuove margini di default del paragrafo */
    margin-left: 0.5rem; /* Aggiunge spazio dal pulsante */
}

/* ========================================== */
/* === FINE REGOLE CSS NUOVE === */
/* ========================================== */

</style>