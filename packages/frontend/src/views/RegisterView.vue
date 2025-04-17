<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth'; // Importa lo store
import { RouterLink } from 'vue-router';

const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const authStore = useAuthStore(); // Ottieni l'istanza dello store

const handleRegister = async () => {
    if (password.value !== confirmPassword.value) {
        authStore.error = "Le password non coincidono!"; // Imposta errore nello store
        return;
    }
    // Chiama l'azione 'register' dello store
    await authStore.register(username.value, password.value)
       .catch(err => {
           // L'errore viene già impostato nello store dall'azione,
           // ma il catch qui previene errori non gestiti nel console del browser
           console.error("Catch nel componente Register:", err);
       });
    // La redirezione viene gestita DENTRO l'azione register dello store
};
</script>

<template>
  <div>
    <h2>Registrazione</h2>
     <p v-if="authStore.error" style="color: red;">{{ authStore.error }}</p>
    <form @submit.prevent="handleRegister" :disabled="authStore.loading">
      <div>
        <label for="reg-username">Username:</label>
        <input type="text" id="reg-username" v-model="username" required :disabled="authStore.loading">
      </div>
      <div>
        <label for="reg-password">Password:</label>
        <input type="password" id="reg-password" v-model="password" required :disabled="authStore.loading">
      </div>
       <div>
        <label for="reg-confirm-password">Conferma:</label>
        <input type="password" id="reg-confirm-password" v-model="confirmPassword" required :disabled="authStore.loading">
      </div>
      <button type="submit" :disabled="authStore.loading">
         {{ authStore.loading ? 'Caricamento...' : 'Registrati' }}
      </button>
    </form>
     <p>Hai già un account? <RouterLink to="/login">Login</RouterLink></p>
  </div>
</template>

 <style scoped>
 div { margin-bottom: 0.5rem; }
 label { display: inline-block; width: 80px; }
 p[style*="color: red"] { margin-top: 1rem; } /* Stile per errore */
 </style>