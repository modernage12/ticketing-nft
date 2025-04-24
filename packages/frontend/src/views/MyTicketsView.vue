<script setup>
// --- Importazioni Essenziali ---
// Aggiunto watchEffect qui
import { ref, onMounted, computed, watchEffect } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useWalletStore } from '@/stores/wallet'; // Importa lo store del wallet
import { ethers } from 'ethers';

// --- Importazioni Contratti ---
import TicketNFTJson from '@/contracts/abi/TicketNFT.json';
import MarketplaceJson from '@/contracts/abi/Marketplace.json';
import { TICKET_NFT_ADDRESS, MARKETPLACE_ADDRESS } from '@/contracts/config.js';

// --- Importazione Axios ---
import axios from 'axios';

// --- Istanze Store ---
const authStore = useAuthStore();
const walletStore = useWalletStore(); // Usa l'istanza dello store wallet

// --- Stati Locali ---
const listLoading = ref(false);
const listError = ref(null);
const listSuccessMessage = ref('');
const cancelLoadingId = ref(null);
const cancelError = ref(null);
const cancelSuccessMessage = ref('');

// --- Estrazione ABI ---
const TICKET_NFT_ABI = TicketNFTJson.abi;
const MARKETPLACE_ABI = MarketplaceJson.abi;

// --- Computed Property Aggiornata per Indirizzo Corrente ---
const currentUserWalletAddress = computed(() => {
    // Mostra l'indirizzo esterno se è quello attivo e disponibile
    if (walletStore.isUsingExternalWallet && walletStore.account) {
        return walletStore.account;
    }
    // Altrimenti mostra quello interno se l'utente è loggato
    return authStore.user?.walletAddress;
});

// --- Funzione handleListTicket (Versione originale fornita) ---
const handleListTicket = async (tokenId, originalPriceString) => {
    listLoading.value = true; listError.value = null; listSuccessMessage.value = '';
    cancelError.value = null; cancelSuccessMessage.value = '';

    const priceStringInput = window.prompt(`Prezzo vendita (unità minime, es. 500000000000000000 Wei) per Ticket ID ${tokenId}? (Orig: ${originalPriceString} Wei, Max: ${originalPriceString} Wei)`);

    if (priceStringInput === null) { listLoading.value = false; return; }
    if (!priceStringInput || isNaN(Number(priceStringInput)) || Number(priceStringInput) <= 0) {
        listError.value = "Inserisci un prezzo numerico valido e positivo (in Wei)."; listLoading.value = false; return;
    }

    let listingPriceBigInt;
    try {
        listingPriceBigInt = BigInt(priceStringInput);
        const originalPriceBigInt = BigInt(originalPriceString || '0');
        if (originalPriceBigInt > 0 && listingPriceBigInt > originalPriceBigInt) {
            listError.value = `Errore: Il prezzo (${listingPriceBigInt} Wei) supera l'originale (${originalPriceBigInt} Wei).`;
            listLoading.value = false;
            return;
        }
    } catch (e) {
        listError.value = "Errore nella conversione del prezzo in BigInt.";
        listLoading.value = false;
        return;
    }

    if (walletStore.isUsingExternalWallet) {
        // --- Logica Wallet Esterno (originale fornita) ---
        try {
            console.log(`>>> MyTicketsView: Tentativo list (sendTransaction) con Wallet Esterno per tokenId=${tokenId}, price=${listingPriceBigInt.toString()} Wei`);
            const signer = await walletStore.ensureSigner();
            if (!signer) throw new Error("Wallet esterno non connesso o signer non valido.");
            const signerAddress = await signer.getAddress();
            console.log(">>> MyTicketsView: Signer ottenuto:", signerAddress);

            let currentProvider = signer.provider;
            if (!currentProvider && window.ethereum) {
                currentProvider = new ethers.BrowserProvider(window.ethereum);
                console.log(">>> MyTicketsView: Creato provider di fallback per getFeeData.");
            }
            if (!currentProvider) {
                throw new Error("Impossibile ottenere il provider per leggere i dati sulle fee.");
            }

            console.log(">>> MyTicketsView: Ottengo dati fee attuali...");
            const feeData = await currentProvider.getFeeData();
            console.log(">>> MyTicketsView: Dati Fee:", feeData);

            const legacyGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : ethers.parseUnits('20', 'gwei');
            console.log(`>>> MyTicketsView: Uso gasPrice legacy: ${legacyGasPrice.toString()} Wei`);

            const nftInterface = new ethers.Interface(TICKET_NFT_ABI);
            const marketInterface = new ethers.Interface(MARKETPLACE_ABI);
            console.log('>>> MyTicketsView: Interfacce contratti ethers create.');

            console.log(`>>> MyTicketsView: Preparo dati per Approve Tx (Spender: ${MARKETPLACE_ADDRESS}, TokenId: ${tokenId})...`);
            const approveData = nftInterface.encodeFunctionData("approve", [MARKETPLACE_ADDRESS, tokenId]);
            const approveTxObject = { to: TICKET_NFT_ADDRESS, data: approveData, gasLimit: 150000, gasPrice: legacyGasPrice };
            console.log(`>>> MyTicketsView: Invio Approve Tx via signer.sendTransaction...`, approveTxObject);
            const approveTxResponse = await signer.sendTransaction(approveTxObject);
            listSuccessMessage.value = `Approvazione inviata (Tx: ${approveTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: Approve Tx inviata, attendo ricevuta...", approveTxResponse.hash);
            const approveReceipt = await approveTxResponse.wait(1);
            if (approveReceipt.status !== 1) {
                throw new Error(`Approvazione fallita on-chain. Status: ${approveReceipt.status}, Tx: ${approveTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: Approve Tx confermata:", approveReceipt.hash);
            console.log(">>> MyTicketsView: Aggiungo piccolo delay (2s) prima di listItem...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(">>> MyTicketsView: Delay terminato, procedo con listItem.");
            listSuccessMessage.value = `Approvazione confermata! Invio listing...`;

            console.log(`>>> MyTicketsView: Preparo dati per listItem Tx (TokenId: ${tokenId}, Price: ${listingPriceBigInt})...`);
            const listItemData = marketInterface.encodeFunctionData("listItem", [tokenId, listingPriceBigInt]);
            const listItemTxObject = { to: MARKETPLACE_ADDRESS, data: listItemData, gasLimit: 250000, gasPrice: legacyGasPrice };
            console.log(`>>> MyTicketsView: Invio listItem Tx via signer.sendTransaction...`, listItemTxObject);
            const listItemTxResponse = await signer.sendTransaction(listItemTxObject);
            listSuccessMessage.value = `Listing inviato (Tx: ${listItemTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: listItem Tx inviata, attendo ricevuta...", listItemTxResponse.hash);
            const listReceipt = await listItemTxResponse.wait(1);
            if (listReceipt.status !== 1) {
                throw new Error(`Listing fallito on-chain. Status: ${listReceipt.status}, Tx: ${listItemTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: listItem Tx confermata:", listReceipt.hash);

            console.log(">>> MyTicketsView: Notifico il backend del listing esterno...");
            try {
                const notificationData = {
                    tokenId: tokenId.toString(),
                    nftContractAddress: TICKET_NFT_ADDRESS,
                    listingPrice: listingPriceBigInt.toString(),
                    sellerAddress: signerAddress,
                    transactionHash: listReceipt.hash
                };
                 // Passa config con header JWT se disponibile
                await axios.post('http://localhost:3000/api/marketplace/notify-external-listing', notificationData, authStore.token ? authStore.authHeader.value : {});
                console.log(">>> MyTicketsView: Notifica backend inviata con successo.");
            } catch (backendError) {
                console.error(">>> MyTicketsView: Errore durante la notifica al backend:", backendError);
                 alert(`ATTENZIONE: Listing avvenuto sulla blockchain (Tx: ${listReceipt.hash}) ma errore notifica server.`);
            }

            listSuccessMessage.value = `Biglietto ${tokenId} messo in vendita (Ext)! Hash: ${listReceipt.hash}`;
            // Assumi che fetchListings esista e sia nello store corretto
            // await authStore.fetchListings(); // Rimuovi o sposta se non esiste/necessario
            await authStore.fetchMyTickets(); // Ricarica i miei biglietti

        } catch (error) {
            console.error(">>> MyTicketsView: Errore vendita (sendTransaction) con wallet esterno:", error);
            const reason = error?.reason || error?.data?.message || (error.code === 4001 ? 'Transazione rifiutata dall\'utente.' : error?.message) || "Errore sconosciuto.";
            listError.value = `Errore (Esterno): ${reason}`;
        } finally {
            listLoading.value = false;
        }

    } else {
        // --- Logica Wallet Interno (originale fornita) ---
        try {
            console.log(`>>> MyTicketsView: Chiamo authStore.listTicketForSale con tokenId=${tokenId}, price=${listingPriceBigInt.toString()} Wei`);
            const result = await authStore.listTicketForSale(tokenId, listingPriceBigInt.toString());
            listSuccessMessage.value = `Biglietto ${tokenId} messo in vendita! Hash: ${result?.listItemTxHash ?? 'N/D'}`;
            // Lo store dovrebbe ricaricare i dati internamente (fetchMyTickets?)
        } catch (error) {
            console.error("Errore catturato in MyTicketsView (list interno):", error);
            listError.value = error?.message || 'Errore imprevisto messa in vendita.';
        } finally {
            listLoading.value = false;
        }
    }
};


// --- Funzione handleCancelListing (Versione originale fornita) ---
const handleCancelListing = async (tokenId) => {
     if (cancelLoadingId.value !== null) return;
    console.log(`>>> MyTicketsView: handleCancelListing INIZIO per tokenId=${tokenId}`);
    cancelLoadingId.value = tokenId;
    cancelError.value = null; cancelSuccessMessage.value = '';
    listError.value = null; listSuccessMessage.value = '';

    if (walletStore.isUsingExternalWallet) {
        // --- Logica Wallet Esterno (originale fornita) ---
        try {
            console.log(`>>> MyTicketsView: Tentativo Cancel (Legacy Gas) con Wallet Esterno per tokenId=${tokenId}`);
            const signer = await walletStore.ensureSigner();
            if (!signer) throw new Error("Wallet esterno non connesso o signer non valido.");
            const signerAddress = await signer.getAddress();
            console.log(">>> MyTicketsView: Signer ottenuto per Cancel:", signerAddress);

            let currentProvider = signer.provider;
            if (!currentProvider && window.ethereum) {
                 currentProvider = new ethers.BrowserProvider(window.ethereum);
            }
            if (!currentProvider) throw new Error("Impossibile ottenere provider per fee data.");
            const feeData = await currentProvider.getFeeData();
            const legacyGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : ethers.parseUnits('20', 'gwei');
            console.log(`>>> MyTicketsView: Uso gasPrice legacy per Cancel: ${legacyGasPrice.toString()} Wei`);

            const marketInterface = new ethers.Interface(MARKETPLACE_ABI);
            console.log(`>>> MyTicketsView: Preparo dati per cancelListing Tx (TokenId: ${tokenId})...`);
            const cancelData = marketInterface.encodeFunctionData("cancelListing", [tokenId]);
            const cancelTxObject = { to: MARKETPLACE_ADDRESS, data: cancelData, gasLimit: 100000, gasPrice: legacyGasPrice };

            console.log(`>>> MyTicketsView: Invio cancelListing Tx via signer.sendTransaction...`, cancelTxObject);
            const cancelTxResponse = await signer.sendTransaction(cancelTxObject);
            cancelSuccessMessage.value = `Annullamento inviato (Tx: ${cancelTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: cancelListing Tx inviata, attendo ricevuta...", cancelTxResponse.hash);
            const cancelReceipt = await cancelTxResponse.wait(1);

            if (cancelReceipt.status !== 1) {
                throw new Error(`Annullamento fallito on-chain. Status: ${cancelReceipt.status}, Tx: ${cancelTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: cancelListing Tx confermata:", cancelReceipt.hash);

            // TODO: Aggiungere chiamata API backend per notificare cancellazione esterna!
            console.warn(">>> MyTicketsView: TODO - Implementare chiamata API per notificare backend della cancellazione esterna");
            // try {
            //      await axios.post('http://localhost:3000/api/marketplace/notify-external-cancel', { tokenId: tokenId.toString(), transactionHash: cancelReceipt.hash }, authStore.token ? authStore.authHeader.value : {});
            //      console.log(">>> MyTicketsView: Notifica backend cancellazione inviata.");
            // } catch (backendError) {
            //      console.error(">>> MyTicketsView: Errore notifica backend cancellazione:", backendError);
            //      alert(`ATTENZIONE: Annullamento avvenuto sulla blockchain (Tx: ${cancelReceipt.hash}) ma errore notifica server.`);
            // }

            cancelSuccessMessage.value = `Offerta per ${tokenId} annullata (Ext)! Hash: ${cancelReceipt.hash}`;
            // Assumi che fetchListings esista e sia nello store corretto
            // await authStore.fetchListings(); // Rimuovi o sposta se non esiste/necessario
            await authStore.fetchMyTickets(); // Ricarica i miei biglietti

        } catch (error) {
            console.error(">>> MyTicketsView: Errore annullamento con wallet esterno:", error);
            const reason = error?.reason || error?.data?.message || (error.code === 4001 ? 'Transazione rifiutata dall\'utente.' : error?.message) || "Errore sconosciuto.";
            cancelError.value = `Errore Annullamento (Esterno): ${reason}`;
        } finally {
            cancelLoadingId.value = null;
        }

    } else {
        // --- Logica Wallet Interno (originale fornita) ---
        try {
            console.log(`>>> MyTicketsView: Chiamo authStore.cancelListing(tokenId=${tokenId}) (interno)...`);
            const result = await authStore.cancelListing(tokenId); // Passa tokenId come atteso (numero/stringa?)
            console.log(`>>> MyTicketsView: Risultato ricevuto da cancelListing (interno):`, result);
            cancelSuccessMessage.value = `Offerta annullata! Hash transazione: ${result?.cancelTxHash ?? 'N/D'}`;
        } catch (error) {
            console.error(">>> MyTicketsView: ERRORE nel catch di handleCancelListing (interno):", error);
            cancelError.value = error?.message || authStore.error || 'Errore imprevisto annullamento.';
        } finally {
            cancelLoadingId.value = null;
        }
    }
};

// --- Funzioni Formattazione (con gestione errore base) ---
const formatPrice = (priceString) => {
     if (priceString === null || typeof priceString === 'undefined') return "N/D";
     try {
         // Tenta di formattare come Wei (18 decimali). Modifica '18' se usi decimali diversi.
         return ethers.formatUnits(priceString.toString(), 18);
     } catch (e) {
          console.error("Errore formattazione prezzo:", priceString, e);
         return "Errore Prezzo";
     }
 };

const formatDate = (dateString) => {
    if (!dateString) return "N/D";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
             console.error("Data non valida ricevuta:", dateString);
            return "Data Invalida";
        }
        return date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
        console.error("Errore formattazione data:", dateString, e);
        return "Errore Data";
    }
};

// --- onMounted Hook MODIFICATO ---
// Rimuoviamo la chiamata diretta a fetchMyTickets da qui
onMounted(() => {
    console.log(">>> MyTicketsView: onMounted hook executing.");
    // Manteniamo il fetch dell'utente se serve e se l'utente è loggato (token esiste)
    if (!authStore.user && authStore.token) { // Controlla token direttamente
        console.log(">>> MyTicketsView: onMounted - Fetching user data because user is null but token exists...");
        authStore.fetchUser();
    } else {
        console.log(">>> MyTicketsView: onMounted - User data likely already present or not logged in.");
    }
    // NON chiamare authStore.fetchMyTickets() qui!
});

// --- SOSTITUISCI IL VECCHIO watchEffect CON QUESTO ---
watchEffect(async () => {
    console.log(">>> MyTicketsView: watchEffect for fetching tickets triggered.");

    const useExternal = walletStore.isUsingExternalWallet;
    const externalAccount = walletStore.connectedAddress; // Legge lo stato corretto
    const jwtTokenExists = !!authStore.token;

    console.log(`>>> MyTicketsView: watchEffect - State: useExternal=${useExternal}, externalAccount=${externalAccount}, jwtTokenExists=${jwtTokenExists}`);

    let shouldFetch = false;
    let addressToPass = null; // Variabile per l'indirizzo da passare

    if (useExternal) {
        if (externalAccount) {
            console.log(">>> MyTicketsView: watchEffect - Condition MET: External wallet selected and account is available.");
            shouldFetch = true;
            addressToPass = externalAccount; // Salva l'indirizzo da passare
        } else {
            console.log(">>> MyTicketsView: watchEffect - Condition NOT MET: External wallet selected but account is NOT available.");
            if (authStore.myTickets.length > 0) {
                console.log(">>> MyTicketsView: watchEffect - Clearing ticket list because external account is missing.");
                authStore.myTickets = [];
            }
        }
    } else {
        if (jwtTokenExists) {
            console.log(">>> MyTicketsView: watchEffect - Condition MET: Internal wallet selected and JWT token exists.");
            shouldFetch = true;
            // Non serve passare indirizzo per interno, l'azione lo gestisce
        } else {
            console.log(">>> MyTicketsView: watchEffect - Condition NOT MET: Internal wallet selected but no JWT token.");
             if (authStore.myTickets.length > 0) {
                 console.log(">>> MyTicketsView: watchEffect - Clearing ticket list because user logged out / token missing.");
                 authStore.myTickets = [];
             }
        }
    }

    if (shouldFetch) {
        // Passa l'indirizzo solo se stiamo usando il contesto esterno
        console.log(`>>> MyTicketsView: watchEffect - Conditions met, calling authStore.fetchMyTickets(${addressToPass ? addressToPass : ''})...`);
        authStore.myTicketsError = null;
        // !!! MODIFICA CHIAMATA: Passa addressToPass !!!
        await authStore.fetchMyTickets(addressToPass); // <--- PASSAGGIO PARAMETRO
        console.log(">>> MyTicketsView: watchEffect - authStore.fetchMyTickets() call finished.");
    } else {
        console.log(">>> MyTicketsView: watchEffect - Conditions not met for fetching tickets. Skipping API call.");
    }
});
// --- FINE BLOCCO watchEffect DA SOSTITUIRE ---

</script>

<template>
  <div>
    <h2>I Miei Biglietti</h2>

    <div v-if="authStore.user" style="margin-bottom: 1rem;">
      <span>Benvenuto {{ authStore.user.username }} ({{ currentUserWalletAddress }})!</span>
      <button @click="authStore.logout()" style="margin-left: 15px;">Logout</button>
    </div>
    <p v-else-if="!authStore.isAuthenticated && authStore.loading">Caricamento...</p>
    <p v-else-if="!authStore.isAuthenticated">Per favore, effettua il login per vedere i tuoi biglietti.</p>
    <hr>

    <h3>Elenco Biglietti Posseduti:</h3>

    <p v-if="authStore.myTicketsLoading">Caricamento biglietti...</p>

    <p v-else-if="walletStore.isUsingExternalWallet && !walletStore.connectedAddress" style="color: blue; margin-top: 1rem;">
        Per vedere i biglietti associati al tuo wallet esterno, per favore collegalo.
    </p>

    <p v-else-if="authStore.myTicketsError" style="color: orange; margin-top: 1rem;">
      Attenzione: {{ authStore.myTicketsError }}
    </p>

    <div v-else>
        <p v-if="listError" style="color: red;">Errore Listatura: {{ listError }}</p>
        <p v-if="listSuccessMessage" style="color: green;">{{ listSuccessMessage }}</p>
        <p v-if="cancelError" style="color: red;">Errore Annullamento: {{ cancelError }}</p>
        <p v-if="cancelSuccessMessage" style="color: green;">{{ cancelSuccessMessage }}</p>

        <ul v-if="authStore.myTickets.length > 0" style="margin-top: 1rem;">
            <li v-for="ticket in authStore.myTickets" :key="ticket.tokenId" class="ticket-card">
              <span>
                ID: {{ ticket.tokenId ?? 'N/D' }} |
                Ev: {{ ticket.eventId ?? 'N/D' }} |
                PO: {{ formatPrice(ticket.originalPrice) }} MATIC | Em: {{ formatDate(ticket.issuanceDate) }} |
                List: <strong :style="{ color: ticket.isListed ? 'lightgreen' : 'inherit' }">{{ typeof ticket.isListed === 'boolean' ? (ticket.isListed ? 'Sì' : 'No') : 'N/D' }}</strong>
              </span>
              <span>
                <button
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
        <p v-else style="margin-top: 1rem;">Non possiedi ancora nessun biglietto.</p>
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