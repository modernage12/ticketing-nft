<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ethers } from 'ethers'; // Per formattare il prezzo
import { useWalletStore } from '@/stores/wallet';
import MarketplaceJson from '@/contracts/abi/Marketplace.json';
import { MARKETPLACE_ADDRESS } from '@/contracts/config.js'; 

const authStore = useAuthStore();

// Stati locali per feedback specifico dell'acquisto marketplace
const buyLoadingId = ref(null);
const buyError = ref(null);
const buySuccessMessage = ref('');
const walletStore = useWalletStore();        // <== CREA ISTANZA Wallet Store
const MARKETPLACE_ABI = MarketplaceJson.abi; // <== DEFINISCI ABI Marketplace

// Funzione COMPLETA e AGGIORNATA per gestire l'acquisto (sostituisce quella vecchia)
const handleBuy = async (listing) => {
    // --- [INIZIO BLOCCO DEFINIZIONE VARIABILI E VALIDAZIONE] ---
    // Queste righe estraggono i dati dal listing e fanno controlli preliminari
    const { tokenId, price, sellerAddress, listing_id } = listing;

    if (tokenId === undefined || price === undefined || price === null) {
        console.error("handleBuy: Dati listing mancanti (tokenId, price)", listing);
        buyError.value = "Dati annuncio non validi per l'acquisto.";
        return;
    }
    const currentExtAddress = walletStore.connectedAddress;
    const currentIntAddress = authStore.user?.walletAddress;
    const isMyOwnListing = sellerAddress?.toLowerCase() === currentExtAddress?.toLowerCase() ||
                           sellerAddress?.toLowerCase() === currentIntAddress?.toLowerCase();

    if (isMyOwnListing) {
         console.warn("Tentativo di comprare proprio item.");
         buyError.value = "Non puoi comprare la tua stessa offerta.";
         return;
    }
    if (buyLoadingId.value !== null) return;

    console.log(`>>> MarketplaceView: handleBuy INIZIO per tokenId=<span class="math-inline">\{tokenId\}, price\=</span>{price} Wei`);
    buyLoadingId.value = tokenId;
    buyError.value = null; buySuccessMessage.value = '';

    let listingPriceBigInt;
    try {
        listingPriceBigInt = BigInt(price);
    } catch (e) {
        buyError.value = "Prezzo annuncio non valido.";
        buyLoadingId.value = null;
        return;
    }
    // --- [FINE BLOCCO DEFINIZIONE VARIABILI E VALIDAZIONE] ---

    // --- [INIZIO BLOCCO CONTROLLO WALLET INTERNO/ESTERNO] ---
    // Questa è la parte nuova che decide quale logica usare
    if (walletStore.isUsingExternalWallet) {
        // --- [INIZIO BLOCCO LOGICA WALLET ESTERNO (Nuova)] ---
        // Tutto il codice da qui fino al 'catch' e 'finally' è per Brave/MetaMask
        try {
            console.log(`>>> MarketplaceView: Tentativo Buy (Legacy Gas + Fee Calc) con Wallet Esterno per tokenId=<span class="math-inline">\{tokenId\}, price\=</span>{listingPriceBigInt}`);
            const signer = await walletStore.ensureSigner();
            if (!signer) throw new Error("Wallet esterno non connesso o signer non valido.");
            const signerAddress = await signer.getAddress();
            console.log(">>> MarketplaceView: Signer ottenuto per Buy:", signerAddress);

             if (signerAddress.toLowerCase() === sellerAddress?.toLowerCase()) {
                 throw new Error("Non puoi comprare la tua stessa offerta.");
             }

            let currentProvider = signer.provider;
            if (!currentProvider && window.ethereum) {
                currentProvider = new ethers.BrowserProvider(window.ethereum);
            }
             if (!currentProvider) throw new Error("Impossibile ottenere provider per fee data e fee rate.");

            // --- LEGGI COMMISSIONE E CALCOLA VALORE TOTALE ---
            console.log(">>> MarketplaceView: Leggo parametri commissione dal contratto Marketplace...");
            const marketContractReader = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, currentProvider);
            const feeBasisPoints = await marketContractReader.serviceFeeBasisPoints();
            console.log(`>>> MarketplaceView: Fee Basis Points letti: ${feeBasisPoints}`);
            const commissionAmount = (listingPriceBigInt * feeBasisPoints) / 10000n;
            const totalValueToSend = listingPriceBigInt + commissionAmount; // <== CALCOLA VALORE TOTALE
            console.log(`>>> MarketplaceView: Prezzo: ${listingPriceBigInt}, Commissione: ${commissionAmount}, Totale da inviare: ${totalValueToSend}`);
            // -------------------------------------------------

            // Ottieni gasPrice legacy
            console.log(">>> MarketplaceView: Ottengo dati fee gas attuali...");
            const feeData = await currentProvider.getFeeData();
            const legacyGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : ethers.parseUnits('20', 'gwei');
            console.log(`>>> MarketplaceView: Uso gasPrice legacy per Buy: ${legacyGasPrice.toString()} Wei`);

            // Prepara i dati della transazione 'buyItem'
            const marketInterface = new ethers.Interface(MARKETPLACE_ABI);
            console.log(`>>> MarketplaceView: Preparo dati per buyItem Tx (TokenId: ${tokenId})...`);
            const buyData = marketInterface.encodeFunctionData("buyItem", [tokenId]);

            const buyTxObject = {
                to: MARKETPLACE_ADDRESS,
                data: buyData,
                value: totalValueToSend, // <== USA IL VALORE TOTALE!
                gasLimit: 300000,
                gasPrice: legacyGasPrice
            };

            // Invia la transazione
            console.log(`>>> MarketplaceView: Invio buyItem Tx via signer.sendTransaction...`, buyTxObject);
            const buyTxResponse = await signer.sendTransaction(buyTxObject);
            buySuccessMessage.value = `Acquisto inviato (Tx: ${buyTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MarketplaceView: buyItem Tx inviata, attendo ricevuta...", buyTxResponse.hash);
            const buyReceipt = await buyTxResponse.wait(1);

            if (buyReceipt.status !== 1) {
                // Prova a vedere se c'è un messaggio di revert specifico ora
                let revertReason = "Acquisto fallito on-chain.";
                try {
                     // Questa chiamata potrebbe fallire se il provider non la supporta o la tx non è fallita con un reason
                     const txInfo = await currentProvider.getTransaction(buyReceipt.hash);
                     if (txInfo) {
                         await currentProvider.call(txInfo, buyReceipt.blockNumber); // Questo dovrebbe rigettare con il motivo
                     }
                } catch (error) {
                     // Prova ad estrarre il motivo dall'errore del .call()
                     revertReason = error?.revert?.args?.[0] || error?.reason || revertReason;
                     console.error("Errore durante il tentativo di ottenere il motivo del revert:", error);
                }
                throw new Error(`${revertReason} Status: ${buyReceipt.status}, Tx: ${buyTxResponse.hash}`);
            }
            console.log(">>> MarketplaceView: buyItem Tx confermata:", buyReceipt.hash);

            // Successo! Aggiorna UI / Mostra successo
            buySuccessMessage.value = `Biglietto ${tokenId} acquistato con successo (Ext)! Hash: ${buyReceipt.hash}`;
            await authStore.fetchListings();
            await authStore.fetchMyTickets();

        } catch (error) {
            console.error(">>> MarketplaceView: Errore acquisto con wallet esterno:", error);
            const reason = error?.message || "Errore sconosciuto."; // Usa il messaggio elaborato sopra se disponibile
            buyError.value = `Errore Acquisto (Esterno): ${reason}`;
        } finally {
            buyLoadingId.value = null;
        }
        // --- [FINE BLOCCO LOGICA WALLET ESTERNO] ---

    } else {
        // --- [INIZIO BLOCCO LOGICA WALLET INTERNO (Vecchia)] ---
        // Questo blocco 'else' contiene la logica che c'era prima,
        // che chiama il backend per fare l'acquisto con il wallet interno.
        try {
            console.log(`>>> MarketplaceView: Chiamo authStore.buyFromMarketplace(listingId=${listing_id}) (interno)...`);
            const result = await authStore.buyFromMarketplace(listing_id);
            console.log(`>>> MarketplaceView: Risultato ricevuto da buyFromMarketplace (interno):`, result);
            buySuccessMessage.value = `Biglietto ${tokenId} acquistato! Hash: ${result.buyTxHash}`;
        } catch (error) {
            console.error(">>> MarketplaceView: ERRORE nel catch di handleBuy (interno):", error);
            buyError.value = error?.message || authStore.error || 'Errore imprevisto acquisto.';
        } finally {
             buyLoadingId.value = null;
        }
        // --- [FINE BLOCCO LOGICA WALLET INTERNO] ---
    }
    // --- [FINE BLOCCO CONTROLLO WALLET INTERNO/ESTERNO] ---
}; // <== Parentesi graffa finale della funzione handleBuy

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
 li.listing-card { border: 1px solid #555; padding: 0.75rem; margin-bottom: 0.75rem; border-radius: 4px; font-size: 0.9em; }
 button { margin-top: 0.5rem; }
 p[style*="color: red"], p[style*="color: green"], p[style*="color: orange"] { margin-top: 1rem; font-weight: bold;}
 button:disabled {
  background-color: #6c757d !important; /* Grigio scuro */
  color: white !important;
  cursor: not-allowed;
  opacity: 0.7;
}
</style>