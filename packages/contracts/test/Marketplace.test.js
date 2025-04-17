// Importiamo le librerie necessarie per i test
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Blocco principale che raggruppa tutti i test per il contratto Marketplace
describe("Marketplace Contract", function () {
    // Dichiarazione delle variabili che useremo in più test
    let TicketNFT, ticketNFT, Marketplace, marketplace; // Contract factories e istanze deployate
    let owner, seller, buyer, addr2; // Account/Signers (aggiunto addr2 per test)
    let ticketId = 0; // ID del biglietto standard usato nei test
    let eventId = 1; // ID evento di esempio
    let originalPrice = ethers.parseUnits("100", 6); // Prezzo originale (es. 100 unità con 6 decimali)
    let validListingPrice = ethers.parseUnits("90", 6); // Prezzo valido (<= originale)
    let invalidListingPrice = ethers.parseUnits("110", 6); // Prezzo NON valido (> originale)

    // Questo blocco viene eseguito automaticamente prima di ogni singolo test ('it' block)
    beforeEach(async function () {
        // Otteniamo gli account di test forniti da Hardhat
        [owner, seller, buyer, addr2] = await ethers.getSigners(); // Otteniamo un quarto account

        // Deploy del contratto TicketNFT
        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        // Assicurati che il costruttore corrisponda a quello del tuo TicketNFT.sol (richiede initialOwner in OZ v5)
        ticketNFT = await TicketNFTFactory.deploy("TestTicket", "TTK", owner.address);

        // Mintiamo un NFT di test (ID 0) dall'owner all'account 'seller'
        await ticketNFT.connect(owner).mintTicket(seller.address, eventId, originalPrice);

        // Deploy del contratto Marketplace, passando l'indirizzo del contratto NFT appena deployato
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        // Assicurati che il costruttore corrisponda (richiede initialOwner in OZ v5)
        marketplace = await MarketplaceFactory.deploy(ticketNFT.target); // Usiamo .target per ottenere l'indirizzo in ethers v6
    });

    // --- Sezione Test per la funzione listItem ---

    it("Should allow seller to list an approved NFT with valid price", async function () {
        await expect(ticketNFT.connect(seller).approve(marketplace.target, ticketId))
            .to.emit(ticketNFT, "Approval")
            .withArgs(seller.address, marketplace.target, ticketId);
        await expect(marketplace.connect(seller).listItem(ticketId, validListingPrice))
            .to.emit(marketplace, "ItemListed")
            .withArgs(ticketId, seller.address, validListingPrice);
        const listing = await marketplace.listings(ticketId);
        expect(listing.seller).to.equal(seller.address);
        expect(listing.price).to.equal(validListingPrice);
        expect(listing.active).to.be.true;
    });

    it("Should REVERT listing if price is higher than original price", async function () {
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await expect(marketplace.connect(seller).listItem(ticketId, invalidListingPrice))
            .to.be.revertedWith("Marketplace: Il prezzo supera l'originale");
        const listing = await marketplace.listings(ticketId);
        expect(listing.active).to.be.false;
        expect(listing.seller).to.equal(ethers.ZeroAddress);
    });

    it("Should REVERT listing if caller is not the owner of the NFT", async function () {
        await expect(marketplace.connect(buyer).listItem(ticketId, validListingPrice))
            .to.be.revertedWith("Marketplace: Non sei il proprietario dell'NFT");
    });

    it("Should REVERT listing if marketplace is not approved for the NFT", async function () {
        await expect(marketplace.connect(seller).listItem(ticketId, validListingPrice))
            .to.be.revertedWith("Marketplace: Il contratto non e' approvato a gestire questo NFT");
    });

    // --- Sezione Test per la funzione buyItem ---

    it("Should allow a buyer to buy a listed item", async function () {
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);
        await expect(marketplace.connect(buyer).buyItem(ticketId))
            .to.emit(marketplace, "ItemSold")
            .withArgs(ticketId, seller.address, buyer.address, validListingPrice);
        expect(await ticketNFT.ownerOf(ticketId)).to.equal(buyer.address);
        const listing = await marketplace.listings(ticketId);
        expect(listing.active).to.be.false;
    });

    it("Should REVERT buying if item is not listed", async function () {
        await expect(marketplace.connect(buyer).buyItem(ticketId))
            .to.be.revertedWith("Marketplace: NFT non listato o gia' venduto");
    });

    it("Should REVERT buying if seller tries to buy their own item", async function () {
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);
        await expect(marketplace.connect(seller).buyItem(ticketId))
            .to.be.revertedWith("Marketplace: Non puoi comprare il tuo stesso NFT");
    });

    it("Should REVERT buying if item was already sold", async function () {
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);
        await marketplace.connect(buyer).buyItem(ticketId); // Primo acquisto
        await expect(marketplace.connect(addr2).buyItem(ticketId)) // Secondo tentativo di acquisto
            .to.be.revertedWith("Marketplace: NFT non listato o gia' venduto");
    });

    // --- Sezione Test per la funzione cancelListing ---

    it("Should allow the seller to cancel their listing", async function () {
        // Setup: Seller approva e lista l'NFT
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);

        // Azione: Seller annulla la listing
        await expect(marketplace.connect(seller).cancelListing(ticketId))
            .to.emit(marketplace, "ListingCancelled") // Verifichiamo l'evento ListingCancelled
            .withArgs(ticketId, seller.address);

        // Verifiche post-annullamento:
        const listing = await marketplace.listings(ticketId);
        expect(listing.active).to.be.false; // La listing deve essere inattiva
        expect(await ticketNFT.ownerOf(ticketId)).to.equal(seller.address); // L'NFT appartiene ancora al seller
    });

    it("Should REVERT cancelling if caller is not the seller", async function () {
        // Setup: Seller approva e lista l'NFT
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);

        // Azione: Buyer tenta di annullare la listing del seller
        await expect(marketplace.connect(buyer).cancelListing(ticketId))
            .to.be.revertedWith("Marketplace: Non sei il venditore");
    });

    it("Should REVERT cancelling if item is not listed", async function () {
        // Azione 1: Seller tenta di annullare una listing per ticketId (0) che non è mai stata creata
        await expect(marketplace.connect(seller).cancelListing(ticketId))
            .to.be.revertedWith("Marketplace: NFT non listato o gia' venduto");

        // Azione 2: Testiamo anche dopo una listatura e annullamento validi
        await ticketNFT.connect(seller).approve(marketplace.target, ticketId);
        await marketplace.connect(seller).listItem(ticketId, validListingPrice);
        await marketplace.connect(seller).cancelListing(ticketId); // Annulla

        // Tentativo di ri-annullare lo stesso item
        await expect(marketplace.connect(seller).cancelListing(ticketId))
            .to.be.revertedWith("Marketplace: NFT non listato o gia' venduto");
    });

}); // --- Chiusura del blocco 'describe' principale ---