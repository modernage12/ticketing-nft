<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth'; // Importa lo store (usa @ per src/)
import { RouterLink, useRouter } from 'vue-router'; // Importa useRouter

const username = ref('');
const password = ref('');
const authStore = useAuthStore(); // Ottieni l'istanza dello store

const handleLogin = async () => {
  // Riprendiamo i log di debug che avevamo messo, possono sempre servire
  console.log("--- handleLogin CHIAMATO ---");
  console.log("Valore username:", username.value);
  console.log("Valore password:", password.value ? '********' : 'vuota');
  console.log("Oggetto authStore esiste?", !!authStore);
  console.log("Funzione authStore.login esiste?", typeof authStore.login === 'function');

  // Resetta errore store prima di tentare
  authStore.error = null;

  try {
    console.log(">>> LoginView: Sto per chiamare authStore.login...");
    await authStore.login(username.value, password.value);
    // Se arriva qui, l'azione login nello store è terminata (con successo o errore gestito)
    // Il redirect avviene dentro l'azione login se ha successo
    console.log(">>> LoginView: Chiamata a authStore.login TERMINATA.");
  } catch (componentError) {
    // Cattura solo errori gravi RILANCIATI dall'azione login (es. fallimento fetchUser dopo login ok)
    // L'errore di credenziali errate viene gestito e messo in authStore.error DENTRO l'azione login.
    console.error("!!! ERRORE catturato nel componente LoginView durante handleLogin:", componentError);
    // Potremmo voler mostrare un errore generico qui se necessario,
    // ma di solito l'errore specifico è già in authStore.error e mostrato nel template.
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
    <hr style="margin: 2rem 0;" />
    
    <p>Non hai un account? <RouterLink to="/register">Registrati</RouterLink></p>
  </div>
</template>

<style scoped>
div { margin-bottom: 0.5rem; }
label { display: inline-block; width: 80px; }
p[style*="color: red"] { margin-top: 1rem; } /* Stile per errore */
</style>