// packages/frontend/src/stores/wallet.js
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { ethers } from 'ethers'

export const useWalletStore = defineStore('wallet', () => {
  // State (invariato)
  const connectedAddress = ref(null)
  const provider = ref(null)
  const signer = ref(null)
  const error = ref(null)
  const isConnecting = ref(false)
  const isUsingExternalWallet = ref(false)

  // Azione per inizializzare lo stato in base alla preferenza caricata
  function initializePreference(preferenceValue) {
    console.log(`WalletStore: Inizializzo preferenza da backend: ${preferenceValue}`);
    if (preferenceValue === 'external') {
      isUsingExternalWallet.value = true;
      // Non tentiamo di connettere automaticamente qui, l'utente lo farà se vuole
    } else {
      isUsingExternalWallet.value = false;
      // Assicuriamoci che lo stato sia pulito se la preferenza è 'internal'
      resetState(); // resetState imposta isUsingExternalWallet a false e rimuove listeners etc.
    }
  }

   // === NUOVA AZIONE ===
  // Azione specifica per quando l'utente SCEGLIE di usare il wallet interno
  function switchToInternalMode() {
    console.log(">>> WalletStore: Azione switchToInternalMode chiamata.");
    // 1. Resetta lo stato della connessione esterna (indirizzo, signer, listeners)
    resetState(); // Chiama la nostra funzione di reset esistente (che NON tocca più isUsingExternalWallet)
    // 2. Imposta esplicitamente che NON stiamo più usando il wallet esterno
    isUsingExternalWallet.value = false;
    console.log(">>> WalletStore: Impostato isUsingExternalWallet a false.");
    // Nota: La preferenza 'internal' viene salvata nel DB dall'azione dell'authStore chiamata da SettingsView
  }

// === NUOVA VERSIONE SEMPLIFICATA DI ensureSigner ===
async function ensureSigner() {
  console.log('EnsureSigner (SEMPLIFICATO): Controllo richiesto...');

  // Controlli iniziali (invariati)
  if (!isUsingExternalWallet.value) {
    console.warn('EnsureSigner (SEMPLIFICATO): Non si sta usando il wallet esterno.');
    error.value = 'Non si sta usando il wallet esterno.'; // Imposta errore nello store
    return null; // Restituisce null
  }
  if (!window.ethereum) {
    console.error('EnsureSigner (SEMPLIFICATO): window.ethereum non disponibile.');
    error.value = 'Provider wallet non trovato (Brave Wallet non attivo?).';
    return null; // Restituisce null
  }

  console.log('EnsureSigner (SEMPLIFICATO): Tento di creare provider e ottenere signer...');
  try {
    // 1. Crea un nuovo provider
    //    NOTA: Non lo salviamo più in 'this.provider' o 'provider.value' qui!
    const freshProvider = new ethers.BrowserProvider(window.ethereum);
    console.log('EnsureSigner (SEMPLIFICATO): Provider creato.');

    // 2. Ottieni il signer da questo provider
    //    NOTA: Non lo salviamo più in 'this.signer' o 'signer.value' qui!
    const currentSigner = await freshProvider.getSigner();
    const currentSignerAddress = await currentSigner.getAddress();
    console.log('EnsureSigner (SEMPLIFICATO): Signer ottenuto per indirizzo:', currentSignerAddress);

    // 3. Verifica l'indirizzo (opzionale ma utile)
    if (!connectedAddress.value || currentSignerAddress.toLowerCase() !== connectedAddress.value.toLowerCase()) {
       console.warn(`EnsureSigner (SEMPLIFICATO): Indirizzo signer (${currentSignerAddress}) diverso da quello nello store (${connectedAddress.value}). Potrebbe essere necessario aggiornare lo stato altrove.`);
       // Potresti voler aggiornare connectedAddress.value qui o gestire questo caso nel componente chiamante
       // connectedAddress.value = currentSignerAddress; // Esempio
    }

    error.value = null; // Resetta errore nello store se tutto ok fin qui
    return currentSigner; // <<== RESTITUISCE IL SIGNER OTTENUTO

  } catch (err) {
    console.error('EnsureSigner (SEMPLIFICATO): Errore DENTRO il try/catch:', err);
    error.value = `Impossibile ottenere il firmatario: ${err.message || 'Errore sconosciuto'}`;
    // Non resettiamo this.signer/provider qui perché non li abbiamo impostati
    return null; // <<== RESTITUISCE NULL IN CASO DI ERRORE
  }
}
// === FINE NUOVA VERSIONE ===

  // =============================================
  // === INIZIO BLOCCO NUOVO: HANDLER EVENTI ===
  // =============================================
  const handleAccountsChanged = (accounts) => {
    console.log('Evento ricevuto: accountsChanged', accounts)
    if (accounts.length === 0) {
      // L'utente ha bloccato MetaMask o disconnesso tutti gli account dal sito
      console.log('Nessun account trovato dall\'evento accountsChanged, resetto lo stato.')
      resetState()
    } else {
      // Aggiorna *SOLO* l'indirizzo connesso nello stato.
      // Non proviamo ad aggiornare il signer qui per evitare l'errore.
      connectedAddress.value = accounts[0]
      console.log('Account cambiato (solo indirizzo aggiornato):', connectedAddress.value)
      // NON tentiamo di aggiornare provider/signer qui. Lo faremo al bisogno.
    }
  }

  const handleChainChanged = (chainId) => {
    console.log('Evento ricevuto: chainChanged', chainId)
    // Come raccomandato da MetaMask, il modo più semplice e robusto
    // per gestire cambi di rete è ricaricare la pagina.
    alert('La rete del wallet è cambiata. È necessario ricaricare la pagina.')
    window.location.reload()
  }
  // =============================================
  // === FINE BLOCCO NUOVO: HANDLER EVENTI ===
  // =============================================

  // Getters (invariati)
  const isConnected = computed(() => !!connectedAddress.value)
  const shortAddress = computed(() => {
    if (connectedAddress.value) {
      const addr = connectedAddress.value
      return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
    }
    return ''
  })

  // Actions
  async function connectWallet() {
    // ... (logica iniziale if !window.ethereum invariata) ...
    if (!window.ethereum) {
      error.value = "MetaMask (o un altro wallet EIP-1193) non è installato."
      alert(error.value)
      return
    }

    isConnecting.value = true
    error.value = null

    try {
      // ... (creazione provider e richiesta account invariata) ...
      const ethProvider = new ethers.BrowserProvider(window.ethereum)
      provider.value = ethProvider
      const accounts = await ethProvider.send('eth_requestAccounts', [])

      if (accounts && accounts.length > 0) {
        connectedAddress.value = accounts[0]
        signer.value = await ethProvider.getSigner()
        console.log('Wallet connesso:', connectedAddress.value)
        isUsingExternalWallet.value = true // Assumiamo che connettendo si usi l'esterno

        // --- MODIFICA: Rimuoviamo eventuali listener precedenti (sicurezza) ---
        if (window.ethereum && typeof window.ethereum.removeListener === 'function') {
             window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
             window.ethereum.removeListener('chainChanged', handleChainChanged)
             console.log('Rimossi eventuali listener precedenti.')
        }

        // --- MODIFICA: Aggiungiamo i nuovi listener ---
        console.log('Aggiungo i listener per accountsChanged e chainChanged.')
        window.ethereum.on('accountsChanged', handleAccountsChanged)
        window.ethereum.on('chainChanged', handleChainChanged)
        // ---------------------------------------------

      } else {
        // ... (gestione errore nessun account invariata) ...
        error.value = "Nessun account trovato o accesso negato."
        resetState() // resetState rimuove anche i listener
      }
    } catch (err) {
      // ... (gestione errore try/catch invariata) ...
      console.error("Errore durante la connessione:", err)
      error.value = `Errore connessione: ${err.message || err.code || 'Errore sconosciuto'}`
      if (err.code === 4001) {
         error.value = "Connessione rifiutata dall'utente."
      }
      resetState() // resetState rimuove anche i listener
      alert(error.value)
    } finally {
      isConnecting.value = false
    }
  }

  function disconnectWallet() {
     console.log('Disconnessione richiesta dall\'utente...')
     // resetState ora rimuove anche i listener
     resetState()
  }

  function resetState() {
    console.log('Resetto stato connessione wallet e rimuovo listeners...')
    connectedAddress.value = null
    provider.value = null
    signer.value = null
    error.value = null
    // !!! NON resettare isUsingExternalWallet qui !!!
    // isUsingExternalWallet.value = false; // <-- RIMUOVI O COMMENTA QUESTA RIGA

    // Rimuoviamo i listener
    if (window.ethereum && typeof window.ethereum.removeListener === 'function') {
        console.log('Rimuovo listeners per accountsChanged e chainChanged.')
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
        window.ethereum.removeListener('chainChanged', handleChainChanged)
    } else {
        console.log('window.ethereum o removeListener non disponibili durante il reset.')
    }
}

  // Funzioni placeholder per il futuro
  // function setUsingExternalWallet(useExternal: boolean) { isUsingExternalWallet.value = useExternal; }

  return {
    connectedAddress,
    provider,
    signer,
    error,
    isConnecting,
    isUsingExternalWallet,
    isConnected,
    shortAddress,
    connectWallet,
    disconnectWallet,
    ensureSigner,
    initializePreference,
    switchToInternalMode
    // setUsingExternalWallet,
  }
})