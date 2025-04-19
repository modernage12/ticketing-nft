<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth'; // Importa lo store
import { RouterLink } from 'vue-router'; // Lo usi per il link a Login

// Variabili reattive per i campi del form
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const registerAsCreator = ref(false); // Stato per la checkbox (già presente)

// Istanza dello store e gestione errori/loading locali al componente (opzionale, lo store ha già i suoi)
const authStore = useAuthStore();
const errorMessage = ref(''); // Errore specifico del componente (es. password non coincidono)
const isLoading = ref(false); // Loading specifico del componente

const handleRegister = async () => {
    // Resetta l'errore locale prima di provare
    errorMessage.value = '';
    // Usa l'errore dello store per errori API
    authStore.error = null;

    // --- Controllo password NUOVO (o migliorato) ---
    if (password.value !== confirmPassword.value) {
        errorMessage.value = "Le password non coincidono!"; // Imposta errore locale
        return; // Interrompi se le password non coincidono
    }

    isLoading.value = true; // Usa loading locale
    try {
        console.log(`RegisterView: Tentativo registrazione come ${registerAsCreator.value ? 'Creator' : 'Normale Utente'}`);

        // --- MODIFICA ALLA CHIAMATA ALLO STORE ---
        // Chiama l'azione 'register' dello store passando TUTTI e tre i valori
        await authStore.register(username.value, password.value, registerAsCreator.value);
        // --- FINE MODIFICA CHIAMATA ---

        // Se arriva qui, la registrazione nello store ha avuto successo
        // La redirezione a /login avviene già dentro l'azione dello store.
        // Non serve fare altro qui in caso di successo.

    } catch (error) {
        // L'azione dello store ora rilancia l'errore specifico
        console.error("Catch nel componente Register:", error);
        // Mostra l'errore specifico proveniente dallo store (o dall'azione stessa)
        errorMessage.value = error.message || 'Errore sconosciuto durante la registrazione.';
    } finally {
        isLoading.value = false; // Usa loading locale
    }
};
</script>

<template>
  <div> <h2>Registrazione</h2>

    <p v-if="errorMessage || authStore.error" style="color: red;">
        {{ errorMessage || authStore.error }}
    </p>

    <form @submit.prevent="handleRegister">
      <div>
        <label for="reg-username">Username:</label>
        <input type="text" id="reg-username" v-model="username" required :disabled="isLoading">
      </div>
      <div>
        <label for="reg-password">Password:</label>
        <input type="password" id="reg-password" v-model="password" required :disabled="isLoading">
      </div>
      <div>
        <label for="reg-confirm-password">Conferma:</label>
        <input type="password" id="reg-confirm-password" v-model="confirmPassword" required :disabled="isLoading">
      </div>

      <div class="form-group-checkbox" style="margin-top: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
        <input
          type="checkbox"
          id="registerAsCreator"
          v-model="registerAsCreator"
          :disabled="isLoading"
          style="width: auto; margin: 0;"
        />
        <label for="registerAsCreator" style="margin-bottom: 0; width: auto; font-weight: normal;">Registrati come Organizzatore/Artista</label>
      </div>
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Registrazione...' : 'Registrati' }}
      </button>
    </form>

    <p style="margin-top: 1rem;">Hai già un account? <RouterLink to="/login">Login</RouterLink></p>
  </div>
</template>

<style scoped>
 /* Stili di base forniti dall'utente */
 div { margin-bottom: 0.5rem; }
 label { display: inline-block; width: 80px; } /* Potrebbe essere necessario aggiustare */
 p[style*="color: red"] { margin-top: 1rem; }

 /* Stile per il pulsante (esempio) */
 button { padding: 0.5rem 1rem; cursor: pointer; }
 button:disabled { cursor: not-allowed; opacity: 0.6; }

 /* Stile per rendere il contenitore principale più centrato/formattato (opzionale) */
 .register-view { /* Applica questa classe al div contenitore principale se vuoi */
   max-width: 400px;
   margin: 2rem auto;
   padding: 2rem;
   border: 1px solid #ccc;
   border-radius: 8px;
 }
 /* Rimuovi il margin-bottom globale se usi il contenitore sopra */
 /* div { margin-bottom: 1rem; } */ /* Esempio sostituzione */
 label { display: block; margin-bottom: 0.3rem; width: auto;} /* Stile label migliorato */
 input[type="text"], input[type="password"] {
   width: 100%;
   padding: 0.5rem;
   box-sizing: border-box; /* Importante */
   margin-bottom: 0.8rem; /* Spazio dopo input */
 }

</style>