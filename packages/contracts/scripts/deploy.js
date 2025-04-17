// Importiamo 'hre' (Hardhat Runtime Environment) per accedere alle funzionalità di Hardhat
const hre = require("hardhat");

async function main() {
    // 1. Otteniamo l'account che farà il deploy (di solito il primo account fornito da Hardhat/nodo)
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Parametri per il costruttore di TicketNFT
    const nftName = "Blockchain Tickets"; // Scegli un nome per la tua collezione NFT
    const nftSymbol = "BCT";          // Scegli un simbolo

    // 2. Deploy del contratto TicketNFT
    console.log(`Deploying TicketNFT (${nftName}, ${nftSymbol})...`);
    const TicketNFT = await hre.ethers.getContractFactory("TicketNFT");
    // Passiamo nome, simbolo e l'indirizzo del deployer come initialOwner
    const ticketNFT = await TicketNFT.deploy(nftName, nftSymbol, deployer.address);

    // Attendiamo che il deploy sia finalizzato sulla blockchain
    // In ethers v6 si usa .waitForDeployment()
    await ticketNFT.waitForDeployment();
    const ticketNFTAddress = ticketNFT.target; // Otteniamo l'indirizzo del contratto deployato
    console.log("TicketNFT deployed to:", ticketNFTAddress);

    // 3. Deploy del contratto Marketplace
    console.log("Deploying Marketplace...");
    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    // Passiamo l'indirizzo del TicketNFT appena deployato al costruttore del Marketplace
    const marketplace = await Marketplace.deploy(ticketNFTAddress);

    // Attendiamo che il deploy sia finalizzato
    await marketplace.waitForDeployment();
    const marketplaceAddress = marketplace.target; // Otteniamo l'indirizzo
    console.log("Marketplace deployed to:", marketplaceAddress);

    console.log("\nDeployment complete!");
    console.log("----------------------------------------------------");
    console.log("TicketNFT Address:", ticketNFTAddress);
    console.log("Marketplace Address:", marketplaceAddress);
    console.log("Deployer Address:", deployer.address);
    console.log("----------------------------------------------------");
}

// Pattern standard per eseguire la funzione main e gestire gli errori
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});