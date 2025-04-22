// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; // Va bene anche per OZ v5.x

// Importiamo i contratti standard e sicuri di OpenZeppelin v5.x
// I percorsi per ERC721 e Ownable non sono cambiati rispetto alla v4.
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol"; // Per gestire la proprietà del contratto
import "./Marketplace.sol";

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

    // --- NUOVE VARIABILI DI STATO ---
    // Modificata: rimossa 'immutable'
    Marketplace public marketplaceContract; // Riferimento al contratto Marketplace (immutabile)

    // Mappa: ID Evento => Indirizzo Creatore (che riceve il prezzo)
    mapping(uint256 => address payable) public eventCreators;

    // Mappa: ID Evento => Prezzo Originale (in Wei)
    mapping(uint256 => uint256) public eventOriginalPrices;
    // --- FINE NUOVE VARIABILI ---

    // Definiamo una struttura per conservare i nostri dati personalizzati per ogni biglietto
    // Questa rimane invariata
    struct TicketData {
        uint256 eventId;       // ID dell'evento a cui il biglietto appartiene
        uint256 originalPrice; // Prezzo originale (es. in centesimi di Euro o unità di stablecoin)
        uint256 issuanceDate;  // Timestamp Unix di quando il biglietto è stato creato
    }

    // --- NUOVO EVENTO ---
    event EventRegistered(
        uint256 indexed eventId,
        address indexed creatorAddress,
        uint256 originalPrice
    );
    // --- FINE NUOVO EVENTO ---

    // Creiamo una "mappa" che associa ogni ID di biglietto (tokenId) ai suoi dati personalizzati
    // Questa rimane invariata
    mapping(uint256 => TicketData) public ticketData;

    /**
    * @dev Costruttore: Imposta nome, simbolo, owner iniziale e indirizzo Marketplace.
    * @param _name Nome collezione NFT.
    * @param _symbol Simbolo collezione NFT.
    * @param _initialOwner Proprietario iniziale del contratto TicketNFT.
    * @param _marketplaceAddress Indirizzo del contratto Marketplace deployato.
    */
    constructor(
        string memory _name,
        string memory _symbol,
        address _initialOwner,
        address _marketplaceAddress // Nuovo argomento
    ) ERC721(_name, _symbol) Ownable(_initialOwner) {
        require(_marketplaceAddress != address(0), "TicketNFT: Indirizzo Marketplace non valido");
        marketplaceContract = Marketplace(_marketplaceAddress); // Salva riferimento al Marketplace
    }

    /**
    * @dev Registra un nuovo evento, associando ID, indirizzo creatore e prezzo.
    * Solo il proprietario del contratto può chiamarla.
    * @param _eventId ID univoco per l'evento.
    * @param _creatorAddress Indirizzo del creatore che riceverà i pagamenti.
    * @param _originalPrice Prezzo di vendita primario per i biglietti di questo evento (in Wei).
    */
    function registerEvent(
        uint256 _eventId,
        address payable _creatorAddress,
        uint256 _originalPrice
    ) external onlyOwner {
        require(_creatorAddress != address(0), "TicketNFT: Indirizzo creatore non valido");
        require(eventCreators[_eventId] == address(0), "TicketNFT: EventId gia' registrato");
        require(_originalPrice > 0, "TicketNFT: Prezzo originale deve essere positivo");

        eventCreators[_eventId] = _creatorAddress;
        eventOriginalPrices[_eventId] = _originalPrice;

        emit EventRegistered(_eventId, _creatorAddress, _originalPrice);
    }

    /**
    * @dev Funzione INTERNA per mintare un NFT e salvarne i dati.
    * Chiamata sia da mintTicket (onlyOwner) che da buyAndMintTicket (public payable).
    */
    function _createTicket(
        address _to,
        uint256 _eventId,
        uint256 _originalPrice
    ) internal returns (uint256) {
        uint256 newItemId = _nextTokenId;
        _nextTokenId++;

        _mint(_to, newItemId);

        ticketData[newItemId] = TicketData({
            eventId: _eventId,
            originalPrice: _originalPrice,
            issuanceDate: block.timestamp
        });

        return newItemId;
    }

   /**
    * @dev Funzione originale per creare un biglietto (solo Owner).
    * ORA CHIAMA LA FUNZIONE INTERNA _createTicket.
    * Usata per minting controllato dal backend/admin, senza pagamento diretto qui.
    * @param _to L'indirizzo a cui assegnare il nuovo biglietto.
    * @param _eventId L'ID dell'evento per questo biglietto (dovrebbe essere già registrato).
    * @param _originalPrice Il prezzo originale (per riferimento nei metadati NFT).
    * @return L'ID del nuovo biglietto NFT creato.
    */
    function mintTicket(
        address _to,
        uint256 _eventId,
        uint256 _originalPrice
    ) public onlyOwner returns (uint256) {
        // Aggiungiamo controlli di base sugli input
        require(_to != address(0), "TicketNFT: Destinatario non valido");
        require(_originalPrice > 0, "TicketNFT: Prezzo originale (parametro) deve essere positivo");
        // Opzionale ma consigliato: Verifichiamo che l'evento sia stato registrato
        // require(eventCreators[_eventId] != address(0), "TicketNFT: Evento non registrato per mintTicket");

        // Delega la creazione effettiva alla funzione interna
        return _createTicket(_to, _eventId, _originalPrice);
    }

    /**
    * @dev Permette a un utente di acquistare e mintare un biglietto per un evento registrato.
    * Legge commissione e wallet servizio dal contratto Marketplace associato.
    * @param _eventId L'ID dell'evento per cui acquistare il biglietto.
    */
    function buyAndMintTicket(uint256 _eventId) external payable {
        // 1. Recupera dati evento e valida
        address payable creatorAddress = eventCreators[_eventId];
        uint256 originalPrice = eventOriginalPrices[_eventId];
        // Il controllo originalPrice > 0 è implicito perché lo facciamo in registerEvent
        require(creatorAddress != address(0), "TicketNFT: Evento non registrato o invalido");

        // 2. Recupera dati commissione dal Marketplace associato
        uint256 feeBps = marketplaceContract.serviceFeeBasisPoints();
        address payable serviceWallet = marketplaceContract.serviceWallet();
        require(serviceWallet != address(0), "TicketNFT: Wallet servizio non configurato nel Marketplace");

        // 3. Calcola fee e totale dovuto
        uint256 serviceFee = (originalPrice * feeBps) / 10000;
        uint256 totalDue = originalPrice + serviceFee;

        // 4. Verifica pagamento esatto
        require(msg.value == totalDue, "TicketNFT: Pagamento esatto richiesto (prezzo + fee)");

        // 5. Distribuisci fondi (fee prima per sicurezza contro reentrancy)
        if (serviceFee > 0) {
            // Verifica che il wallet di servizio possa ricevere fondi prima di inviare
            (bool successFee, ) = serviceWallet.call{value: serviceFee}("");
            require(successFee, "TicketNFT: Trasferimento commissione fallito");
        }
        // Verifica che il creatore possa ricevere fondi prima di inviare
        (bool successPrice, ) = creatorAddress.call{value: originalPrice}("");
        require(successPrice, "TicketNFT: Trasferimento prezzo fallito");

        // 6. Minta l'NFT all'acquirente (msg.sender) chiamando la funzione interna
        // Passiamo msg.sender come destinatario '_to'
        _createTicket(msg.sender, _eventId, originalPrice);

        // Nota: L'evento Transfer standard viene emesso da _mint dentro _createTicket
    }

    /**
    * @dev Permette all'owner di impostare/aggiornare l'indirizzo del Marketplace.
    * Necessario a causa della dipendenza circolare nel deploy.
    * @param _marketplaceAddress Il nuovo indirizzo del contratto Marketplace.
    */
    function setMarketplaceAddress(address _marketplaceAddress) external onlyOwner {
        require(_marketplaceAddress != address(0), "TicketNFT: Nuovo indirizzo Marketplace non valido");
        marketplaceContract = Marketplace(_marketplaceAddress);
        // Potresti voler emettere un evento qui
        // emit MarketplaceAddressSet(_marketplaceAddress);
    }

    // --- Funzioni aggiuntive (opzionali per ora) ---
    // Potremmo aggiungere qui funzioni per leggere i dati in modo più strutturato,
    // o per supportare lo standard dei metadati ERC721 (tokenURI),
    // ma per l'MVP questo dovrebbe bastare.

}