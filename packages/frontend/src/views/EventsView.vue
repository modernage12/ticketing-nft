<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ethers } from 'ethers'; // Per formattare il prezzo

const authStore = useAuthStore();

// Stati locali per feedback specifico dell'acquisto
const isLoadingBuy = ref(false);
const buyError = ref(null);
const buySuccessMessage = ref('');

// Funzione chiamata quando si clicca "Compra Biglietto" per un evento
const handleBuyTicket = async (eventId) => {
    console.log(`>>> EventsView: handleBuyTicket chiamato per eventId: ${eventId}`);
    isLoadingBuy.value = true; buyError.value = null; buySuccessMessage.value = '';
    try {
        console.log(`>>> EventsView: Sto per chiamare authStore.buyTicket(${eventId})...`);
        const result = await authStore.buyTicket(eventId); // Chiama l'azione per l'acquisto PRIMARIO
        console.log(`>>> EventsView: Chiamata authStore.buyTicket completata.`);
        // Usa optional chaining ?. per accedere ai risultati in modo sicuro
        const tokenId = result?.tokenId ?? '?';
        const txHash = result?.transactionHash?.substring(0, 6) ?? 'N/A';
        buySuccessMessage.value = `Acquisto completato! Hash transazione: ${result?.transactionHash ?? 'N/D'}`;
    } catch (error) {
        console.error(">>> EventsView: ERRORE SPECIFICO ricevuto da authStore.buyTicket:", error);
        buyError.value = error?.message || authStore.error || 'Errore imprevisto durante l\'acquisto.';
        console.error("Errore catturato e impostato in EventsView (buyError):", buyError.value);
    } finally {
        console.log(">>> EventsView: Eseguo finally block di handleBuyTicket.");
        isLoadingBuy.value = false;
    }
};

// Funzione per formattare il prezzo letto dal DB (BigInt come stringa)
const formatPrice = (priceString) => {
    try { return ethers.formatUnits(priceString || '0', 6); } catch { return "N/A"; }
};

 // Funzione per formattare la data
 const formatDate = (dateString) => {
    try { return new Date(dateString).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); } catch { return "N/A"; }
 };

// Carichiamo gli eventi quando il componente viene montato
onMounted(() => {
  console.log(">>> EventsView: onMounted");
   // Chiamiamo fetchUser solo se serve e l'utente è loggato
   if (!authStore.user && authStore.isLoggedIn) {
       console.log(">>> EventsView: Chiamo fetchUser perché user è null ma token esiste.");
       authStore.fetchUser();
   }
  console.log(">>> EventsView: Chiamo fetchEvents..."); // Log prima della chiamata
  authStore.fetchEvents(); // Chiama l'azione dello store
});

// Proprietà computata per ottenere l'indirizzo wallet dell'utente loggato
const currentUserWalletAddress = computed(() => authStore.user?.walletAddress);

</script>

<template>
  <div>
    <h2>Eventi Disponibili</h2>

    <p v-if="authStore.eventsLoading">Caricamento eventi...</p>
    <p v-else-if="authStore.eventsError" style="color: orange;">Attenzione: {{ authStore.eventsError }}</p>

    <div v-else-if="authStore.events.length > 0">
      <div v-for="event in authStore.events" :key="event.event_id" class="event-card">
        <h3>{{ event.name }} (ID: {{ event.event_id }})</h3>
        <p><strong>Descrizione:</strong> {{ event.description || 'N/D' }}</p>
        <p><strong>Data:</strong> {{ formatDate(event.date) }}</p>
        <p><strong>Luogo:</strong> {{ event.location || 'N/D' }}</p>
        <p><strong>Prezzo:</strong> {{ formatPrice(event.original_price) }} Unità</p>
        <p><strong>Disponibili:</strong> {{ event.total_tickets - event.tickets_minted }} / {{ event.total_tickets }}</p>

        <button
          @click="handleBuyTicket(event.event_id)"
          :disabled="isLoadingBuy || !authStore.isLoggedIn || (event.tickets_minted >= event.total_tickets)"
          >
          {{ isLoadingBuy ? 'Acquisto...' : (event.tickets_minted >= event.total_tickets ? 'Esaurito' : 'Compra Biglietto') }}
        </button>
      </div>
       <p v-if="buyError" style="color: red; margin-top: 1rem;">Errore Acquisto: {{ buyError }}</p>
       <p v-if="buySuccessMessage" style="color: green; margin-top: 1rem;">{{ buySuccessMessage }}</p>
    </div>

     <p v-else>Nessun evento disponibile al momento.</p>

    <p v-if="!authStore.isLoggedIn" style="color: orange; margin-top: 1rem;">Devi fare login per acquistare i biglietti.</p>

  </div>
</template>

<style scoped>
  .event-card {
    border: 1px solid #ccc;
    padding: 1rem;
    margin-bottom: 1rem;
    /* background-color: #2a2a2a; */
    border-radius: 4px;
  }
   button { margin-top: 0.5rem; }
   p[style*="color: red"], p[style*="color: green"], p[style*="color: orange"] { margin-top: 1rem; font-weight: bold;}
   button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
   }
</style>