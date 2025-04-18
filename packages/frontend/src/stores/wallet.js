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

  async function ensureSigner() {
    console.log('EnsureSigner: Controllo richiesto...');

    // Verifica se dovremmo usare il wallet esterno e se siamo connessi
    if (!isUsingExternalWallet.value) {
      console.warn('EnsureSigner: Non si sta usando il wallet esterno.');
      // throw new Error('Non si sta usando il wallet esterno.'); // Alternativa: lanciare errore
      return null; // O restituisci null se non è richiesto un signer esterno
    }
    if (!isConnected.value || !connectedAddress.value) {
      console.warn('EnsureSigner: Wallet esterno non connesso.');
      // throw new Error('Wallet esterno non connesso.');
      return null;
    }

    // Verifica se abbiamo un provider, prova a ricrearlo se manca
    let currentProvider = provider.value;
    if (!currentProvider) {
      console.log('EnsureSigner: Provider non trovato, tento di ricrearlo...');
      if (window.ethereum) {
        try {
          currentProvider = new ethers.BrowserProvider(window.ethereum);
          provider.value = currentProvider; // Aggiorna nello store
        } catch (err) {
          console.error('EnsureSigner: Errore nel ricreare il provider.', err);
          error.value = 'Errore nel provider del wallet.';
          resetState(); // Resetta se il provider fallisce
          return null;
        }
      } else {
        console.error('EnsureSigner: window.ethereum non disponibile.');
        error.value = 'Provider wallet non trovato.';
        resetState();
        return null;
      }
    }

    // Ora prova a ottenere il signer corrente e confronta l'indirizzo
    try {
      const currentSigner = await currentProvider.getSigner();
      const currentSignerAddress = await currentSigner.getAddress();

      console.log('EnsureSigner: Indirizzo connesso:', connectedAddress.value);
      console.log('EnsureSigner: Indirizzo signer attuale:', currentSignerAddress);

      // Se il signer nello store è nullo o l'indirizzo non corrisponde, aggiorna lo signer nello store
      if (!signer.value || currentSignerAddress.toLowerCase() !== connectedAddress.value.toLowerCase()) {
        console.log('EnsureSigner: Aggiornamento signer necessario.');
        signer.value = currentSigner;
      } else {
        console.log('EnsureSigner: Signer nello store è già corretto.');
      }

      // Resetta l'errore se tutto è andato bene
      error.value = null;
      // Restituisce il signer valido (che sia quello vecchio o quello appena aggiornato)
      return signer.value;

    } catch (err) {
      console.error('EnsureSigner: Errore nell\'ottenere o verificare il signer:', err);
      error.value = 'Impossibile ottenere il firmatario dal wallet.';
      // Non resettare necessariamente lo stato qui, dipende da come vuoi gestire l'errore
      // resetState();
      // Restituisce null o lancia un errore per segnalare il fallimento
      return null;
      // throw new Error('Impossibile ottenere il firmatario dal wallet.');
    }
  }

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
      console.log('Resetto stato wallet e rimuovo listeners...')
      connectedAddress.value = null
      provider.value = null
      signer.value = null
      error.value = null
      isUsingExternalWallet.value = false // Resettiamo anche questo

      // --- MODIFICA: Rimuoviamo i listener ---
      // Controlliamo che window.ethereum e le funzioni esistano prima di chiamarle
      if (window.ethereum && typeof window.ethereum.removeListener === 'function') {
          console.log('Rimuovo listeners per accountsChanged e chainChanged.')
          // Usare .off() è un alias comune per .removeListener
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
          window.ethereum.removeListener('chainChanged', handleChainChanged)
      } else {
          console.log('window.ethereum o removeListener non disponibili durante il reset.')
      }
      // -----------------------------------
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
    initializePreference
    // setUsingExternalWallet,
  }
})