// packages/contracts/test/TicketNFT.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TicketNFT Contract", function () {

    // --- Variabili Globali per i Test ---
    let TicketNFT, ticketNFT, ticketNFTAddress;
    let Marketplace, marketplace, marketplaceAddress; // Necessario per deploy TicketNFT
    let owner, creator, buyer, serviceWalletAccount, otherAccount;
    const initialFeeBasisPoints = 250; // 2.5% - Stesso valore usato nei test Marketplace
    const nftName = "TestTicket";
    const nftSymbol = "TNFT";
    const eventId1 = 1;
    const eventPrice1 = ethers.parseEther("0.5"); // 0.5 MATIC/ETH
    const zeroAddress = ethers.ZeroAddress;

    // Funzione helper per calcolare la commissione (uguale a quella in Marketplace)
    function calculateFee(price, feeBasisPoints) {
        return (BigInt(price) * BigInt(feeBasisPoints)) / 10000n;
    }

    // --- Blocco beforeEach ---
    beforeEach(async function () {
        // 1. Get Signers
        [owner, creator, buyer, serviceWalletAccount, otherAccount] = await ethers.getSigners();

        // 2. Deploy Marketplace (necessario per ottenere indirizzo per TicketNFT)
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        // Usiamo un indirizzo fittizio per TicketNFT qui, non importa per il costruttore Marketplace
        const dummyTicketNFTAddr = owner.address; // O un altro indirizzo valido
        marketplace = await MarketplaceFactory.connect(owner).deploy(
            dummyTicketNFTAddr, // Non usato da TicketNFT per leggere fee, solo come placeholder
            initialFeeBasisPoints,
            serviceWalletAccount.address
        );
        await marketplace.waitForDeployment();
        marketplaceAddress = await marketplace.getAddress();

        // 3. Deploy TicketNFT (passando l'indirizzo del Marketplace reale)
        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        ticketNFT = await TicketNFTFactory.connect(owner).deploy(
            nftName,
            nftSymbol,
            owner.address, // Owner del contratto TicketNFT
            marketplaceAddress // Indirizzo del Marketplace per leggere le fee
        );
        await ticketNFT.waitForDeployment();
        ticketNFTAddress = await ticketNFT.getAddress();
    });

    // --- Test Suite: Deployment ---
    describe("Deployment", function () {
        it("Should set the correct marketplace contract address", async function () {
            expect(await ticketNFT.marketplaceContract()).to.equal(marketplaceAddress);
        });

        it("Should set the correct owner", async function () {
            expect(await ticketNFT.owner()).to.equal(owner.address);
        });

        it("Should have correct name and symbol", async function () {
            expect(await ticketNFT.name()).to.equal(nftName);
            expect(await ticketNFT.symbol()).to.equal(nftSymbol);
        });
    });

    // --- Test Suite: Event Registration (registerEvent) ---
    describe("Event Registration (registerEvent)", function () {

        it("Should allow the owner to register a new event", async function () {
            // Chiama registerEvent dall'owner
             await expect(ticketNFT.connect(owner).registerEvent(eventId1, creator.address, eventPrice1))
                .to.emit(ticketNFT, "EventRegistered") // Verifica emissione evento
                .withArgs(eventId1, creator.address, eventPrice1); // Verifica argomenti evento

            // Verifica stato interno delle mapping
            expect(await ticketNFT.eventCreators(eventId1)).to.equal(creator.address);
            expect(await ticketNFT.eventOriginalPrices(eventId1)).to.equal(eventPrice1);
        });

        it("Should REVERT if a non-owner tries to register an event", async function () {
            await expect(ticketNFT.connect(otherAccount).registerEvent(eventId1, creator.address, eventPrice1))
               .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
               .withArgs(otherAccount.address);
        });

        it("Should REVERT if trying to register an eventId that already exists", async function () {
            // Registra l'evento la prima volta
            await ticketNFT.connect(owner).registerEvent(eventId1, creator.address, eventPrice1);
            // Prova a registrarlo di nuovo
            await expect(ticketNFT.connect(owner).registerEvent(eventId1, otherAccount.address, ethers.parseEther("1.0")))
                .to.be.revertedWith("TicketNFT: EventId gia' registrato");
        });

        it("Should REVERT if registering with an invalid creator address (zero address)", async function () {
            await expect(ticketNFT.connect(owner).registerEvent(eventId1, zeroAddress, eventPrice1))
                .to.be.revertedWith("TicketNFT: Indirizzo creatore non valido");
        });

        it("Should REVERT if registering with a zero price", async function () {
             await expect(ticketNFT.connect(owner).registerEvent(eventId1, creator.address, 0))
                .to.be.revertedWith("TicketNFT: Prezzo originale deve essere positivo");
        });

    });

    // --- Test Suite: Ticket Purchase (buyAndMintTicket) ---
    describe("Ticket Purchase (buyAndMintTicket)", function () {
        // Prima di ogni test di acquisto, registriamo l'evento
         beforeEach(async function() {
             await ticketNFT.connect(owner).registerEvent(eventId1, creator.address, eventPrice1);
         });

        it("Should allow a user to buy a ticket with correct payment", async function () {
            const feeBps = await marketplace.serviceFeeBasisPoints(); // Legge dal Marketplace
            const expectedFee = calculateFee(eventPrice1, feeBps);
            const totalDue = BigInt(eventPrice1) + expectedFee;

            const creatorBalanceBefore = await ethers.provider.getBalance(creator.address);
            const serviceWalletBalanceBefore = await ethers.provider.getBalance(serviceWalletAccount.address);
            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

             // L'acquirente ('buyer') chiama buyAndMintTicket inviando il valore corretto
            const tx = await ticketNFT.connect(buyer).buyAndMintTicket(eventId1, { value: totalDue });
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice;
            const txCost = gasUsed * gasPrice;

            // Verifica Evento Transfer (emesso da _mint dentro _createTicket)
            // Il tokenId sarà 0 perché è il primo mintato in questo beforeEach
            const expectedTokenId = 0;
            await expect(tx)
                .to.emit(ticketNFT, "Transfer")
                .withArgs(zeroAddress, buyer.address, expectedTokenId);

            // Verifica proprietà NFT
            expect(await ticketNFT.ownerOf(expectedTokenId)).to.equal(buyer.address);

            // Verifica Dati Biglietto (ticketData)
            const data = await ticketNFT.ticketData(expectedTokenId);
            expect(data.eventId).to.equal(eventId1);
            expect(data.originalPrice).to.equal(eventPrice1);
            expect(data.issuanceDate).to.be.gt(0); // Maggiore di zero

            // Verifica Bilanci
            const creatorBalanceAfter = await ethers.provider.getBalance(creator.address);
            const serviceWalletBalanceAfter = await ethers.provider.getBalance(serviceWalletAccount.address);
            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);

            expect(creatorBalanceAfter).to.equal(creatorBalanceBefore + BigInt(eventPrice1));
            // La commissione è inviata solo se > 0
            if (expectedFee > 0) {
                expect(serviceWalletBalanceAfter).to.equal(serviceWalletBalanceBefore + expectedFee);
            } else {
                 expect(serviceWalletBalanceAfter).to.equal(serviceWalletBalanceBefore);
            }
            expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - totalDue - txCost);
        });

        it("Should REVERT if the event is not registered", async function () {
             const unregisteredEventId = 99;
             const dummyPrice = ethers.parseEther("0.1"); // Serve solo per calcolare un totalDue fittizio
             const feeBps = await marketplace.serviceFeeBasisPoints();
             const fee = calculateFee(dummyPrice, feeBps); // Fee fittizia
             const totalDue = BigInt(dummyPrice) + fee;

             await expect(ticketNFT.connect(buyer).buyAndMintTicket(unregisteredEventId, { value: totalDue }))
                 .to.be.revertedWith("TicketNFT: Evento non registrato o invalido");
        });

        it("Should REVERT if payment is insufficient", async function () {
             const feeBps = await marketplace.serviceFeeBasisPoints();
             const expectedFee = calculateFee(eventPrice1, feeBps);
             const totalDue = BigInt(eventPrice1) + expectedFee;
             const insufficientValue = totalDue - 1n; // 1 Wei in meno

             await expect(ticketNFT.connect(buyer).buyAndMintTicket(eventId1, { value: insufficientValue }))
                 .to.be.revertedWith("TicketNFT: Pagamento esatto richiesto (prezzo + fee)");
        });

        it("Should REVERT if payment is excessive", async function () {
             const feeBps = await marketplace.serviceFeeBasisPoints();
             const expectedFee = calculateFee(eventPrice1, feeBps);
             const totalDue = BigInt(eventPrice1) + expectedFee;
             const excessiveValue = totalDue + 1n; // 1 Wei in più

             await expect(ticketNFT.connect(buyer).buyAndMintTicket(eventId1, { value: excessiveValue }))
                 .to.be.revertedWith("TicketNFT: Pagamento esatto richiesto (prezzo + fee)");
        });

        // Aggiungere test per il caso in cui il wallet servizio o creatore non possa ricevere ETH?
        // Questo è più complesso da testare, richiede contratti mock che rifiutano ETH.
        // Per ora lo omettiamo, ma teniamolo a mente.

    });

    // --- Test Suite: Owner Minting (mintTicket) ---
    describe("Owner Minting (mintTicket)", function () {

        // Registriamo l'evento prima, potrebbe essere necessario per mintTicket
        beforeEach(async function() {
            await ticketNFT.connect(owner).registerEvent(eventId1, creator.address, eventPrice1);
        });

        it("Should allow the owner to mint a ticket directly", async function () {
            const recipient = otherAccount.address;
            const mintPrice = ethers.parseEther("0.05"); // Prezzo per metadati, non per pagamento

            await expect(ticketNFT.connect(owner).mintTicket(recipient, eventId1, mintPrice))
                .to.emit(ticketNFT, "Transfer")
                .withArgs(zeroAddress, recipient, 0); // TokenId 0

            expect(await ticketNFT.ownerOf(0)).to.equal(recipient);
            const data = await ticketNFT.ticketData(0);
            expect(data.eventId).to.equal(eventId1);
            expect(data.originalPrice).to.equal(mintPrice); // Verifica che usi il prezzo passato
        });

        it("Should REVERT if a non-owner tries to mint directly", async function () {
            const recipient = otherAccount.address;
            const mintPrice = ethers.parseEther("0.05");
             await expect(ticketNFT.connect(otherAccount).mintTicket(recipient, eventId1, mintPrice))
               .to.be.revertedWithCustomError(ticketNFT, "OwnableUnauthorizedAccount")
               .withArgs(otherAccount.address);
        });

         it("Should REVERT if minting to the zero address", async function () {
             const mintPrice = ethers.parseEther("0.05");
             await expect(ticketNFT.connect(owner).mintTicket(zeroAddress, eventId1, mintPrice))
                .to.be.revertedWith("TicketNFT: Destinatario non valido"); // Messaggio aggiunto nella nostra implementazione
         });

         it("Should REVERT if minting with a zero price parameter", async function () {
              const recipient = otherAccount.address;
              await expect(ticketNFT.connect(owner).mintTicket(recipient, eventId1, 0))
                 .to.be.revertedWith("TicketNFT: Prezzo originale (parametro) deve essere positivo"); // Messaggio aggiunto
         });

         // Potremmo aggiungere un test per verificare il revert se l'evento non è registrato,
         // se attiviamo il require commentato in mintTicket. Per ora è opzionale.
    });

}); // Fine describe("TicketNFT Contract")