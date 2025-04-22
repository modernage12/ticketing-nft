// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./TicketNFT.sol"; // Per accedere a ticketData
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Marketplace
 * @dev Contratto per la compravendita P2P di TicketNFT (v4 - Pagamento Reale P2P).
 * Include commissione percentuale per la piattaforma, configurabile dall'owner.
 */
contract Marketplace is Ownable, ReentrancyGuard {

    // Indirizzo del contratto TicketNFT (immutabile, impostato nel costruttore)
    TicketNFT public immutable ticketNFTContract;

    // --- NUOVE VARIABILI DI STATO PER COMMISSIONI ---
    /**
     * @dev Commissione in basis points (1/100 di un percento). Es: 250 = 2.5%. Max 10000 (100%).
     */
    uint256 public serviceFeeBasisPoints;
    /**
     * @dev Wallet che riceve le commissioni del servizio. DEVE essere un indirizzo capace di ricevere fondi (payable).
     */
    address payable public serviceWallet;
    // --- FINE NUOVE VARIABILI ---

    // Struttura Listing (invariata)
    struct Listing {
        address seller;
        uint256 price; // Prezzo richiesto dal venditore (in Wei)
        bool active;
    }

    // Mappa Listings (invariata)
    mapping(uint256 => Listing) public listings;

    // --- EVENTI AGGIORNATI ---
    event ItemListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );
    event ItemSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,      // Prezzo pagato al venditore
        uint256 serviceFee  // Commissione pagata al servizio (NUOVO)
    );
    event ListingCancelled(
        uint256 indexed tokenId,
        address indexed seller
    );
    // Eventi per aggiornamento configurazione commissioni (NUOVI)
    event ServiceFeeUpdated(uint256 newFeeBasisPoints);
    event ServiceWalletUpdated(address newWallet);
    // --- FINE EVENTI AGGIORNATI ---


    /**
     * @dev Costruttore: imposta NFT contract, fee iniziale e wallet servizio iniziale.
     * @param _ticketNFTAddress Indirizzo del contratto TicketNFT.
     * @param _initialFeeBasisPoints Commissione iniziale in basis points (es. 250 per 2.5%).
     * @param _initialServiceWallet Indirizzo del wallet che riceve le commissioni.
     */
    constructor(
        address _ticketNFTAddress,
        uint256 _initialFeeBasisPoints,
        address payable _initialServiceWallet // Deve essere payable
    ) Ownable(msg.sender) { // Owner è chi deploya
        require(_ticketNFTAddress != address(0), "Marketplace: Indirizzo NFT non valido");
        require(_initialServiceWallet != address(0), "Marketplace: Indirizzo servizio non valido");
        // require(_initialFeeBasisPoints <= 10000, "Marketplace: Fee iniziale troppo alta"); // Controllo opzionale

        ticketNFTContract = TicketNFT(_ticketNFTAddress);
        serviceFeeBasisPoints = _initialFeeBasisPoints; // Es: 250
        serviceWallet = _initialServiceWallet;          // Es: 0xf181... tuo indirizzo
    }

    // --- NUOVE FUNZIONI PER GESTIRE COMMISSIONI (SOLO OWNER) ---

    /**
     * @dev Permette all'owner di aggiornare la percentuale di commissione.
     * @param _newFeeBasisPoints La nuova commissione in basis points (max 10000).
     */
    function setServiceFeeBasisPoints(uint256 _newFeeBasisPoints) external onlyOwner {
        require(_newFeeBasisPoints <= 10000, "Marketplace: Fee non valida (0-10000)"); // Controllo importante
        serviceFeeBasisPoints = _newFeeBasisPoints;
        emit ServiceFeeUpdated(_newFeeBasisPoints);
    }

    /**
     * @dev Permette all'owner di aggiornare il wallet che riceve le commissioni.
     * @param _newServiceWallet Il nuovo indirizzo del wallet (deve essere payable).
     */
    function setServiceWallet(address payable _newServiceWallet) external onlyOwner {
        require(_newServiceWallet != address(0), "Marketplace: Indirizzo zero non valido");
        serviceWallet = _newServiceWallet;
        emit ServiceWalletUpdated(_newServiceWallet);
    }
    // --- FINE NUOVE FUNZIONI ---


    /**
     * @dev Mette in vendita un TicketNFT (funzione invariata nella logica principale).
     * Verifica prezzo originale per price cap. Richiede approve precedente.
     * @param _tokenId L'ID del TicketNFT da listare.
     * @param _price Il prezzo di vendita richiesto (in Wei).
     */
    function listItem(uint256 _tokenId, uint256 _price) external nonReentrant {
        address owner = IERC721(address(ticketNFTContract)).ownerOf(_tokenId);
        require(msg.sender == owner, "Marketplace: Non sei il proprietario");
        require(!listings[_tokenId].active, "Marketplace: NFT gia' listato");

        // Recupero Prezzo Originale da TicketNFT e Controllo Price Cap
        (, uint256 originalPriceFromNFT, ) = ticketNFTContract.ticketData(_tokenId);
        require(_price > 0, "Marketplace: Il prezzo deve essere positivo"); // Aggiunto controllo prezzo > 0
        require(_price <= originalPriceFromNFT, "Marketplace: Il prezzo supera l'originale");

        // Verifica approvazione
        require(IERC721(address(ticketNFTContract)).getApproved(_tokenId) == address(this) ||
                IERC721(address(ticketNFTContract)).isApprovedForAll(owner, address(this)),
                "Marketplace: Contratto non approvato");

        // Registra listing
        listings[_tokenId] = Listing({
            seller: msg.sender,
            price: _price,
            active: true
        });

        emit ItemListed(_tokenId, msg.sender, _price);
    }

    /**
     * @dev Acquista un TicketNFT listato, gestendo pagamento e commissioni.
     * @param _tokenId L'ID del TicketNFT da acquistare.
     */
    function buyItem(uint256 _tokenId) external payable nonReentrant { // <- PAYABLE
        Listing storage currentListing = listings[_tokenId];
        require(currentListing.active, "Marketplace: NFT non listato o venduto");
        address seller = currentListing.seller;
        require(msg.sender != seller, "Marketplace: Non puoi comprare il tuo NFT");

        // --- NUOVA LOGICA PAGAMENTO E COMMISSIONI ---
        uint256 price = currentListing.price; // Prezzo richiesto dal venditore
        uint256 serviceFee = calculateServiceFee(price); // Calcola commissione
        uint256 totalDue = price + serviceFee;

        // Verifica che l'importo inviato (msg.value) sia ESATTAMENTE quello dovuto
        require(msg.value == totalDue, "Marketplace: Pagamento esatto richiesto");

        // Rendi il listing inattivo PRIMA dei trasferimenti per sicurezza (previene reentrancy su trasferimenti)
        currentListing.active = false;

        // Trasferisci la commissione al wallet del servizio
        // .transfer() fa revert automaticamente in caso di errore in Solidity >= 0.8
        // NESSUNA assegnazione bool, NESSUN require sottostante
        serviceWallet.transfer(serviceFee);

        // Trasferisci il prezzo al venditore (dopo la commissione)
         // NESSUNA assegnazione bool, NESSUN require sottostante
        payable(seller).transfer(price);
        // --- FINE NUOVA LOGICA PAGAMENTO ---

        // Trasferisci l'NFT dall'approvazione data dal venditore all'acquirente (msg.sender)
        IERC721(address(ticketNFTContract)).safeTransferFrom(seller, msg.sender, _tokenId);

        // Emetti l'evento con i dettagli (incluso la commissione)
        emit ItemSold(_tokenId, seller, msg.sender, price, serviceFee);
    }

    /**
     * @dev Cancella una listing attiva (funzione invariata).
     * @param _tokenId L'ID del TicketNFT la cui listing deve essere cancellata.
     */
    function cancelListing(uint256 _tokenId) external nonReentrant {
        Listing storage currentListing = listings[_tokenId];
        require(currentListing.active, "Marketplace: NFT non listato o venduto");
        require(msg.sender == currentListing.seller, "Marketplace: Non sei il venditore");

        currentListing.active = false; // Rendi inattivo
        emit ListingCancelled(_tokenId, msg.sender);
    }

    // --- FUNZIONE HELPER INTERNA (NUOVA) ---

    /**
     * @dev Calcola la commissione di servizio basata sul prezzo e sulla percentuale memorizzata.
     * @param _price Il prezzo (in Wei) su cui calcolare la commissione.
     * @return L'importo della commissione calcolata (in Wei).
     */
    function calculateServiceFee(uint256 _price) internal view returns (uint256) {
        // Moltiplica prima di dividere per 10000 per preservare la precisione con interi
        // Evita overflow se _price è molto grande (improbabile con prezzi biglietti ma buona pratica)
        return (_price * serviceFeeBasisPoints) / 10000;
    }
    // --- FINE FUNZIONE HELPER ---

}