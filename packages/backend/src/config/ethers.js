

// Importiamo la libreria ethers
const { ethers } = require('ethers');

// Importiamo le ABI dai file JSON che abbiamo copiato
// Usiamo require e accediamo alla proprietà 'abi'
const ticketNFTAbi = require('../contracts/abi/TicketNFT.json').abi;
const marketplaceAbi = require('../contracts/abi/Marketplace.json').abi;

// Leggiamo le configurazioni necessarie da process.env (caricate da .env)
const rpcUrl = process.env.AMOY_RPC_URL;
const ticketNFTAddress = process.env.TICKET_NFT_ADDRESS;
const marketplaceAddress = process.env.MARKETPLACE_ADDRESS;

// Controllo di sicurezza: assicuriamoci che le variabili siano state caricate
if (!rpcUrl || !ticketNFTAddress || !marketplaceAddress) {
    console.error("ERRORE CRITICO: Variabili d'ambiente blockchain (AMOY_RPC_URL, TICKET_NFT_ADDRESS, MARKETPLACE_ADDRESS) non trovate nel file .env!");
    console.log("RPC URL:", rpcUrl ? "OK" : "MANCANTE");
    console.log("TicketNFT Addr:", ticketNFTAddress ? "OK" : "MANCANTE");
    console.log("Marketplace Addr:", marketplaceAddress ? "OK" : "MANCANTE");
    // In un'applicazione reale potremmo voler uscire o lanciare un errore
    // process.exit(1);
}

// Creiamo il Provider JSON RPC per connetterci alla rete Amoy
// Questo oggetto permette operazioni di lettura dalla blockchain
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Creiamo le istanze dei contratti, collegandole al provider e usando le ABI
// Queste istanze ci permetteranno di chiamare le funzioni dei contratti deployati
const ticketNFTContract = new ethers.Contract(ticketNFTAddress, ticketNFTAbi, provider);
const marketplaceContract = new ethers.Contract(marketplaceAddress, marketplaceAbi, provider);

console.log("Provider Ethers e istanze contratti inizializzate."); // Messaggio di conferma

// Esportiamo il provider e le istanze dei contratti per poterli usare nel resto del backend
module.exports = {
    provider,
    ticketNFTContract,
    marketplaceContract
};