<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth'; // Importa lo store (usa @ per src/)
import { RouterLink } from 'vue-router'; // Assicurati sia importato se usi <RouterLink>

const username = ref('');
const password = ref('');
const authStore = useAuthStore(); // Ottieni l'istanza dello store

const handleLogin = async () => {
  // === LOG DI CONTROLLO INIZIALE ===
  console.log("--- handleLogin CHIAMATO ---"); // Log 1

  // === LOG DI DEBUG AGGIUNTIVI ===
  console.log("Valore username:", username.value); // Log 2
  console.log("Valore password:", password.value ? '********' : 'vuota'); // Log 3 (Non loggare password reali)
  console.log("Oggetto authStore esiste?", !!authStore); // Log 4
  console.log("Funzione authStore.login esiste?", typeof authStore.login === 'function'); // Log 5
  // =============================

  // Resetta errore locale (se ne avessimo uno) e errore store
  authStore.error = null;

  // Aggiungiamo try/catch qui nel componente per massima sicurezza
  try {
      // === Log PRIMA della chiamata ===
      console.log(">>> LoginView: Sto per chiamare authStore.login..."); // Log 6
      await authStore.login(username.value, password.value);
      // === Log DOPO la chiamata (se non ci sono errori await) ===
      // Se vedi questo log, significa che l'azione login dello store è terminata (con successo o errore gestito internamente)
      console.log(">>> LoginView: Chiamata a authStore.login TERMINATA (await completato)."); // Log 7
      // La redirezione avviene dentro l'azione dello store se ha successo
  } catch (componentError) {
      // Cattura errori RILANCIATI dall'azione dello store o altri errori imprevisti qui
      console.error("!!! ERRORE catturato nel componente LoginView durante handleLogin:", componentError);
      // L'errore dovrebbe essere già impostato in authStore.error dall'azione,
      // ma loggarlo qui conferma che l'azione ha effettivamente lanciato (throw) un errore.
  }
};
</script>

<template>
  <div>
    <h2>Login</h2>
    <p v-if="authStore.error" style="color: red;">{{ authStore.error }}</p>
    <form @submit.prevent="handleLogin" :disabled="authStore.loading">
      <div>
        <label for="username">Username:</label>
        <input type="text" id="username" v-model="username" required :disabled="authStore.loading">
      </div>
      <div>
        <label for="password">Password:</label>
        <input type="password" id="password" v-model="password" required :disabled="authStore.loading">
      </div>
      <button type="submit" :disabled="authStore.loading">
        {{ authStore.loading ? 'Caricamento...' : 'Login' }}
      </button>
    </form>
    <p>Non hai un account? <RouterLink to="/register">Registrati</RouterLink></p>
  </div>
</template>

<style scoped>
div { margin-bottom: 0.5rem; }
label { display: inline-block; width: 80px; }
p[style*="color: red"] { margin-top: 1rem; } /* Stile per errore */
</style>