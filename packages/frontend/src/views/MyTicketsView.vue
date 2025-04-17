<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ethers } from 'ethers';

const authStore = useAuthStore();

// Stati locali per feedback azioni List e Cancel
const listLoading = ref(false);
const listError = ref(null);
const listSuccessMessage = ref('');
const cancelLoadingId = ref(null); // Memorizza l'ID del token in annullamento
const cancelError = ref(null);
const cancelSuccessMessage = ref('');


// Funzione per mettere in vendita
const handleListTicket = async (tokenId, originalPriceString) => {
  listLoading.value = true; listError.value = null; listSuccessMessage.value = '';
  cancelError.value = null; cancelSuccessMessage.value = ''; // Resetta altri errori

  // UI Semplice con Prompt (da migliorare!)
  const priceStringInput = window.prompt(`Prezzo vendita (unità minime, es. 50000000) per Ticket ID ${tokenId}? (Orig: ${originalPriceString}, Max: ${originalPriceString})`);

  if (priceStringInput === null) { listLoading.value = false; return; }
  if (!priceStringInput || isNaN(Number(priceStringInput)) || Number(priceStringInput) <= 0) {
    listError.value = "Inserisci un prezzo numerico valido e positivo."; listLoading.value = false; return;
  }

  try {
    const listingPriceBigInt = BigInt(priceStringInput);
    const originalPriceBigInt = BigInt(originalPriceString || '0'); // Gestisce originalPrice non definito
    if (originalPriceBigInt > 0 && listingPriceBigInt > originalPriceBigInt) {
      listError.value = `Errore: Il prezzo (<span class="math-inline">\{priceStringInput\}\) supera l'originale \(</span>{originalPriceString}).`; listLoading.value = false; return;
    }

    console.log(`>>> MyTicketsView: Chiamo authStore.listTicketForSale con tokenId=<span class="math-inline">\{tokenId\}, price\=</span>{priceStringInput}`);
    const result = await authStore.listTicketForSale(tokenId, priceStringInput);
    // Usa optional chaining per sicurezza
    const approveHash = result?.approveTxHash?.substring(0, 6) ?? 'N/A';
    const listHash = result?.listItemTxHash?.substring(0, 6) ?? 'N/A';
    listSuccessMessage.value = `Biglietto messo in vendita! Hash transazione: ${result?.listItemTxHash ?? 'N/D'}`;
    // Lo store ricarica myTickets e listings dopo successo

  } catch (error) {
    console.error("Errore catturato in MyTicketsView (list):", error);
    listError.value = error?.message || 'Errore imprevisto messa in vendita.';
  } finally {
    listLoading.value = false;
  }
};

// Funzione per annullare l'offerta
 const handleCancelListing = async (tokenId) => {
    if (cancelLoadingId.value !== null) return; // Evita click multipli
    console.log(`>>> MyTicketsView: handleCancelListing INIZIO per tokenId=${tokenId}`);
    cancelLoadingId.value = tokenId; // Blocca solo questo bottone
    cancelError.value = null; cancelSuccessMessage.value = '';
    listError.value = null; listSuccessMessage.value = ''; // Resetta altri errori

    try {
        console.log(`>>> MyTicketsView: Chiamo authStore.cancelListing(tokenId=${tokenId})...`);
        const result = await authStore.cancelListing(tokenId);
        console.log(`>>> MyTicketsView: Risultato ricevuto da cancelListing:`, result);
        // Usa optional chaining per sicurezza
        const cancelHash = result?.cancelTxHash?.substring(0, 6) ?? 'N/A';
        cancelSuccessMessage.value = `Offerta annullata! Hash transazione: ${result?.cancelTxHash ?? 'N/D'}`;
        // Lo store ricarica myTickets e listings dopo successo
    } catch (error) {
        console.error(">>> MyTicketsView: ERRORE nel catch di handleCancelListing:", error);
        // Mostra l'errore specifico ricevuto dallo store (che lo prende dal backend)
        cancelError.value = error?.message || authStore.error || 'Errore imprevisto annullamento.';
    } finally {
        console.log(">>> MyTicketsView: Eseguo finally block di handleCancelListing.");
        cancelLoadingId.value = null; // Resetta loading specifico
    }
 };

// Funzioni per formattare
const formatPrice = (priceString) => { try { return ethers.formatUnits(priceString || '0', 6); } catch { return "N/A"; } };
const formatDate = (dateString) => { try { return new Date(dateString).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); } catch { return "N/A"; } };

// Carichiamo i biglietti al montaggio
onMounted(() => {
  console.log(">>> MyTicketsView: onMounted");
  if (!authStore.user && authStore.isLoggedIn) { authStore.fetchUser(); }
  // Chiamiamo fetchMyTickets dopo un piccolo delay per dare tempo a fetchUser
  setTimeout(() => {
     console.log(">>> MyTicketsView: Chiamo fetchMyTickets...");
     authStore.fetchMyTickets();
  }, 150); // Aumentato leggermente il delay
});

const currentUserWalletAddress = computed(() => authStore.user?.walletAddress);
</script>

<template>
  <div>
    <h2>I Miei Biglietti</h2>
    <div v-if="authStore.user" style="margin-bottom: 1rem;">
      <span>Benvenuto {{ authStore.user.username }} ({{ currentUserWalletAddress }})!</span>
      <button @click="authStore.logout()" style="margin-left: 15px;">Logout</button>
    </div>
     <p v-else-if="authStore.loading">Caricamento dati utente...</p>
     <p v-else>Per favore, effettua il login per vedere i tuoi biglietti.</p>
    <hr>

    <h3>Elenco Biglietti Posseduti:</h3>
    <p v-if="authStore.myTicketsLoading">Caricamento biglietti...</p>
    <p v-else-if="authStore.myTicketsError" style="color: orange;">Attenzione: {{ authStore.myTicketsError }}</p>

    <p v-if="listError" style="color: red;">Errore Listatura: {{ listError }}</p>
    <p v-if="listSuccessMessage" style="color: green;">{{ listSuccessMessage }}</p>
    <p v-if="cancelError" style="color: red;">Errore Annullamento: {{ cancelError }}</p>
    <p v-if="cancelSuccessMessage" style="color: green;">{{ cancelSuccessMessage }}</p>

    <div v-if="!authStore.myTicketsLoading">
      <ul v-if="authStore.myTickets.length > 0" style="margin-top: 1rem;">
        <li v-for="ticket in authStore.myTickets" :key="ticket.tokenId" class="ticket-card">
          <span>
            ID: {{ ticket.tokenId }} |
            Ev: {{ ticket.eventId }} |
            PO: {{ ticket.originalPrice }} |
            Em: {{ formatDate(ticket.issuanceDate) }} |
            List: <strong :style="{ color: ticket.isListed ? 'lightgreen' : 'inherit' }">{{ ticket.isListed ? 'Sì' : 'No' }}</strong>
          </span>
          <span> <button
              v-if="!ticket.isListed"
              @click="handleListTicket(ticket.tokenId, ticket.originalPrice)"
              :disabled="listLoading || cancelLoadingId !== null"
              style="margin-left: 10px;">
              {{ listLoading ? '...' : 'Vendi' }}
            </button>
            <button
              v-if="ticket.isListed"
              @click="handleCancelListing(ticket.tokenId)"
              :disabled="cancelLoadingId === ticket.tokenId || listLoading"
              style="margin-left: 10px; background-color: #dc3545; border-color: #dc3545; color: white;">
              {{ cancelLoadingId === ticket.tokenId ? 'Annull...' : 'Annulla Offerta' }}
            </button>
          </span>
        </li>
      </ul>
      <p v-else-if="!authStore.myTicketsError">Non possiedi ancora nessun biglietto.</p>
    </div>

  </div>
</template>

<style scoped>
 /* Stili esistenti + allineamento */
 ul { list-style: none; padding: 0; }
 li.ticket-card { border: 1px solid #555; padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 4px; font-size: 0.9em; display: flex; justify-content: space-between; align-items: center;}
 hr { margin: 1rem 0; }
 button { padding: 0.2em 0.5em; font-size: 0.85em;}
 p[style*="color: red"], p[style*="color: green"], p[style*="color: orange"] { margin-top: 1rem; font-weight: bold; }
 button:disabled { cursor: not-allowed; opacity: 0.6; }
</style>