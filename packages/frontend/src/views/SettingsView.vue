<script setup>
import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet';
import { computed, ref } from 'vue';
// import axios from 'axios';

const authStore = useAuthStore();
const walletStore = useWalletStore();
const apiError = ref(null);

// Getter per chiarezza nel template
const isExternalMode = computed(() => walletStore.isUsingExternalWallet);
const isExternalConnected = computed(() => walletStore.isConnected);
const externalAddress = computed(() => walletStore.connectedAddress);
const shortExternalAddress = computed(() => walletStore.shortAddress);

// Funzioni per cambiare modalità (per ora cambiano solo stato FE)
const switchToExternal = async () => {
  console.log("SettingsView: Tentativo di passare a Wallet Esterno...");
  apiError.value = null;
  try {
    await walletStore.connectWallet(); // Tenta connessione (aggiorna stato FE wallet)

    if (walletStore.isConnected && walletStore.isUsingExternalWallet) {
      console.log("SettingsView: Connessione FE ok, chiamo azione API per salvare preferenza 'external'");
      try {
         // Chiama l'azione dello store auth invece di axios direttamente
         await authStore.updateWalletPreferenceAPI('external'); // --> MODIFICA: Usa l'azione dello store
         console.log("SettingsView: Azione API per salvare 'external' completata con successo.");
      } catch (err) {
         console.error("Errore dall'azione updateWalletPreferenceAPI('external'):", err.message);
         apiError.value = err.message || "Errore nel salvare la preferenza.";
      }
    } else {
      console.log("SettingsView: Connessione FE fallita o stato non corretto, non salvo preferenza.")
      if(walletStore.error && !apiError.value) apiError.value = walletStore.error; // Mostra errore dal walletStore se c'è
    }
  } catch (connectError) {
     console.error("Errore durante connectWallet non gestito nello store:", connectError);
     if (!apiError.value) apiError.value = walletStore.error || "Errore durante la connessione del wallet.";
  }
};

const switchToInternal = async () => {
  console.log("SettingsView: Tentativo di passare a Wallet Interno...");
  apiError.value = null;
  try {
    // 1. Disconnetti il wallet (aggiorna stato FE wallet)
    walletStore.disconnectWallet(); // Questa è sincrona

    console.log("SettingsView: Stato DOPO disconnectWallet -> isExternalMode:", isExternalMode.value, "isUsingExternalWallet:", walletStore.isUsingExternalWallet);

    // 2. Salva la preferenza 'internal' nel backend
    console.log("SettingsView: Chiamo azione API per salvare preferenza 'internal'");
     try {
        await authStore.updateWalletPreferenceAPI('internal');
        console.log("SettingsView: Azione API per salvare 'internal' completata con successo.");
     } catch (err) {
        console.error("Errore dall'azione updateWalletPreferenceAPI('internal'):", err.message);
        apiError.value = err.message || "Errore nel salvare la preferenza.";
     }
  } catch (error) {
      console.error("Errore inatteso in switchToInternal:", error);
      apiError.value = "Errore imprevisto durante il passaggio al wallet interno.";
  }
};

</script>

<template>
  <div class="settings-view">
    <div v-if="apiError" class="api-error-display" style="color: red; margin-top: 1rem; border: 1px solid red; padding: 0.5rem; border-radius: 4px;">
        {{ apiError }}
    </div>
    <h2>Impostazioni Account</h2>

    <div v-if="authStore.user" class="user-info">
      <p><strong>Username:</strong> {{ authStore.user.username }}</p>
      <p><strong>Indirizzo Wallet Interno:</strong> {{ authStore.user.walletAddress }}</p>
      </div>
    <hr />

    <h3>Gestione Wallet</h3>

    <div class="wallet-mode-selector">
      <p>Modalità Wallet Attuale: <strong>{{ isExternalMode ? 'Esterno (Collegato via Estensione)' : 'Interno (Gestito dal Sistema)' }}</strong></p>

      <div v-if="isExternalMode" class="external-wallet-info">
        <h4>Stato Wallet Esterno</h4>
        <div v-if="isExternalConnected">
          <p>Connesso come: <span class="address">{{ shortExternalAddress }}</span></p>
          <button @click="switchToInternal" class="wallet-button disconnect">Usa Wallet Interno (Disconnetti Esterno)</button>
        </div>
        <div v-else>
          <p>Il wallet esterno non è attualmente connesso.</p>
          <button @click="walletStore.connectWallet" :disabled="walletStore.isConnecting" class="wallet-button connect">
             {{ walletStore.isConnecting ? 'Connessione...' : 'Riconnetti Wallet Esterno' }}
          </button>
          <button @click="switchToInternal" class="wallet-button disconnect" style="margin-left: 1rem;">Usa Wallet Interno</button>
           <p v-if="walletStore.error" class="wallet-error" style="margin-top: 0.5rem;">{{ walletStore.error }}</p>
        </div>
      </div>

      <div v-else class="internal-wallet-info">
         <button @click="switchToExternal" :disabled="walletStore.isConnecting" class="wallet-button connect">Passa a Wallet Esterno (Collega)</button>
         <p v-if="walletStore.error" class="wallet-error" style="margin-top: 0.5rem;">{{ walletStore.error }}</p>
      </div>

    </div>
     <hr />
      </div>
</template>

<style scoped>
.settings-view {
  max-width: 700px;
}

.user-info, .wallet-mode-selector, .external-wallet-info, .internal-wallet-info {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background-color: var(--color-background-soft);
}

h3 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.5rem;
}
h4 {
    margin-top: 0;
    margin-bottom: 1rem;
}

hr {
    border: none;
    border-top: 1px solid var(--color-border-hover);
    margin: 2rem 0;
}

.address {
  font-family: monospace;
  background-color: var(--color-background-mute);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}

/* Riusiamo gli stili dei bottoni wallet da App.vue se possibile,
   o ridefiniamoli/importiamoli qui se necessario */
.wallet-button {
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  background: none;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 0.95em;
  transition: color 0.2s, background-color 0.2s, border-color 0.2s;
  margin-right: 0.5rem; /* Aggiunge spazio tra bottoni */
}
.wallet-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.wallet-button.connect:hover:not(:disabled) {
   border-color: var(--color-success, #42b983);
   color: var(--color-success, #42b983);
   background-color: var(--color-success-bg, rgba(66, 185, 131, 0.15));
}
.wallet-button.disconnect:hover {
   border-color: var(--color-danger, #dc3545);
   color: var(--color-danger, #dc3545);
   background-color: var(--color-danger-bg, rgba(220, 53, 69, 0.15));
}
.wallet-error {
    color: var(--color-danger, #dc3545);
    font-size: 0.9em;
    margin-top: 0.5rem;
}
</style>