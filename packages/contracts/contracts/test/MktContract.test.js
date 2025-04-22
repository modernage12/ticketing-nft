const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unica describe nel file
describe("Minimal Marketplace Test Context", function () {
    // Variabili minime necessarie solo per il deploy di TicketNFT
    let TicketNFT, ticketNFT, ticketNFTAddress;
    let owner; // Serve solo l'owner per deployare TicketNFT

    // beforeEach fa SOLO il deploy di TicketNFT
    beforeEach(async function () {
        // 1. Get signers
        [owner, seller, buyer, serviceWalletAccount, otherAccount] = await ethers.getSigners();
        console.log(">>> Getting signers OK");

        // --- Deploy Contratto TicketNFT --- (Sappiamo che funziona)
        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        console.log(">>> Got TicketNFT Factory OK");
        const nftName = "TestTicketNFT"; // Rimettiamo i nomi originali
        const nftSymbol = "TTNFT";
        console.log(">>> Deploying TicketNFT...");
        ticketNFT = await TicketNFTFactory.connect(owner).deploy(nftName, nftSymbol, owner.address);
        await ticketNFT.waitForDeployment();
        ticketNFTAddress = await ticketNFT.getAddress();
        console.log(">>> TicketNFT Deployed OK at:", ticketNFTAddress);

        // --- AGGIUNTA: Deploy Contratto Marketplace ---
        console.log(">>> Getting Marketplace Factory...");
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        console.log(">>> Deploying Marketplace...");
        try {
            marketplace = await MarketplaceFactory.connect(owner).deploy(
                ticketNFTAddress,          // Indirizzo TicketNFT
                initialFeeBasisPoints,     // Fee
                serviceWalletAccount.address // Wallet servizio (test)
            );
            await marketplace.waitForDeployment();
            marketplaceAddress = await marketplace.getAddress();
            console.log(">>> Marketplace deployed successfully:", marketplaceAddress);
        } catch (error) {
             console.error("!!! Deployment FAILED for Marketplace:", error);
             throw error;
        }
        // --- FINE AGGIUNTA ---

        // Commentiamo ancora la parte successiva (minting e approve)
        /*
        // --- Setup Comune per i Test ---
        const eventId = 1;
        const mintTx = await ticketNFT.connect(owner).mintTicket(seller.address, eventId, originalPrice);
        const receipt = await mintTx.wait();
        const transferEvent = receipt.logs.find(log => log.eventName === 'Transfer');
        if (!transferEvent) { throw new Error("Transfer event not found after minting"); }
        tokenIdToTest = transferEvent.args.tokenId;
        await ticketNFT.connect(seller).approve(marketplaceAddress, tokenIdToTest);
        */

        console.log(">>> End of beforeEach (Marketplace deploy added)");
    });

    // Modifichiamo il test per controllare entrambi i deploy
    it("should successfully deploy TicketNFT and Marketplace", function () {
        console.log(">>> Running the deployment test case...");
        expect(ticketNFTAddress).to.be.properAddress;
        // Ora marketplaceAddress dovrebbe essere definito
        expect(marketplaceAddress).to.be.properAddress;
    });

    // Nessun altro test o describe in questo file per ora
});