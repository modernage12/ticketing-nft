<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ethers } from 'ethers';
import TicketNFTJson from '@/contracts/abi/TicketNFT.json';
import MarketplaceJson from '@/contracts/abi/Marketplace.json';
import { TICKET_NFT_ADDRESS, MARKETPLACE_ADDRESS } from '@/contracts/config.js';
import { useWalletStore } from '@/stores/wallet';
import axios from 'axios'; 

const authStore = useAuthStore();

// Stati locali per feedback azioni List e Cancel
const listLoading = ref(false);
const listError = ref(null);
const listSuccessMessage = ref('');
const cancelLoadingId = ref(null); // Memorizza l'ID del token in annullamento
const cancelError = ref(null);
const cancelSuccessMessage = ref('');
const walletStore = useWalletStore(); // << Aggiungi questa (istanza dello store)
const TICKET_NFT_ABI = TicketNFTJson.abi; // << Estrai ABI
const MARKETPLACE_ABI = MarketplaceJson.abi; // << Estrai ABI


// Funzione per mettere in vendita (NUOVA VERSIONE con signer.sendTransaction)
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
        // Controllo Price Cap (se prezzo originale > 0)
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

    // --- CONTROLLO WALLET INTERNO/ESTERNO ---
    if (walletStore.isUsingExternalWallet) {
        // --- NUOVA LOGICA PER WALLET ESTERNO (sendTransaction) ---
        
        // --- IMPOSTIAMO I PARAMETRI GAS EIP-1559 ---
        // Valori per Amoy (possono variare, ma proviamo con questi)
        // Mancia: Almeno 2.5 Gwei richiesti, usiamo 3 Gwei per sicurezza (3 * 10^9 Wei)
        const maxPriorityFeePerGas = ethers.parseUnits('3', 'gwei');
        // Fee Massima Totale: Deve essere >= BaseFee + Mancia.
        // La BaseFee su Amoy fluttua, ma impostiamo un valore alto per sicurezza (es. 100 Gwei)
        // per assicurarci di coprirla. L'utente pagherà solo BaseFee + Mancia effettiva.
        const maxFeePerGas = ethers.parseUnits('100', 'gwei');
        // --------------------------------------------

        try {
            console.log(`>>> MyTicketsView: Tentativo list (sendTransaction) con Wallet Esterno per tokenId=${tokenId}, price=${listingPriceBigInt.toString()} Wei`);
            const signer = await walletStore.ensureSigner(); // Usa DEBUG v3 da wallet.js
            if (!signer) throw new Error("Wallet esterno non connesso o signer non valido.");
            const signerAddress = await signer.getAddress();
            console.log(">>> MyTicketsView: Signer ottenuto:", signerAddress);

            // --- NUOVO: OTTIENI DATI FEE DAL PROVIDER ---
            // Abbiamo bisogno del provider per ottenere i dati sulle fee
            // Assumiamo che ensureSigner possa restituire anche il provider o che possiamo ottenerlo
            let currentProvider = signer.provider; // Il signer dovrebbe avere un riferimento al provider
            if (!currentProvider && window.ethereum) {
                // Fallback se il signer non ha il provider direttamente
                currentProvider = new ethers.BrowserProvider(window.ethereum);
                console.log(">>> MyTicketsView: Creato provider di fallback per getFeeData.");
            }
            if (!currentProvider) {
                throw new Error("Impossibile ottenere il provider per leggere i dati sulle fee.");
            }

            console.log(">>> MyTicketsView: Ottengo dati fee attuali...");
            const feeData = await currentProvider.getFeeData();
            console.log(">>> MyTicketsView: Dati Fee:", feeData);

            // Usiamo il gasPrice legacy suggerito dal provider
            // Aggiungiamo un piccolo extra per sicurezza se feeData.gasPrice è basso
            const legacyGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : ethers.parseUnits('20', 'gwei'); // Moltiplica per 1.2 (120%) o usa un fallback
            console.log(`>>> MyTicketsView: Uso gasPrice legacy: ${legacyGasPrice.toString()} Wei`);
            // -------------------------------------------

            // 1. Usa le Interfacce ethers per codificare i dati delle funzioni
            const nftInterface = new ethers.Interface(TICKET_NFT_ABI);
            const marketInterface = new ethers.Interface(MARKETPLACE_ABI);
            console.log('>>> MyTicketsView: Interfacce contratti ethers create.');

            // 2. Prepara e invia la transazione 'approve'
            console.log(`>>> MyTicketsView: Preparo dati per Approve Tx (Spender: ${MARKETPLACE_ADDRESS}, TokenId: ${tokenId})...`);
            const approveData = nftInterface.encodeFunctionData("approve", [MARKETPLACE_ADDRESS, tokenId]);
            const approveTxObject = {
                to: TICKET_NFT_ADDRESS, // Indirizzo del contratto NFT
                data: approveData,
                gasLimit: 150000,
                gasPrice: legacyGasPrice
            };
            console.log(`>>> MyTicketsView: Invio Approve Tx via signer.sendTransaction...`, approveTxObject);
            const approveTxResponse = await signer.sendTransaction(approveTxObject); // Chiamata diretta al signer
            listSuccessMessage.value = `Approvazione inviata (Tx: ${approveTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: Approve Tx inviata, attendo ricevuta...", approveTxResponse.hash);
            const approveReceipt = await approveTxResponse.wait(1); // Attendi 1 conferma
            if (approveReceipt.status !== 1) { // Controlla lo stato della ricevuta!
                 throw new Error(`Approvazione fallita on-chain. Status: ${approveReceipt.status}, Tx: ${approveTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: Approve Tx confermata:", approveReceipt.hash);
            console.log(">>> MyTicketsView: Aggiungo piccolo delay (2s) prima di listItem...");
            await new Promise(resolve => setTimeout(resolve, 2000)); // Attende 2000 ms = 2 secondi
            console.log(">>> MyTicketsView: Delay terminato, procedo con listItem.");
            listSuccessMessage.value = `Approvazione confermata! Invio listing...`;

            // 3. Prepara e invia la transazione 'listItem'
            console.log(`>>> MyTicketsView: Preparo dati per listItem Tx (TokenId: ${tokenId}, Price: ${listingPriceBigInt})...`);
            const listItemData = marketInterface.encodeFunctionData("listItem", [tokenId, listingPriceBigInt]);
            const listItemTxObject = {
                to: MARKETPLACE_ADDRESS, // Indirizzo del contratto Marketplace
                data: listItemData,
                gasLimit: 250000, // Potrebbe servire un po' più gas per listItem
                gasPrice: legacyGasPrice // <== SOLO gasPrice qui!
            };
            
            console.log(`>>> MyTicketsView: Invio listItem Tx via signer.sendTransaction...`, listItemTxObject);
            const listItemTxResponse = await signer.sendTransaction(listItemTxObject); // Chiamata diretta al signer
            listSuccessMessage.value = `Listing inviato (Tx: ${listItemTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: listItem Tx inviata, attendo ricevuta...", listItemTxResponse.hash);
            const listReceipt = await listItemTxResponse.wait(1); // Attendi 1 conferma
             if (listReceipt.status !== 1) { // Controlla lo stato della ricevuta!
                 throw new Error(`Listing fallito on-chain. Status: ${listReceipt.status}, Tx: ${listItemTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: listItem Tx confermata:", listReceipt.hash);

            console.log(">>> MyTicketsView: Notifico il backend del listing esterno...");
            try {
                // Prepara i dati per il backend
                const notificationData = {
                    // Assicurati che i tipi siano corretti per il backend (es. stringhe)
                    tokenId: tokenId.toString(),
                    nftContractAddress: TICKET_NFT_ADDRESS, // Usa l'indirizzo importato dal config
                    listingPrice: listingPriceBigInt.toString(), // Prezzo in Wei come stringa
                    sellerAddress: signerAddress, // L'indirizzo del wallet esterno che ha firmato
                    transactionHash: listReceipt.hash // Hash della transazione listItem confermata
                };

            // --- IMPORTANTE: Chiamata API ---
            // Usa la tua istanza Axios configurata nello store auth per inviare il token JWT.
            // Se non hai axiosInstance in authStore, importa e usa la tua istanza axios globale/configurata.
            // Assicurati che la chiamata sia await per aspettare la risposta del backend.
            await axios.post('http://localhost:3000/api/marketplace/notify-external-listing', notificationData);
            console.log(">>> MyTicketsView: Notifica backend inviata con successo.");
            // ----------------------------------

            } catch (backendError) {
                console.error(">>> MyTicketsView: Errore durante la notifica al backend:", backendError);
                // Qui potresti voler mostrare un errore specifico all'utente,
                // informandolo che il listing è avvenuto on-chain ma potrebbero esserci ritardi nella visualizzazione.
                // Per ora, logghiamo solo l'errore per non sovrascrivere il messaggio di successo on-chain.
                // Potresti anche impostare un flag per mostrare un avviso diverso da listError.value.
                // Esempio: listError.value = `Listing OK on-chain, ma errore notifica backend: ${backendError.response?.data?.message || backendError.message}`;
                // Ma questo sovrascriverebbe il messaggio di successo sotto. Decidi tu come gestirlo.
                alert(`ATTENZIONE: Listing avvenuto sulla blockchain (Tx: ${listReceipt.hash}) ma si è verificato un errore durante la notifica al server. Il listing potrebbe non apparire immediatamente.`); // Esempio di alert
            }

            // 4. Successo! Aggiorna UI / Mostra successo
            listSuccessMessage.value = `Biglietto ${tokenId} messo in vendita (Ext)! Hash: ${listReceipt.hash}`;
            // Forza refresh dati dagli store
            await authStore.fetchListings();
            await authStore.fetchMyTickets();

        } catch (error) {
            console.error(">>> MyTicketsView: Errore vendita (sendTransaction) con wallet esterno:", error);
            // Estrai messaggio di errore più utile possibile
            const reason = error?.reason || error?.data?.message || (error.code === 4001 ? 'Transazione rifiutata dall\'utente.' : error?.message) || "Errore sconosciuto durante l'interazione con il wallet.";
            listError.value = `Errore (Esterno): ${reason}`;
        } finally {
            listLoading.value = false;
        }

    } else {
        // --- LOGICA ESISTENTE PER WALLET INTERNO (VIA BACKEND) ---
        try {
             console.log(`>>> MyTicketsView: Chiamo authStore.listTicketForSale con tokenId=${tokenId}, price=${listingPriceBigInt.toString()} Wei`);
             // Assicurati che authStore.listTicketForSale si aspetti il prezzo come stringa (in Wei)
             const result = await authStore.listTicketForSale(tokenId, listingPriceBigInt.toString());
             listSuccessMessage.value = `Biglietto ${tokenId} messo in vendita! Hash: ${result?.listItemTxHash ?? 'N/D'}`;
             // Lo store ricarica i dati internamente
         } catch (error) {
             console.error("Errore catturato in MyTicketsView (list interno):", error);
             listError.value = error?.message || 'Errore imprevisto messa in vendita.';
         } finally {
             listLoading.value = false;
         }
    }
};

// Funzione per annullare l'offerta (VERSIONE AGGIORNATA CON WALLET ESTERNO E gasPrice)
const handleCancelListing = async (tokenId) => {
    if (cancelLoadingId.value !== null) return; // Evita click multipli
    console.log(`>>> MyTicketsView: handleCancelListing INIZIO per tokenId=${tokenId}`);
    cancelLoadingId.value = tokenId; // Blocca solo questo bottone
    cancelError.value = null; cancelSuccessMessage.value = '';
    listError.value = null; listSuccessMessage.value = ''; // Resetta altri errori

    // --- CONTROLLO WALLET INTERNO/ESTERNO ---
    if (walletStore.isUsingExternalWallet) {
        // --- LOGICA PER WALLET ESTERNO (METAMASK/BRAVE) ---
        try {
            console.log(`>>> MyTicketsView: Tentativo Cancel (Legacy Gas) con Wallet Esterno per tokenId=${tokenId}`);
            const signer = await walletStore.ensureSigner();
            if (!signer) throw new Error("Wallet esterno non connesso o signer non valido.");
            const signerAddress = await signer.getAddress();
            console.log(">>> MyTicketsView: Signer ottenuto per Cancel:", signerAddress);

            // Ottieni dati fee attuali
            let currentProvider = signer.provider;
            if (!currentProvider && window.ethereum) {
                 currentProvider = new ethers.BrowserProvider(window.ethereum);
            }
            if (!currentProvider) throw new Error("Impossibile ottenere provider per fee data.");
            const feeData = await currentProvider.getFeeData();
            const legacyGasPrice = feeData.gasPrice ? (feeData.gasPrice * 120n / 100n) : ethers.parseUnits('20', 'gwei'); // Usa fallback
            console.log(`>>> MyTicketsView: Uso gasPrice legacy per Cancel: ${legacyGasPrice.toString()} Wei`);

            // Prepara i dati della transazione 'cancelListing'
            const marketInterface = new ethers.Interface(MARKETPLACE_ABI);
            console.log(`>>> MyTicketsView: Preparo dati per cancelListing Tx (TokenId: ${tokenId})...`);
            const cancelData = marketInterface.encodeFunctionData("cancelListing", [tokenId]);
            const cancelTxObject = {
                to: MARKETPLACE_ADDRESS, // Chiama il contratto Marketplace
                data: cancelData,
                gasLimit: 100000, // Gas limit ragionevole per un cancel
                gasPrice: legacyGasPrice // Usa gasPrice legacy
            };

            // Invia la transazione
            console.log(`>>> MyTicketsView: Invio cancelListing Tx via signer.sendTransaction...`, cancelTxObject);
            const cancelTxResponse = await signer.sendTransaction(cancelTxObject);
            cancelSuccessMessage.value = `Annullamento inviato (Tx: ${cancelTxResponse.hash}). Attendi conferma...`;
            console.log(">>> MyTicketsView: cancelListing Tx inviata, attendo ricevuta...", cancelTxResponse.hash);
            const cancelReceipt = await cancelTxResponse.wait(1); // Attendi conferma

            if (cancelReceipt.status !== 1) { // Controlla stato ricevuta
                throw new Error(`Annullamento fallito on-chain. Status: ${cancelReceipt.status}, Tx: ${cancelTxResponse.hash}`);
            }
            console.log(">>> MyTicketsView: cancelListing Tx confermata:", cancelReceipt.hash);

            // Successo! Aggiorna UI / Mostra successo
            cancelSuccessMessage.value = `Offerta per ${tokenId} annullata (Ext)! Hash: ${cancelReceipt.hash}`;
            // Forza refresh dati dagli store
            await authStore.fetchListings();
            await authStore.fetchMyTickets();

        } catch (error) {
            console.error(">>> MyTicketsView: Errore annullamento con wallet esterno:", error);
            const reason = error?.reason || error?.data?.message || (error.code === 4001 ? 'Transazione rifiutata dall\'utente.' : error?.message) || "Errore sconosciuto.";
            cancelError.value = `Errore Annullamento (Esterno): ${reason}`;
        } finally {
            cancelLoadingId.value = null; // Sblocca il bottone specifico
        }

    } else {
        // --- LOGICA ESISTENTE PER WALLET INTERNO (VIA BACKEND) ---
        try {
            console.log(`>>> MyTicketsView: Chiamo authStore.cancelListing(tokenId=${tokenId}) (interno)...`);
            const result = await authStore.cancelListing(tokenId); // Assumi che prenda tokenId come stringa o numero
            console.log(`>>> MyTicketsView: Risultato ricevuto da cancelListing (interno):`, result);
            cancelSuccessMessage.value = `Offerta annullata! Hash transazione: ${result?.cancelTxHash ?? 'N/D'}`;
            // Lo store dovrebbe ricaricare i dati internamente
        } catch (error) {
            console.error(">>> MyTicketsView: ERRORE nel catch di handleCancelListing (interno):", error);
            cancelError.value = error?.message || authStore.error || 'Errore imprevisto annullamento.';
        } finally {
            cancelLoadingId.value = null;
        }
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
            <button @click="handleListTicket('3', '10000000000000000')" style="background-color: yellow; margin-top: 20px;">
                TEST VENDI TOKEN 3 (Esterno)
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