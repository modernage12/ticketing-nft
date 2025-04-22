// packages/backend/src/config/ethers.js <--- ASSICURATI CHE SIA QUESTO FILE

// Importiamo la libreria ethers
const { ethers } = require('ethers');

// Importiamo le ABI dai file JSON
// ASSICURATI CHE QUESTI PERCORSI SIANO CORRETTI E I FILE JSON CONTENGANO L'ABI NELLA PROPRIETA' 'abi'
const ticketNFTAbi = require('../contracts/abi/TicketNFT.json').abi;
const marketplaceAbi = require('../contracts/abi/Marketplace.json').abi;

// Leggiamo le configurazioni necessarie da process.env (caricate da .env)
const rpcUrl = process.env.AMOY_RPC_URL;
const ticketNFTAddress = process.env.TICKET_NFT_ADDRESS;
const marketplaceAddress = process.env.MARKETPLACE_ADDRESS;
// --- LEGGI LA CHIAVE PRIVATA DELL'OWNER/MINTER ---
const ownerPrivateKey = process.env.PRIVATE_KEY;

// Controllo di sicurezza esteso
let hasError = false;
if (!rpcUrl) {
    console.error("ERRORE CRITICO: AMOY_RPC_URL non trovato nel file .env!"); hasError = true;
}
if (!ticketNFTAddress) {
    console.error("ERRORE CRITICO: TICKET_NFT_ADDRESS non trovato nel file .env!"); hasError = true;
}
if (!marketplaceAddress) {
    console.error("ERRORE CRITICO: MARKETPLACE_ADDRESS non trovato nel file .env!"); hasError = true;
}
// --- CONTROLLO CHIAVE PRIVATA ---
if (!ownerPrivateKey) {
    console.error("ERRORE CRITICO: PRIVATE_KEY (owner/minter wallet) non trovata nel file .env!"); hasError = true;
}

if (hasError) {
    console.log("Verifica il tuo file .env e riavvia il backend.");
    // process.exit(1); // Potremmo uscire qui se preferisci
}

// Creiamo il Provider JSON RPC
const provider = new ethers.JsonRpcProvider(rpcUrl);

// --- CREA IL WALLET/SIGNER DELL'OWNER ---
let minterWallet = null; // USA 'let' QUI
if (ownerPrivateKey && !hasError) { // Aggiunto !hasError per sicurezza
    try {
        const keyWithPrefix = ownerPrivateKey.startsWith('0x') ? ownerPrivateKey : `0x${ownerPrivateKey}`;
        minterWallet = new ethers.Wallet(keyWithPrefix, provider); // Assegnazione a 'let'
        console.log(`Wallet Owner/Minter inizializzato per l'indirizzo: ${minterWallet.address}`);
    } catch (walletError) {
        console.error("ERRORE CRITICO durante creazione minterWallet:", walletError.message);
        process.exit(1); // Usciamo se non possiamo creare il wallet
    }
} else if (!hasError) { // Se le altre var c'erano ma la chiave no
     console.warn("ATTENZIONE: MINTER WALLET NON INIZIALIZZATO per mancanza PRIVATE_KEY. Le funzioni on-chain falliranno.");
}
// --- FINE CREAZIONE WALLET ---

// Creiamo le istanze dei contratti collegate al PROVIDER
const ticketNFTContract = new ethers.Contract(ticketNFTAddress, ticketNFTAbi, provider);
const marketplaceContract = new ethers.Contract(marketplaceAddress, marketplaceAbi, provider);

console.log("Provider Ethers e istanze contratti base inizializzate.");

// Esportiamo tutto il necessario
module.exports = {
    provider,
    ticketNFTContract,
    marketplaceContract,
    minterWallet // <-- ESPORTA IL WALLET CREATO (o null se la chiave manca)
};