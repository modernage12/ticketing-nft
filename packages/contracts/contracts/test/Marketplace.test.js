const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unica describe nel file
describe("Minimal Marketplace Test Context", function () {
    // Variabili minime necessarie solo per il deploy di TicketNFT
    let TicketNFT, ticketNFT, ticketNFTAddress;
    let owner; // Serve solo l'owner per deployare TicketNFT

    // beforeEach fa SOLO il deploy di TicketNFT
    beforeEach(async function () {
        console.log(">>> Minimal beforeEach starting...");
        [owner] = await ethers.getSigners();
        console.log(">>> Got owner:", owner.address);

        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        console.log(">>> Got TicketNFT Factory");
        const nftName = "MinimalTest";
        const nftSymbol = "MNT";

        console.log(">>> Deploying TicketNFT...");
        try {
            // Tentativo di deploy (la riga che dava errore)
            ticketNFT = await TicketNFTFactory.connect(owner).deploy(nftName, nftSymbol, owner.address);
            await ticketNFT.waitForDeployment();
            ticketNFTAddress = await ticketNFT.getAddress();
            console.log(">>> TicketNFT deployed successfully in minimal beforeEach:", ticketNFTAddress);
        } catch (error) {
             console.error("!!! Deployment FAILED in minimal beforeEach:", error);
             // Rilancia l'errore per far fallire il test come dovrebbe
             throw error;
        }
        console.log(">>> Minimal beforeEach finished.");
    });

    // Test case vuoto, serve solo a far eseguire il beforeEach
    it("should simply run the beforeEach successfully", function () {
        console.log(">>> Running the empty test case...");
        // Non fa nulla, ma se beforeEach fallisce, questo test non passa
        expect(true).to.be.true;
    });

    // Nessun altro test o describe in questo file per ora
});