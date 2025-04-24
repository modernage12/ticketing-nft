// 1. Carica le variabili d'ambiente dal file .env
require('dotenv').config();

// 2. Importa i plugin necessari (se non già presenti/caricati da Hardhat)
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers"); // Lo lasciamo per quando rieseguiremo i test
require("@nomicfoundation/hardhat-verify");

// Recupera la chiave privata dal file .env
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  console.error("ERRORE: La variabile d'ambiente PRIVATE_KEY non è impostata nel file .env");
  // process.exit(1); // Potremmo uscire, ma Hardhat darà errore comunque se manca
}

// Recupera l'URL RPC dal file .env o mettilo direttamente (sconsigliato per la chiave API)
// Assumiamo che tu metta l'URL direttamente qui per ora, ma potresti metterlo anche in .env
const amoyRpcUrl = 'https://polygon-amoy.infura.io/v3/a469b0050dab41afa936dcd6a512f810'; // <--- !!! SOSTITUISCI CON IL TUO VERO URL RPC PER AMOY !!!

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // Specifica la versione del compilatore Solidity
  solidity: "0.8.28", // Usiamo questa versione che Hardhat ha già scaricato

  // Definisce le reti a cui ci si può connettere
  networks: {
    // Configurazione per la rete locale di Hardhat (usata di default se non si specifica --network)
    hardhat: {
      // chainId: 1337 // Opzionale
    },

    // Configurazione per la rete di test Polygon Amoy
    amoy: {
      url: amoyRpcUrl, // Usa la variabile definita sopra
      // Usa la chiave privata caricata da .env (racchiusa in un array)
      // Aggiungiamo '0x' perché la chiave di solito è senza
      accounts: privateKey ? [`0x${privateKey}`] : [], // Usa la chiave solo se è stata caricata correttamente
      chainId: 80002, // Hardhat di solito lo ricava dall'URL RPC
	  gasPrice: 30000000000,
    }
  },

  etherscan: { // <--- AGGIUNGI/MODIFICA QUESTA SEZIONE
    apiKey: {
       polygonAmoy: process.env.POLYGONSCAN_API_KEY || 'YOUR_POLYGONSCAN_API_KEY' // Usa una chiave API da Polygonscan
     },
     customChains: [ // Necessario per reti testnet come Amoy
        {
          network: "polygonAmoy",
          chainId: 80002, // Verifica il Chain ID corretto per Amoy se diverso
          urls: {
            apiURL: "https://api-amoy.polygonscan.com/api",
            browserURL: "https://amoy.polygonscan.com/"
          }
        }
      ]
  },

  // Potremmo aggiungere altre configurazioni qui (es. etherscan, gas reporter) in futuro
};