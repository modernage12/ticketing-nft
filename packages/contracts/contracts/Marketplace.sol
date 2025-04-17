// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Importiamo l'interfaccia e ANCHE il contratto TicketNFT completo
import "@openzeppelin/contracts/token/ERC721/IERC721.sol"; // Interfaccia standard
import "./TicketNFT.sol"; // Il nostro contratto specifico per accedere a ticketData

// Importiamo Ownable per gestire la proprietà del contratto (es. per future commissioni)
import "@openzeppelin/contracts/access/Ownable.sol";
// Importiamo ReentrancyGuard per prevenire attacchi comuni (buona pratica)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


/**
 * @title Marketplace
 * @dev Contratto per la compravendita P2P di TicketNFT. (v3 - Con getter corretto)
 * Permette di listare NFT, acquistarli rispettando il prezzo massimo (originale), e cancellare le offerte.
 * Per ora, il pagamento è simulato.
 */
contract Marketplace is Ownable, ReentrancyGuard {

    // Indirizzo del contratto TicketNFT che questo marketplace gestirà
    TicketNFT public immutable ticketNFTContract;

    // Struttura per memorizzare le informazioni di un NFT listato
    struct Listing {
        address seller;     // Chi ha messo in vendita l'NFT
        uint256 price;      // Prezzo richiesto (deve essere <= originale)
        bool active;        // L'offerta è attiva?
    }

    // Mappa che associa il tokenId di un NFT alla sua Listing sul marketplace
    mapping(uint256 => Listing) public listings;

    // Eventi: notifiche emesse dal contratto che il frontend può ascoltare
    event ItemListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );
    event ItemSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );
    event ListingCancelled(
        uint256 indexed tokenId,
        address indexed seller
    );

    /**
     * @dev Costruttore: imposta l'indirizzo del contratto TicketNFT da usare.
     * @param _ticketNFTAddress L'indirizzo del contratto TicketNFT deployato.
     */
    constructor(address _ticketNFTAddress) Ownable(msg.sender) { // Assumiamo che chi deploya il marketplace sia l'owner iniziale
        require(_ticketNFTAddress != address(0), "Marketplace: Indirizzo NFT non valido");
        ticketNFTContract = TicketNFT(_ticketNFTAddress);
    }

    /**
     * @dev Mette in vendita un TicketNFT sul marketplace.
     * Richiede che chi chiama la funzione sia il proprietario dell'NFT
     * e che abbia PRIMA approvato questo contratto Marketplace a gestire quel tokenId.
     * Verifica che il prezzo non superi quello originale leggendolo da TicketNFT.
     * @param _tokenId L'ID del TicketNFT da listare.
     * @param _price Il prezzo di vendita richiesto.
     */
    function listItem(uint256 _tokenId, uint256 _price) external nonReentrant {
        address owner = IERC721(address(ticketNFTContract)).ownerOf(_tokenId);
        require(msg.sender == owner, "Marketplace: Non sei il proprietario dell'NFT");
        require(!listings[_tokenId].active, "Marketplace: NFT gia' listato");

        // --- Recupero Prezzo Originale da TicketNFT e Controllo ---
        // === MODIFICA: Catturiamo i valori multipli restituiti dal getter ===
        // Il getter pubblico per 'ticketData(tokenId)' restituisce i campi della struct separatamente.
        (uint256 eventIdFromNFT, uint256 originalPriceFromNFT, uint256 issuanceDateFromNFT) = ticketNFTContract.ticketData(_tokenId);

        // !!! CONTROLLO PREZZO IMPLEMENTATO (usa la variabile corretta) !!!
        require(_price <= originalPriceFromNFT, "Marketplace: Il prezzo supera l'originale");

        // Verifica approvazione (usando interfaccia IERC721 per funzioni standard)
        require(IERC721(address(ticketNFTContract)).getApproved(_tokenId) == address(this) || IERC721(address(ticketNFTContract)).isApprovedForAll(owner, address(this)),
                "Marketplace: Il contratto non e' approvato a gestire questo NFT");

        // Registra la nuova listing
        listings[_tokenId] = Listing({
            seller: msg.sender,
            price: _price,
            active: true
        });

        emit ItemListed(_tokenId, msg.sender, _price);
    }

    /**
     * @dev Acquista un TicketNFT listato sul marketplace.
     * Il pagamento è simulato in questa versione MVP.
     * @param _tokenId L'ID del TicketNFT da acquistare.
     */
    function buyItem(uint256 _tokenId) external payable nonReentrant {
        Listing storage currentListing = listings[_tokenId];
        require(currentListing.active, "Marketplace: NFT non listato o gia' venduto");
        address seller = currentListing.seller;
        require(msg.sender != seller, "Marketplace: Non puoi comprare il tuo stesso NFT");

        // --- Gestione Pagamento (Simulato per MVP) ---

        currentListing.active = false;
        IERC721(address(ticketNFTContract)).safeTransferFrom(seller, msg.sender, _tokenId);
        emit ItemSold(_tokenId, seller, msg.sender, currentListing.price);
    }

    /**
     * @dev Cancella una listing attiva dal marketplace.
     * Può essere chiamato solo dal venditore che ha listato l'NFT.
     * @param _tokenId L'ID del TicketNFT la cui listing deve essere cancellata.
     */
    function cancelListing(uint256 _tokenId) external nonReentrant {
        Listing storage currentListing = listings[_tokenId];
        require(currentListing.active, "Marketplace: NFT non listato o gia' venduto");
        require(msg.sender == currentListing.seller, "Marketplace: Non sei il venditore");

        currentListing.active = false;
        emit ListingCancelled(_tokenId, msg.sender);
    }

    // --- Funzioni per Commissioni (Commentate per ora) ---
    /*
    uint256 public platformFeePercent = 2; // Esempio: 2%
    address public feeRecipient; // Indirizzo a cui inviare le commissioni
    // ... (altre funzioni per impostare/prelevare commissioni) ...
    */
}