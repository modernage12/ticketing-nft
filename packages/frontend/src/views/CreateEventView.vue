<template>
    <div class="create-event-view">
      <h2>Crea Nuovo Evento</h2>
      <form @submit.prevent="handleCreateEvent">
        <div class="form-group">
          <label for="eventName">Nome Evento:</label>
          <input type="text" id="eventName" v-model="eventData.name" required>
        </div>
        <div class="form-group">
          <label for="eventDate">Data Evento:</label>
          <input type="datetime-local" id="eventDate" v-model="eventData.date" required>
        </div>
        <div class="form-group">
          <label for="eventLocation">Luogo:</label>
          <input type="text" id="eventLocation" v-model="eventData.location" required>
        </div>
        <div class="form-group">
          <label for="totalTickets">Numero Biglietti Totali:</label>
          <input type="number" id="totalTickets" v-model.number="eventData.total_tickets" min="1" required>
        </div>
        <div class="form-group">
          <label for="ticketPrice">Prezzo Biglietto (MATIC):</label>
          <input type="number" id="ticketPrice" v-model.number="eventData.price" step="0.000001" min="0" required>
        </div>
        <div class="form-group">
          <label for="eventDescription">Descrizione:</label>
          <textarea id="eventDescription" v-model="eventData.description" rows="3"></textarea>
        </div>
  
        <button type="submit" :disabled="isLoading">
          {{ isLoading ? 'Creazione in corso...' : 'Crea Evento' }}
        </button>
  
        <p v-if="successMessage" class="success-message">{{ successMessage }}</p>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      </form>
    </div>
  </template>
  
  <script setup>
  import { ref } from 'vue';
  import { useAuthStore } from '@/stores/auth'; // Assicurati che il percorso sia corretto
  import api from '@/axios-config';
  import { useRouter } from 'vue-router'; // Per reindirizzare dopo la creazione
  
  const authStore = useAuthStore();
  const router = useRouter();
  
  const eventData = ref({
    name: '',
    date: '',
    location: '',
    total_tickets: null,
    price: null, // Il prezzo sarà inviato come numero
    description: '',
  });
  
  const isLoading = ref(false);
  const successMessage = ref('');
  const errorMessage = ref('');
  
  const handleCreateEvent = async () => {
    isLoading.value = true;
    successMessage.value = '';
    errorMessage.value = '';
  
    // Formattiamo il prezzo in stringa (wei) se necessario dal backend
    // Se il backend si aspetta MATIC come numero, questa conversione non serve.
    // Se si aspetta wei, dovrai importare ethers e usare parseUnits
    // const priceInWei = ethers.parseUnits(eventData.value.price.toString(), 18).toString();
  
    const payload = {
      name: eventData.value.name,
      date: eventData.value.date,
      location: eventData.value.location,
      totalTickets: eventData.value.total_tickets,
      // Usa eventData.value.price se il backend accetta MATIC come numero
      // Usa priceInWei se il backend accetta Wei come stringa
      price: eventData.value.price, // Assumiamo che il backend accetti MATIC come numero per ora
      description: eventData.value.description,
    };
  
    try {
      const response = await api.post('/events', payload, {
        headers: {
          'Authorization': `Bearer ${authStore.token}` // Invia il token per l'autorizzazione admin
        }
      });
  
      successMessage.value = `Evento "${response.data.event.name}" creato con successo! ID: ${response.data.event.event_id}`;
      // Opzionale: resetta il form
      eventData.value = { name: '', date: '', location: '', total_tickets: null, price: null, description: '' };
      // Opzionale: reindirizza alla pagina eventi dopo un breve ritardo
      setTimeout(() => {
        router.push('/events');
      }, 2000);
  
    } catch (error) {
      console.error("Errore durante la creazione dell'evento:", error);
      if (error.response && error.response.data && error.response.data.message) {
        errorMessage.value = `Errore: ${error.response.data.message}`;
      } else {
        errorMessage.value = 'Si è verificato un errore durante la creazione dell\'evento.';
      }
    } finally {
      isLoading.value = false;
    }
  };
  </script>
  
  <style scoped>
  .create-event-view {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    background-color: #f9f9f9;
  }
  
  h2 {
    text-align: center;
    margin-bottom: 1.5rem;
    color: #333;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
    color: #555;
  }
  
  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box; /* Important per non far eccedere la larghezza */
  }
  
  button {
    display: block;
    width: 100%;
    padding: 0.8rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.3s ease;
  }
  
  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
  
  button:not(:disabled):hover {
    background-color: #0056b3;
  }
  
  .success-message {
    margin-top: 1rem;
    color: green;
    text-align: center;
  }
  
  .error-message {
    margin-top: 1rem;
    color: red;
    text-align: center;
  }

  .form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
  resize: vertical; /* Permette resize verticale */
  font-family: inherit; /* Usa lo stesso font degli input */
}

  </style>