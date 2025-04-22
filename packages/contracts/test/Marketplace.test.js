// packages/contracts/test/Marketplace.test.js

// Import necessari
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Describe block principale per il contratto Marketplace
describe("Marketplace Contract", function () {

    // --- Variabili Globali per i Test ---
    // Contratti e indirizzi
    let TicketNFT, ticketNFT, ticketNFTAddress;
    let Marketplace, marketplace, marketplaceAddress;
    // Firmatari (Account)
    let owner, seller, buyer, serviceWalletAccount, otherAccount;
    // Costanti e Valori di Test
    const initialFeeBasisPoints = 250; // 2.5%
    const zeroAddress = ethers.ZeroAddress;
    let originalPrice = ethers.parseEther("0.1"); // 0.1 MATIC/ETH (prezzo originale esempio)
    let listingPrice = ethers.parseEther("0.09"); // Prezzo di listing (<= originale)
    let tokenIdToTest; // ID del token mintato per i test

    // Funzione helper per calcolare la commissione
    function calculateFee(price, feeBasisPoints) {
        return (BigInt(price) * BigInt(feeBasisPoints)) / 10000n;
    }

    // --- Blocco beforeEach: Setup eseguito prima di ogni test 'it(...)' ---
    beforeEach(async function () {
        console.log("--- Starting beforeEach ---");

        // 1. Ottieni Firmatari
        [owner, seller, buyer, serviceWalletAccount, otherAccount] = await ethers.getSigners();
        console.log("Signers obtained:", { owner: owner.address, seller: seller.address, buyer: buyer.address, serviceWallet: serviceWalletAccount.address });

        // 2. Deploy Contratto TicketNFT (Questo ha funzionato nel test minimale)
        const TicketNFTFactory = await ethers.getContractFactory("TicketNFT");
        const nftName = "TestTicketNFT_Full"; // Nome leggermente diverso per chiarezza
        const nftSymbol = "TTNFTF";
        console.log(`Deploying TicketNFT ('${nftName}', '${nftSymbol}', '${owner.address}')...`);
        try {
            ticketNFT = await TicketNFTFactory.connect(owner).deploy(nftName, nftSymbol, owner.address);
            await ticketNFT.waitForDeployment();
            ticketNFTAddress = await ticketNFT.getAddress();
            console.log("TicketNFT deployed successfully at:", ticketNFTAddress);
        } catch (error) {
            console.error("!!! FATAL: Deployment failed for TicketNFT in beforeEach:", error);
            throw error; // Blocca tutto se questo fallisce ancora
        }

        // 3. Deploy Contratto Marketplace
        const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
        console.log(`Deploying Marketplace (TicketNFT: ${ticketNFTAddress}, Fee: ${initialFeeBasisPoints}bps, Wallet: ${serviceWalletAccount.address})...`);
        try {
            marketplace = await MarketplaceFactory.connect(owner).deploy(
                ticketNFTAddress,
                initialFeeBasisPoints,
                serviceWalletAccount.address
            );
            await marketplace.waitForDeployment();
            marketplaceAddress = await marketplace.getAddress();
            console.log("Marketplace deployed successfully at:", marketplaceAddress);
        } catch (error) {
            console.error("!!! FATAL: Deployment failed for Marketplace in beforeEach:", error);
            throw error; // Blocca tutto se questo fallisce
        }

        // 4. Mint un NFT di Test (al seller)
        const eventId = 1;
        console.log(`Minting test NFT (Event: ${eventId}, Price: ${ethers.formatEther(originalPrice)} ETH) to seller ${seller.address}...`);
        let mintTx;
        try {
            // Assicurati che 'owner' possa mintare (come da contratto TicketNFT)
            mintTx = await ticketNFT.connect(owner).mintTicket(seller.address, eventId, originalPrice);
            const receipt = await mintTx.wait();
            // Trova l'evento Transfer per ottenere il tokenId in modo robusto
            const transferEvent = receipt.logs.find(log => log.eventName === 'Transfer' && log.address === ticketNFTAddress);
            if (!transferEvent) {
                throw new Error("Minting successful but Transfer event not found!");
            }
            tokenIdToTest = transferEvent.args.tokenId;
            console.log(`NFT minted successfully. Token ID: ${tokenIdToTest.toString()}`);
        } catch (error) {
             console.error("!!! FATAL: Failed to mint test NFT in beforeEach:", error);
             throw error; // Blocca tutto se questo fallisce
        }

        // 5. Approva il Marketplace da parte del Seller per l'NFT mintato
        console.log(`Seller (${seller.address}) approving Marketplace (${marketplaceAddress}) for Token ID ${tokenIdToTest.toString()}...`);
        try {
            const approveTx = await ticketNFT.connect(seller).approve(marketplaceAddress, tokenIdToTest);
            await approveTx.wait();
            // Verifica l'approvazione (opzionale ma utile)
            const approvedAddress = await ticketNFT.getApproved(tokenIdToTest);
            if (approvedAddress !== marketplaceAddress) {
                 throw new Error(`Approval check failed: expected ${marketplaceAddress}, got ${approvedAddress}`);
            }
            console.log("Marketplace approved successfully by seller.");
        } catch(error) {
             console.error("!!! FATAL: Failed to approve Marketplace in beforeEach:", error);
             throw error; // Blocca tutto se questo fallisce
        }

        console.log("--- Finished beforeEach Successfully ---");
    });

    // --- Test Suite: Deployment ---
    describe("Deployment", function () {
        it("Should set the right owner for Marketplace", async function () {
             expect(await marketplace.owner()).to.equal(owner.address);
        });

        it("Should set the right TicketNFT contract address", async function () {
             expect(await marketplace.ticketNFTContract()).to.equal(ticketNFTAddress);
        });

        it("Should set the right initial service fee basis points", async function () {
             expect(await marketplace.serviceFeeBasisPoints()).to.equal(initialFeeBasisPoints);
        });

        it("Should set the right initial service wallet", async function () {
             expect(await marketplace.serviceWallet()).to.equal(serviceWalletAccount.address);
        });
        // Aggiungi qui altri test sul deployment se necessario
    });

    // --- Test Suite: Listing Items (listItem) ---
    describe("Listing Items", function () {
        it("Should allow the owner of an NFT to list it with valid price and approval", async function () {
            await expect(marketplace.connect(seller).listItem(tokenIdToTest, listingPrice))
                .to.emit(marketplace, "ItemListed")
                .withArgs(tokenIdToTest, seller.address, listingPrice);

            const listing = await marketplace.listings(tokenIdToTest);
            expect(listing.seller).to.equal(seller.address);
            expect(listing.price).to.equal(listingPrice);
            expect(listing.active).to.be.true;
        });

        // Aggiungi qui gli altri test di fallimento per listItem che avevamo già scritto:
        // - Caller non è owner
        // - Prezzo zero
        // - Prezzo > originale
        // - Non approvato
        // - Già listato
         it("Should REVERT if the caller is not the owner of the NFT", async function () {
            await expect(marketplace.connect(otherAccount).listItem(tokenIdToTest, listingPrice))
                .to.be.revertedWith("Marketplace: Non sei il proprietario");
        });

        it("Should REVERT if the price is zero", async function () {
            await expect(marketplace.connect(seller).listItem(tokenIdToTest, 0))
                .to.be.revertedWith("Marketplace: Il prezzo deve essere positivo");
        });

         it("Should REVERT if the price exceeds the original price (Price Cap)", async function () {
            const excessivePrice = ethers.parseEther("0.11"); // > 0.1 originale
            await expect(marketplace.connect(seller).listItem(tokenIdToTest, excessivePrice))
                .to.be.revertedWith("Marketplace: Il prezzo supera l'originale");
         });

         it("Should REVERT if the Marketplace contract is not approved for a different token", async function () {
            // Mintiamo un *nuovo* token per cui non daremo l'approvazione
            const eventId2 = 2;
            const originalPrice2 = ethers.parseEther("0.2");
            const mintTx2 = await ticketNFT.connect(owner).mintTicket(seller.address, eventId2, originalPrice2);
            const receipt2 = await mintTx2.wait();
            const transferEvent2 = receipt2.logs.find(log => log.eventName === 'Transfer' && log.address === ticketNFTAddress);
             if (!transferEvent2) throw new Error("Transfer event for second token not found");
            const tokenIdNotApproved = transferEvent2.args.tokenId;

            await expect(marketplace.connect(seller).listItem(tokenIdNotApproved, originalPrice2))
               .to.be.revertedWith("Marketplace: Contratto non approvato");
         });

         it("Should REVERT if the item is already listed", async function () {
             await marketplace.connect(seller).listItem(tokenIdToTest, listingPrice); // Lista la prima volta
             await expect(marketplace.connect(seller).listItem(tokenIdToTest, listingPrice)) // Prova a listare di nuovo
                .to.be.revertedWith("Marketplace: NFT gia' listato");
         });
    });

    // --- Test Suite: Buying Items (buyItem) ---
    describe("Buying Items", function () {
        // Prima di ogni test di acquisto, lista l'item
        beforeEach(async function() {
            await marketplace.connect(seller).listItem(tokenIdToTest, listingPrice);
        });

        it("Should allow a user to buy a listed item with the exact price + fee", async function () {
            const expectedFee = calculateFee(listingPrice, initialFeeBasisPoints);
            const totalDue = BigInt(listingPrice) + expectedFee;

            const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
            const serviceWalletBalanceBefore = await ethers.provider.getBalance(serviceWalletAccount.address);
            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

            // Esegui acquisto
            const tx = await marketplace.connect(buyer).buyItem(tokenIdToTest, { value: totalDue });
            const receipt = await tx.wait(); // Aspetta conferma e ottieni gas cost
            const gasUsed = receipt.gasUsed;
            const gasPrice = tx.gasPrice; // Prezzo gas della transazione
            const txCost = gasUsed * gasPrice;

            // Verifica Evento
            await expect(tx)
                .to.emit(marketplace, "ItemSold")
                .withArgs(tokenIdToTest, seller.address, buyer.address, listingPrice, expectedFee);

            // Verifica cambio proprietà NFT
            expect(await ticketNFT.ownerOf(tokenIdToTest)).to.equal(buyer.address);

            // Verifica stato listing
            const listing = await marketplace.listings(tokenIdToTest);
            expect(listing.active).to.be.false;

            // Verifica bilanci (dopo)
            const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
            const serviceWalletBalanceAfter = await ethers.provider.getBalance(serviceWalletAccount.address);
            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);

            expect(sellerBalanceAfter).to.equal(sellerBalanceBefore + BigInt(listingPrice));
            expect(serviceWalletBalanceAfter).to.equal(serviceWalletBalanceBefore + expectedFee);
            // Verifica bilancio buyer (diminuito del totale + costo gas)
            expect(buyerBalanceAfter).to.equal(buyerBalanceBefore - totalDue - txCost);
        });

        // Aggiungi qui gli altri test di fallimento per buyItem:
        // - Item non listato
        // - Buyer è Seller
        // - Valore inviato < totale dovuto
        // - Valore inviato > totale dovuto
        it("Should REVERT if the item is not listed (or already sold)", async function() {
             const expectedFee = calculateFee(listingPrice, initialFeeBasisPoints);
             const totalDue = BigInt(listingPrice) + expectedFee;
             // Vendi l'item una volta
             await marketplace.connect(buyer).buyItem(tokenIdToTest, { value: totalDue });
             // Prova a comprarlo di nuovo
             await expect(marketplace.connect(otherAccount).buyItem(tokenIdToTest, { value: totalDue }))
                 .to.be.revertedWith("Marketplace: NFT non listato o venduto");
        });

         it("Should REVERT if the buyer is the seller", async function() {
             const expectedFee = calculateFee(listingPrice, initialFeeBasisPoints);
             const totalDue = BigInt(listingPrice) + expectedFee;
             await expect(marketplace.connect(seller).buyItem(tokenIdToTest, { value: totalDue }))
                 .to.be.revertedWith("Marketplace: Non puoi comprare il tuo NFT");
         });

         it("Should REVERT if the sent value is less than price + fee", async function() {
             const expectedFee = calculateFee(listingPrice, initialFeeBasisPoints);
             const totalDue = BigInt(listingPrice) + expectedFee;
             const insufficientValue = totalDue - 1n; // Manca 1 Wei
             await expect(marketplace.connect(buyer).buyItem(tokenIdToTest, { value: insufficientValue }))
                 .to.be.revertedWith("Marketplace: Pagamento esatto richiesto");
         });

         it("Should REVERT if the sent value is more than price + fee", async function() {
             const expectedFee = calculateFee(listingPrice, initialFeeBasisPoints);
             const totalDue = BigInt(listingPrice) + expectedFee;
             const excessiveValue = totalDue + 1n; // 1 Wei di troppo
             await expect(marketplace.connect(buyer).buyItem(tokenIdToTest, { value: excessiveValue }))
                 .to.be.revertedWith("Marketplace: Pagamento esatto richiesto");
         });
    });

    // --- Test Suite: Canceling Listings (cancelListing) ---
    describe("Canceling Listings", function () {
         // Prima di ogni test di cancellazione, lista l'item
        beforeEach(async function() {
            await marketplace.connect(seller).listItem(tokenIdToTest, listingPrice);
        });

        it("Should allow the seller to cancel an active listing", async function() {
            await expect(marketplace.connect(seller).cancelListing(tokenIdToTest))
                .to.emit(marketplace, "ListingCancelled")
                .withArgs(tokenIdToTest, seller.address);

            const listing = await marketplace.listings(tokenIdToTest);
            expect(listing.active).to.be.false;
        });

        // Aggiungi qui gli altri test di fallimento per cancelListing:
        // - Caller non è seller
        // - Listing non attiva (già cancellata o venduta)
        it("Should REVERT if the caller is not the seller", async function() {
            await expect(marketplace.connect(otherAccount).cancelListing(tokenIdToTest))
                .to.be.revertedWith("Marketplace: Non sei il venditore");
        });

        it("Should REVERT if the listing is not active (already cancelled)", async function() {
            await marketplace.connect(seller).cancelListing(tokenIdToTest); // Cancella
            await expect(marketplace.connect(seller).cancelListing(tokenIdToTest)) // Prova di nuovo
                .to.be.revertedWith("Marketplace: NFT non listato o venduto");
        });

        it("Should REVERT if the listing is not active (already sold)", async function() {
            const fee = calculateFee(listingPrice, initialFeeBasisPoints);
            await marketplace.connect(buyer).buyItem(tokenIdToTest, {value: BigInt(listingPrice) + fee}); // Vendi
            await expect(marketplace.connect(seller).cancelListing(tokenIdToTest)) // Prova a cancellare
                .to.be.revertedWith("Marketplace: NFT non listato o venduto");
        });
    });

    // --- Test Suite: Owner Functions ---
    describe("Owner Functions", function () {
        const newFee = 500; // 5.0%
        const invalidFee = 10001; // > 100%
        let newWallet;

        beforeEach(function() {
            // Usiamo otherAccount come possibile nuovo wallet
            newWallet = otherAccount;
        });

        describe("setServiceFeeBasisPoints", function () {
            it("Should allow the owner to set a new valid fee", async function() {
                await expect(marketplace.connect(owner).setServiceFeeBasisPoints(newFee))
                    .to.emit(marketplace, "ServiceFeeUpdated")
                    .withArgs(newFee);
                expect(await marketplace.serviceFeeBasisPoints()).to.equal(newFee);
            });

            it("Should REVERT if the caller is not the owner", async function() {
                 await expect(marketplace.connect(otherAccount).setServiceFeeBasisPoints(newFee))
                    .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
                    .withArgs(otherAccount.address);
            });

            it("Should REVERT if the new fee is invalid (> 10000)", async function() {
                 await expect(marketplace.connect(owner).setServiceFeeBasisPoints(invalidFee))
                    .to.be.revertedWith("Marketplace: Fee non valida (0-10000)");
            });
        });

        describe("setServiceWallet", function () {
            it("Should allow the owner to set a new valid service wallet", async function() {
                await expect(marketplace.connect(owner).setServiceWallet(newWallet.address))
                    .to.emit(marketplace, "ServiceWalletUpdated")
                    .withArgs(newWallet.address);
                expect(await marketplace.serviceWallet()).to.equal(newWallet.address);
            });

             it("Should REVERT if the caller is not the owner", async function() {
                await expect(marketplace.connect(otherAccount).setServiceWallet(newWallet.address))
                   .to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount")
                   .withArgs(otherAccount.address);
            });

            it("Should REVERT if the new wallet is the zero address", async function() {
                await expect(marketplace.connect(owner).setServiceWallet(zeroAddress))
                   .to.be.revertedWith("Marketplace: Indirizzo zero non valido");
            });
        });
    });

}); // Fine describe("Marketplace Contract")