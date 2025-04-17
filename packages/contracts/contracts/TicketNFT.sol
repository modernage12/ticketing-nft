// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // Va bene anche per OZ v5.x

// Importiamo i contratti standard e sicuri di OpenZeppelin v5.x
// I percorsi per ERC721 e Ownable non sono cambiati rispetto alla v4.
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Per gestire la proprietà del contratto

// !!! NOTA: Abbiamo rimosso l'import di Counters.sol perché non esiste più in OZ v5 !!!

/**
 * @title TicketNFT
 * @dev Implementazione di un biglietto evento come NFT ERC721 (Compatibile OZ v5.x).
 * Include metadati personalizzati come eventId, originalPrice e issuanceDate.
 * Gestisce gli ID dei token manualmente tramite una variabile contatore.
 * Solo il proprietario del contratto (deployer o indirizzo designato) può creare nuovi biglietti (mint).
 */
contract TicketNFT is ERC721, Ownable {
    // !!! Rimosso: using Counters for Counters.Counter; !!!
    // !!! Rimosso: Counters.Counter private _tokenIdCounter; !!!

    // Aggiunto: Contatore manuale per gli ID dei token. Parte da 0.
    uint256 private _nextTokenId;

    // Definiamo una struttura per conservare i nostri dati personalizzati per ogni biglietto
    // Questa rimane invariata
    struct TicketData {
        uint256 eventId;       // ID dell'evento a cui il biglietto appartiene
        uint256 originalPrice; // Prezzo originale (es. in centesimi di Euro o unità di stablecoin)
        uint256 issuanceDate;  // Timestamp Unix di quando il biglietto è stato creato
    }

    // Creiamo una "mappa" che associa ogni ID di biglietto (tokenId) ai suoi dati personalizzati
    // Questa rimane invariata
    mapping(uint256 => TicketData) public ticketData;

    /**
     * @dev Costruttore del contratto. Imposta il nome e il simbolo dell'NFT.
     * Trasferisce la proprietà del contratto a chi lo ha deployato (initialOwner).
     * In OZ v5, Ownable richiede l'initialOwner nel costruttore.
     */
    constructor(string memory _name, string memory _symbol, address initialOwner) ERC721(_name, _symbol) Ownable(initialOwner) {}

    /**
     * @dev Funzione per creare un nuovo biglietto NFT (minting).
     * Può essere chiamata solo dal proprietario del contratto (es. il backend della piattaforma).
     * !!! MODIFICATA: Usa _nextTokenId invece di Counters !!!
     * @param _to L'indirizzo a cui assegnare il nuovo biglietto.
     * @param _eventId L'ID dell'evento per questo biglietto.
     * @param _originalPrice Il prezzo originale di vendita del biglietto.
     * @return L'ID del nuovo biglietto NFT creato.
     */
    function mintTicket(address _to, uint256 _eventId, uint256 _originalPrice) public onlyOwner returns (uint256) {
        // Otteniamo l'ID corrente dal nostro contatore manuale
        uint256 newItemId = _nextTokenId;

        // Incrementiamo il contatore per il *prossimo* biglietto che verrà creato
        _nextTokenId++;

        // Crea ("minta") l'NFT standard ERC721 assegnandolo all'indirizzo _to con il nuovo ID
        _mint(_to, newItemId);

        // Registra i dati personalizzati nella nostra mappa, associandoli al nuovo newItemId
        // block.timestamp è una variabile globale in Solidity che contiene il timestamp del blocco corrente
        ticketData[newItemId] = TicketData({
            eventId: _eventId,
            originalPrice: _originalPrice,
            issuanceDate: block.timestamp
        });

        // Restituisce l'ID del biglietto appena creato
        return newItemId;
    }

    // --- Funzioni aggiuntive (opzionali per ora) ---
    // Potremmo aggiungere qui funzioni per leggere i dati in modo più strutturato,
    // o per supportare lo standard dei metadati ERC721 (tokenURI),
    // ma per l'MVP questo dovrebbe bastare.

}