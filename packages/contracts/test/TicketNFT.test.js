const { expect } = require("chai"); // Importiamo la libreria di asserzioni Chai
const { ethers } = require("hardhat"); // Importiamo ethers da Hardhat per interagire con i contratti

// Blocco principale che raggruppa i test per TicketNFT
describe("TicketNFT Contract", function () {

    // Variabili che useremo nei test
    let TicketNFT; // Riferimento al Contract Factory (per deployare)
    let ticketNFT; // Riferimento all'istanza del contratto deployato
    let owner;     // Account che deploya il contratto (e ne diventa proprietario)
    let addr1;     // Un altro account per i test
    let addr2;     // Un altro account ancora

    const NFT_NAME = "My Event Ticket"; // Nome di esempio per l'NFT
    const NFT_SYMBOL = "MET";         // Simbolo di esempio

    // Questo blocco viene eseguito UNA VOLTA PRIMA di tutti i test in questo describe
    beforeEach(async function () {
        // Otteniamo la Contract Factory per il nostro TicketNFT
        TicketNFT = await ethers.getContractFactory("TicketNFT");

        // Otteniamo alcuni account di test forniti da Hardhat
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deployamo una NUOVA istanza del contratto prima di ogni test ('it' block)
        // Passiamo nome, simbolo e l'indirizzo dell'owner al costruttore (come richiesto da OZ v5)
        ticketNFT = await TicketNFT.deploy(NFT_NAME, NFT_SYMBOL, owner.address);
        // NOTA: In versioni più vecchie di hardhat/ethers potrebe servire await ticketNFT.deployed();
    });

    // Test Case 1: Verifica il deploy e i valori iniziali
    it("Should deploy correctly and set the right name and symbol", async function () {
        // Verifica che il nome dell'NFT sia corretto
        expect(await ticketNFT.name()).to.equal(NFT_NAME);

        // Verifica che il simbolo dell'NFT sia corretto
        expect(await ticketNFT.symbol()).to.equal(NFT_SYMBOL);

        // Verifica che chi ha deployato sia l'owner (grazie a Ownable)
        expect(await ticketNFT.owner()).to.equal(owner.address);
    });

    // --- Qui aggiungeremo altri test ('it' blocks) ---
    // es. per il minting, i metadati, ecc.
    // --- Qui inizia il codice da AGGIUNGERE ---

    // Test Case 2: Minting di un biglietto da parte dell'owner
    it("Should allow the owner to mint a ticket and set data correctly", async function () {
        const eventId = 1;
        const originalPrice = ethers.parseUnits("50", 6); // Es. 50 Euro * 10^6 (per gestire decimali)
        const recipient = addr1.address;
        const expectedTokenId = 0; // Il primo token avrà ID 0

        // Chiamiamo mintTicket collegandoci come 'owner'
        // Usiamo 'await expect(...).to.emit(...)' per verificare l'evento Transfer standard ERC721
        await expect(ticketNFT.connect(owner).mintTicket(recipient, eventId, originalPrice))
            .to.emit(ticketNFT, "Transfer")
            .withArgs(ethers.ZeroAddress, recipient, expectedTokenId); // Da: Indirizzo Zero, A: Recipient, ID: 0

        // Verifichiamo che il destinatario sia il nuovo proprietario dell'NFT
        expect(await ticketNFT.ownerOf(expectedTokenId)).to.equal(recipient);

        // Verifichiamo che il bilancio NFT del destinatario sia 1
        expect(await ticketNFT.balanceOf(recipient)).to.equal(1);

        // Verifichiamo i metadati personalizzati salvati nella mappa ticketData
        const data = await ticketNFT.ticketData(expectedTokenId);
        expect(data.eventId).to.equal(eventId);
        expect(data.originalPrice).to.equal(originalPrice);
        // Non testiamo issuanceDate esattamente, ma verifichiamo che sia > 0
        expect(data.issuanceDate).to.be.gt(0);
    });

    // Test Case 3: Impedire il minting a un non-proprietario
    it("Should NOT allow a non-owner to mint a ticket", async function () {
        const eventId = 2;
        const originalPrice = ethers.parseUnits("100", 6);
        const recipient = addr2.address;

        // Chiamiamo mintTicket collegandoci come 'addr1' (non owner)
        // Ci aspettiamo che la transazione venga annullata (reverted)
        // Usiamo 'revertedWithCustomError' specifico per Ownable v5
        await expect(ticketNFT.connect(addr1).mintTicket(recipient, eventId, originalPrice))
            .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
            .withArgs(addr1.address); // L'errore indica quale account non era autorizzato
    });

    // Test Case 4: Verificare l'incremento degli ID
    it("Should increment token IDs correctly", async function () {
        const eventId1 = 10;
        const price1 = ethers.parseUnits("10", 6);
        const recipient1 = addr1.address;

        const eventId2 = 11;
        const price2 = ethers.parseUnits("20", 6);
        const recipient2 = addr2.address;

        // Mintiamo il primo biglietto (ci aspettiamo ID 0)
        await expect(ticketNFT.connect(owner).mintTicket(recipient1, eventId1, price1))
            .to.emit(ticketNFT, "Transfer")
            .withArgs(ethers.ZeroAddress, recipient1, 0);

        // Mintiamo il secondo biglietto (ci aspettiamo ID 1)
        await expect(ticketNFT.connect(owner).mintTicket(recipient2, eventId2, price2))
            .to.emit(ticketNFT, "Transfer")
            .withArgs(ethers.ZeroAddress, recipient2, 1);

        // Verifichiamo i proprietari
        expect(await ticketNFT.ownerOf(0)).to.equal(recipient1);
        expect(await ticketNFT.ownerOf(1)).to.equal(recipient2);
    });

// --- Qui finisce il codice da AGGIUNGERE ---
}); // Chiusura del blocco describe principale