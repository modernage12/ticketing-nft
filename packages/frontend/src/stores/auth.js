// File: packages/frontend/src/stores/auth.js
// VERSIONE FINALE (si spera!) - 16 Apr 2025 - Completa

import { defineStore } from 'pinia';
import axios from 'axios';
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useWalletStore } from '@/stores/wallet';

export const useAuthStore = defineStore('auth', () => {
    // --- STATO ---
    const token = ref(localStorage.getItem('authToken') || null);
    const user = ref(null);
    const error = ref(null); // Errore generico per azioni principali
    const loading = ref(false); // Loading generico per azioni principali
    const router = useRouter();
    const walletStore = useWalletStore();
    // URLs API Backend
    console.log('DEBUG VERCEL ENV: Controllo variabili d\'ambiente...');
    console.log('DEBUG VERCEL ENV: Contenuto completo di import.meta.env:', import.meta.env);
    console.log('DEBUG VERCEL ENV: Valore letto per VITE_API_BASE_URL:', import.meta.env.VITE_API_BASE_URL);
    const BASE_API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'; // Fallback per locale
    console.log('DEBUG VERCEL ENV: Valore effettivo di BASE_API_URL dopo fallback:', BASE_API_URL);
    console.log('------------------------------------');
    const AUTH_API_URL = `${BASE_API_URL}/api/auth`;
    const TICKETS_API_URL = `${BASE_API_URL}/api/tickets`;
    const EVENTS_API_URL = `${BASE_API_URL}/api/events`;
    const MARKETPLACE_API_URL = `${BASE_API_URL}/api/marketplace`;
    // Dati specifici e loro stati
    const myTickets = ref([]);
    const events = ref([]);
    const listings = ref([]);
    const eventsLoading = ref(false);
    const listingsLoading = ref(false);
    const myTicketsLoading = ref(false);
    const eventsError = ref(null);
    const listingsError = ref(null);
    const myTicketsError = ref(null);

    /**
     * Azione per chiamare l'API backend e salvare la preferenza wallet dell'utente.
     * @param {'internal' | 'external'} preference La nuova preferenza da salvare.
     */
    async function updateWalletPreferenceAPI(preference) {
        console.log(`AuthStore: Chiamo API per aggiornare preferenza a ${preference}`);
        // Verifica validità input (anche se già validato dal backend)
        if (preference !== 'internal' && preference !== 'external') {
          console.error("updateWalletPreferenceAPI: Valore preferenza non valido:", preference);
          throw new Error("Valore preferenza non valido."); // Lancia errore per il .catch nel componente
        }
        if (!token.value) {
          console.error("updateWalletPreferenceAPI: Nessun token, impossibile chiamare API.");
          throw new Error("Utente non autenticato.");
        }
  
        // Costruisci URL e corpo richiesta (qui usiamo le costanti interne allo store)
        const url = `${AUTH_API_URL}/me/preferences`; // AUTH_API_URL è accessibile qui dentro
        const body = { walletPreference: preference };
        const config = authHeader.value; // Prendi l'header di autenticazione
  
        try {
          // Esegui la chiamata PUT
          await axios.put(url, body, config);
          console.log(`AuthStore: Preferenza '${preference}' salvata con successo nel backend.`);
          // Potremmo voler aggiornare lo stato user.value qui se l'API restituisse l'utente aggiornato,
          // ma per ora non è necessario perché lo stato FE è già stato aggiornato prima della chiamata.
          return true; // Indica successo
        } catch (err) {
          console.error(`Errore durante il salvataggio della preferenza '${preference}' nel backend:`, err.response?.data || err.message);
          // Rilancia l'errore per poterlo gestire nel componente che ha chiamato l'azione
          throw new Error(err.response?.data?.error || `Errore nel salvare la preferenza '${preference}'.`);
        }
      }


    // --- GETTERS ---
    const isLoggedIn = computed(() => !!token.value);
    const isAdmin = computed(() => {
        // Controlla se user.value esiste E se la sua proprietà isAdmin è true
        return !!user.value && user.value.isAdmin === true;
    });
    const authHeader = computed(() => {
        return token.value ? { headers: { Authorization: `Bearer ${token.value}` } } : { headers: {} };
    });

    // --- AZIONI ---

    // Carica token da localStorage all'avvio
    function loadToken() {
        const storedToken = localStorage.getItem('authToken');
        if (storedToken) { token.value = storedToken; console.log("AuthStore: Token caricato da localStorage."); }
        else { console.log("AuthStore: Nessun token trovato in localStorage.");}
    }

    // Recupera/Verifica dati utente usando il token
     async function fetchUser() {
        if (!token.value) { console.warn("AuthStore: fetchUser chiamato senza token."); user.value = null; return; }
        console.log("AuthStore: Tentativo fetchUser...");
        loading.value = true; error.value = null;
        try {
            const response = await axios.get(`${AUTH_API_URL}/me`, authHeader.value);
            user.value = response.data;
            console.log("AuthStore: Dati utente recuperati OK:", JSON.stringify(user.value));
            if (user.value && user.value.walletPreference) {
                walletStore.initializePreference(user.value.walletPreference);
            } else {
                 console.warn("AuthStore: walletPreference non trovato nei dati utente ricevuti da /me. Uso default (internal).");
                 walletStore.initializePreference('internal'); // Fallback sicuro
            }
        } catch (err) {
            console.error("AuthStore: Errore fetchUser:", err.response?.data || err.message);
            error.value = err.response?.data?.error || 'Errore recupero dati utente.';
            if (err.response?.status === 401 || err.response?.status === 403) {
                 console.log("AuthStore: Token non valido/scaduto durante fetchUser, eseguo logout...");
                 walletStore.resetState();
                 await logout();
            }
            // Se l'errore non è 401/403, user rimane null o vecchio valore, l'errore è in error.value
        } finally {
            loading.value = false;
        }
     }

    // Registrazione nuovo utente
    async function register(username, password) {
        console.log("AuthStore: register ACTION CALLED");
        loading.value = true; error.value = null;
        try {
            await axios.post(`${AUTH_API_URL}/register`, { username, password });
            console.log("AuthStore: Registrazione OK, redirect a login...");
            await router.push('/login');
        } catch (err) {
            console.error("Errore registrazione:", err.response?.data || err.message);
            error.value = err.response?.data?.error || 'Errore durante la registrazione.';
            throw error; // Rilancia per gestione nel componente
        } finally {
            loading.value = false;
        }
    }

    // Login utente
    async function login(username, password) {
        console.log("AuthStore: login ACTION CALLED");
        loading.value = true; error.value = null;
        try {
            const url = `${AUTH_API_URL}/login`; const body = { username, password };
            console.log(`AuthStore: Chiamo axios.post a ${url}`);
            const response = await axios.post(url, body);
            console.log("AuthStore: Risposta API login OK:", response.data);
            const receivedToken = response.data.token;
            token.value = receivedToken; localStorage.setItem('authToken', receivedToken);
            console.log("AuthStore: Token salvato. Chiamo fetchUser...");
            await fetchUser();
            console.log("AuthStore: fetchUser completato.");
            if (user.value) { // Solo se fetchUser ha successo e popola user
                console.log("AuthStore: Eseguo redirect a /my-tickets...");
                await router.push('/my-tickets');
            } else {
                console.warn("AuthStore: Login OK ma fetchUser fallito, rimango su login.");
                // L'errore dovrebbe essere già in error.value da fetchUser
                throw new Error(error.value || 'Login riuscito ma recupero dati utente fallito.');
            }
        } catch (err) {
            console.error("Errore login action:", err.response?.data || err.message);
            if (!error.value) error.value = err.response?.data?.error || 'Credenziali non valide o errore server.';
            throw err;
        } finally {
            loading.value = false;
        }
    }

    // Logout utente
    async function logout() {
        console.log("AuthStore: Eseguo logout...");
        // Resetta anche lo stato del wallet esterno al logout manuale
        walletStore.disconnectWallet();
        token.value = null; user.value = null; myTickets.value = [];
        listings.value = []; events.value = []; localStorage.removeItem('authToken');
        error.value = null; eventsError.value = null; listingsError.value = null; myTicketsError.value = null;
        eventsLoading.value = false; listingsLoading.value = false; myTicketsLoading.value = false; loading.value = false;
        await router.push('/login');
    }

    // --- Funzioni Fetch Dati (Corrette e Resilienti) ---

     async function fetchMyTickets() {
        console.log(">>> fetchMyTickets ACTION CALLED");
        if (!token.value) { myTickets.value = []; /* console.warn("fetchMyTickets: No token"); */ return; }
        myTicketsLoading.value = true; myTicketsError.value = null;
        try {
            console.log(`>>> fetchMyTickets: Chiamo API a ${TICKETS_API_URL}/my`);
            const response = await axios.get(`${TICKETS_API_URL}/my`, authHeader.value );
            myTickets.value = response.data;
            console.log(">>> fetchMyTickets: Biglietti recuperati:", myTickets.value.length);
        } catch (err) {
            console.error(">>> Errore fetchMyTickets:", err.response?.data || err.message);
            myTicketsError.value = err.response?.data?.error || 'Errore recupero biglietti (mostro dati vecchi).';
            if (err.response?.status === 401 || err.response?.status === 403) { await logout(); }
        } finally {
            console.log(">>> fetchMyTickets: Eseguo finally block");
            myTicketsLoading.value = false;
        }
     }

    async function fetchEvents() {
        console.log(">>> fetchEvents ACTION CALLED");
        eventsLoading.value = true; eventsError.value = null;
        try {
             console.log(`>>> fetchEvents: Chiamo API a ${EVENTS_API_URL}`);
            const response = await axios.get(EVENTS_API_URL);
            events.value = response.data;
            console.log(`>>> fetchEvents: Recuperati ${events.value.length} eventi`);
        } catch (err) {
            console.error(">>> Errore fetchEvents:", err.response?.data || err.message);
            eventsError.value = err.response?.data?.error || 'Errore recupero eventi (mostro dati vecchi).';
        } finally {
             console.log(">>> fetchEvents: Eseguo finally block");
            eventsLoading.value = false;
        }
    }

     async function fetchListings() {
        console.log(">>> fetchListings ACTION CALLED");
        listingsLoading.value = true; listingsError.value = null;
        try {
             console.log(`>>> fetchListings: Chiamo API a ${MARKETPLACE_API_URL}/listings`);
            const response = await axios.get(`${MARKETPLACE_API_URL}/listings`);
            listings.value = response.data;
            console.log(`>>> fetchListings: Recuperate ${listings.value.length} offerte.`);
        } catch (err) {
            console.error(">>> Errore fetchListings:", err.response?.data || err.message);
            listingsError.value = err.response?.data?.error || 'Errore recupero offerte (mostro dati vecchi).';
        } finally {
             console.log(">>> fetchListings: Eseguo finally block");
            listingsLoading.value = false;
        }
    }

    // --- Azioni Marketplace (con gestione errore refresh separata) ---

     async function buyTicket(eventId) { // Acquisto primario
         if (!token.value) throw new Error("Utente non loggato.");
         loading.value = true; error.value = null;
         let mainResponseData = null;
         try {
             const url = `${EVENTS_API_URL}/${eventId}/buy`; const config = authHeader.value;
             console.log(`>>> AuthStore: buyTicket: Chiamo axios.post a ${url}`);
             const response = await axios.post(url, {}, config);
             console.log(">>> AuthStore: buyTicket: Risposta API OK:", response?.data);
             return response?.data?.transaction ?? null; // Restituisce l'oggetto transaction o null
             // Tentativo di refresh DOPO successo principale, ma non blocca/rilancia errore
             try {
                 console.log(">>> AuthStore: buyTicket: Refreshing myTickets...");
                 await fetchMyTickets();
             } catch (refreshError) { console.warn("WARN buyTicket: Errore refresh post-acquisto:", refreshError.message); }
             return mainResponseData; // Restituisce il risultato principale
         } catch (err) { // Cattura solo errori della chiamata axios.post principale
              console.error("Errore buyTicket action:", err.response?.data || err.message);
              const specificError = err.response?.data?.error || 'Errore durante l\'acquisto.';
              error.value = specificError; throw new Error(specificError);
         } finally {
             console.log(">>> AuthStore: Eseguo finally block di buyTicket");
             loading.value = false;
         }
     }

    async function listTicketForSale(tokenId, priceString) {
        if (!token.value) throw new Error("Utente non loggato.");
        loading.value = true; error.value = null;
        let mainResponseData = null;
        try {
            const url = `${TICKETS_API_URL}/${tokenId}/list`; const body = { price: priceString }; const config = authHeader.value;
            console.log(`>>> listTicketForSale: Chiamo axios.post a ${url}`);
            const response = await axios.post(url, body, config);
            console.log(">>> listTicketForSale: Risposta API OK:", response.data);
            return response?.data?.transactions ?? null; // Restituisce { approveTxHash, listItemTxHash } o null
            // Tentativo di refresh DOPO successo principale
            try {
                console.log(">>> listTicketForSale: Refreshing listings & myTickets...");
                await fetchListings(); await fetchMyTickets();
            } catch (refreshError) { console.warn("WARN listTicketForSale: Errore refresh post-listing:", refreshError.message); }
            return mainResponseData; // Restituisce il risultato principale
        } catch (err) { // Cattura solo errori dell'azione axios.post principale
            console.error("Errore listTicketForSale action:", err.response?.data || err.message); const specificError = err.response?.data?.error || 'Errore messa in vendita.'; error.value = specificError; throw new Error(specificError);
        } finally { console.log(">>> listTicketForSale: Eseguo finally block"); loading.value = false; }
    }

    async function buyListedTicket(tokenId) {
        if (!token.value) throw new Error("Utente non loggato.");
        loading.value = true; error.value = null;
        let mainResponseData = null;
        try {
            const url = `${MARKETPLACE_API_URL}/listings/${tokenId}/buy`;
            console.log(`>>> buyListedTicket: Chiamo axios.post a ${url}`);
            const response = await axios.post(url, {}, authHeader.value);
            console.log(">>> buyListedTicket: Risposta API OK:", response.data);
            mainResponseData = response.data;
             // Tentativo di refresh DOPO successo principale
            try {
                console.log(">>> buyListedTicket: Refreshing listings & myTickets...");
                await fetchListings(); await fetchMyTickets();
            } catch (refreshError) { console.warn("WARN buyListedTicket: Errore refresh post-acquisto:", refreshError.message); }
            return mainResponseData;
        } catch (err) { // Cattura solo errori dell'azione axios.post principale
            console.error("Errore buyListedTicket action:", err.response?.data || err.message); const specificError = err.response?.data?.error || 'Errore acquisto marketplace.'; error.value = specificError; throw new Error(specificError);
        } finally { console.log(">>> buyListedTicket: Eseguo finally block"); loading.value = false; }
    }

    async function cancelListing(tokenId) {
        if (!token.value) throw new Error("Utente non loggato.");
        loading.value = true; error.value = null;
        let mainResponseData = null;
        try {
            const url = `${MARKETPLACE_API_URL}/listings/${tokenId}`; const config = authHeader.value;
            console.log(`>>> cancelListing: Chiamo axios.delete a ${url}`);
            const response = await axios.delete(url, config);
            console.log(">>> cancelListing: Risposta API OK:", response.data);
            mainResponseData = response.data;
             // Tentativo di refresh DOPO successo principale
            try {
                console.log(">>> cancelListing: Refreshing listings & myTickets...");
                await fetchMyTickets(); await fetchListings();
            } catch (refreshError) { console.warn("WARN cancelListing: Errore refresh post-annullamento:", refreshError.message); }
            return mainResponseData;
        } catch (err) { // Cattura solo errori dell'azione axios.delete principale
            console.error("Errore cancelListing action:", err.response?.data || err.message); const specificError = err.response?.data?.error || 'Errore annullamento offerta.'; error.value = specificError; throw new Error(specificError);
        } finally { console.log(">>> cancelListing: Eseguo finally block"); loading.value = false; }
    }

    // Esporta tutto (verifica completezza)
    return {
        token, user, error, loading, myTickets, events, listings, eventsLoading,
        listingsLoading, eventsError, listingsError, myTicketsError,
        isLoggedIn, authHeader,
        loadToken, fetchUser, register, login, logout, fetchMyTickets, fetchEvents,
        buyTicket, fetchListings, listTicketForSale, buyListedTicket, cancelListing, 
        updateWalletPreferenceAPI, isAdmin
    };
});