<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ethers } from 'ethers'; // Per formattare il prezzo

const authStore = useAuthStore();

// Stati locali per feedback specifico dell'acquisto marketplace
const buyLoadingId = ref(null);
const buyError = ref(null);
const buySuccessMessage = ref('');

// Funzione chiamata al click del pulsante "Compra"
const handleBuy = async (listing) => {
    // === MODIFICA: Confronto case-insensitive per sicurezza ===
    if (buyLoadingId.value !== null || listing.sellerAddress?.toLowerCase() === currentUserWalletAddress.value?.toLowerCase()) {
        console.warn("Acquisto già in corso o tentativo di comprare proprio item.");
        buyError.value = "Non puoi comprare la tua stessa offerta."; // Messaggio più chiaro
        return;
    }
    // =======================================================

    buyLoadingId.value = listing.tokenId;
    buyError.value = null;
    buySuccessMessage.value = '';

    try {
        console.log(`>>> MarketplaceView: Chiamo authStore.buyListedTicket per tokenId ${listing.tokenId}`);
        const result = await authStore.buyListedTicket(listing.tokenId);
        buySuccessMessage.value = `Acquisto del Ticket ID ${listing.tokenId} completato! Hash: ${result.buyTxHash}`;
    } catch (error) {
        buyError.value = authStore.error || 'Errore imprevisto durante l\'acquisto.';
        console.error("Errore catturato in MarketplaceView (buy):", error);
    } finally {
        buyLoadingId.value = null;
    }
};

// Funzioni per formattare
const formatPrice = (priceString) => { try { return ethers.formatUnits(priceString || '0', 6); } catch { return "N/A"; } };
const formatDate = (dateString) => { try { return new Date(dateString).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); } catch { return "N/A"; } };

// Carichiamo le offerte e i dati utente (se loggato) quando il componente viene montato
onMounted(() => {
  console.log(">>> MarketplaceView: onMounted");
   if (!authStore.user && authStore.isLoggedIn) { authStore.fetchUser(); }
  authStore.fetchListings();
});

// Proprietà computata per ottenere l'indirizzo wallet (già checksummed da ethers, ma usiamo toLowerCase per sicurezza)
const currentUserWalletAddress = computed(() => authStore.user?.walletAddress);

</script>

<template>
  <div>
    <h2>Marketplace - Biglietti in Vendita</h2>

    <p v-if="authStore.listingsLoading">Caricamento offerte...</p>
    <p v-else-if="authStore.listingsError" style="color: orange;">Attenzione: {{ authStore.listingsError }} Potresti vedere dati non aggiornati.</p>

    <div v-if="!authStore.listingsLoading">
      <ul v-if="authStore.listings.length > 0">
        <li v-for="listing in authStore.listings" :key="listing.tokenId" class="listing-card">
          <strong>Ticket ID:</strong> {{ listing.tokenId }} |
          <strong>Evento ID:</strong> {{ listing.eventId }} |
          <strong>Prezzo:</strong> {{ formatPrice(listing.price) }} Unità |
          <strong>Venditore:</strong> {{ listing.sellerAddress }} <br>
          <em>(Prezzo Orig.: {{ formatPrice(listing.originalPrice) }})</em>

          <button
            @click="handleBuy(listing)"
            :disabled="buyLoadingId === listing.tokenId || !authStore.isLoggedIn || listing.sellerAddress?.toLowerCase() === currentUserWalletAddress?.toLowerCase()"
            style="margin-left: 10px;">
            {{ buyLoadingId === listing.tokenId ? 'Acquisto...' : 'Compra' }}
          </button>
          <span v-if="authStore.isLoggedIn && listing.sellerAddress?.toLowerCase() === currentUserWalletAddress?.toLowerCase()" style="font-size: 0.8em; margin-left: 5px;">(Tuo)</span>
        </li>
      </ul>
      <p v-else>Nessuna offerta attiva al momento sul marketplace.</p>
    </div>

     <p v-if="buyError" style="color: red; margin-top: 1rem;">Errore Acquisto: {{ buyError }}</p>
     <p v-if="buySuccessMessage" style="color: green; margin-top: 1rem;">{{ buySuccessMessage }}</p>

     <p v-if="!authStore.isLoggedIn" style="color: orange; margin-top: 1rem;">Devi fare login per acquistare i biglietti.</p>

  </div>
</template>

<style scoped>
 ul { list-style: none; padding: 0; }
 li.listing-card { border: 1px solid #555; padding: 0.75rem; margin-bottom: 0.75rem; background-color: #2a2a2a; border-radius: 4px; font-size: 0.9em; }
 button { margin-top: 0.5rem; }
 p[style*="color: red"], p[style*="color: green"], p[style*="color: orange"] { margin-top: 1rem; font-weight: bold;}
 button:disabled {
  background-color: #6c757d !important; /* Grigio scuro */
  color: white !important;
  cursor: not-allowed;
  opacity: 0.7;
}
</style>