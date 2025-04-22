// packages/contracts/scripts/deploy.js - VERSIONE CORRETTA POST-MODIFICA TicketNFT.sol

const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // --- PARAMETRI DA CONFIGURARE ---
    const nftName = "Blockchain Tickets"; // Nome NFT
    const nftSymbol = "BCT";           // Simbolo NFT
    // Per il costruttore del Marketplace:
    const initialFeeBps = 250; // Esempio: 2.5% (250 basis points) - IMPOSTA IL VALORE DESIDERATO
    const initialServiceWallet = deployer.address; // Esempio: usa l'indirizzo del deployer come wallet servizio iniziale - IMPOSTA L'INDIRIZZO DESIDERATO
    // --- FINE PARAMETRI ---


    // 1. Deploy del contratto TicketNFT PRIMA
    //    Passiamo un indirizzo VALIDO ma temporaneo per marketplaceAddress,
    //    useremo l'indirizzo del deployer stesso, sapendo che lo cambieremo subito dopo.
    //    Questo soddisfa il require nel costruttore di TicketNFT.
    console.log(`Deploying TicketNFT (${nftName}, ${nftSymbol})...`);
    const TicketNFT = await hre.ethers.getContractFactory("TicketNFT");
    const ticketNFT = await TicketNFT.deploy(
        nftName,
        nftSymbol,
        deployer.address,    // initialOwner
        deployer.address     // _marketplaceAddress TEMPORANEO (verrà aggiornato)
    );
    await ticketNFT.waitForDeployment();
    const ticketNFTAddress = ticketNFT.target;
    console.log("TicketNFT deployed to:", ticketNFTAddress);


    // 2. Deploy del contratto Marketplace DOPO
    //    Ora possiamo passare l'indirizzo TicketNFT reale al suo costruttore.
    console.log("Deploying Marketplace...");
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy(
        ticketNFTAddress,          // _ticketNFTAddress (l'indirizzo appena deployato)
        initialFeeBps,             // _initialFeeBasisPoints
        initialServiceWallet       // _initialServiceWallet
    );
    await marketplace.waitForDeployment();
    const marketplaceAddress = marketplace.target;
    console.log("Marketplace deployed to:", marketplaceAddress);


    // 3. CHIAMA LA NUOVA FUNZIONE SETTER su TicketNFT per impostare l'indirizzo Marketplace CORRETTO
    console.log(`Setting correct Marketplace address (${marketplaceAddress}) in TicketNFT contract...`);
    // Chiama la funzione setMarketplaceAddress usando l'account deployer (che è l'owner)
    const setTx = await ticketNFT.connect(deployer).setMarketplaceAddress(marketplaceAddress);
    // Aspetta che la transazione venga minata
    await setTx.wait(1); // Aspetta 1 conferma
    console.log("Marketplace address set successfully in TicketNFT.");


    console.log("\n--- Deployment Completo ---");
    console.log("   Deployer Address:  ", deployer.address);
    console.log("   Marketplace Address:", marketplaceAddress);
    console.log("   TicketNFT Address:  ", ticketNFTAddress);
    console.log("----------------------------------------------------");
    console.log("!!! RICORDA DI AGGIORNARE GLI INDIRIZZI E L'ABI NEL BACKEND !!!");
    console.log("----------------------------------------------------");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});