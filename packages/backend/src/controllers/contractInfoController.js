// Importiamo le istanze dei contratti che abbiamo configurato in ethers.js
// Useremo marketplaceContract per chiamare la funzione owner()
const { marketplaceContract } = require('../config/ethers');

// Funzione per ottenere gli indirizzi dei contratti (letti da .env)
const getContractAddresses = (req, res) => {
    try {
        const addresses = {
            ticketNFT: process.env.TICKET_NFT_ADDRESS,
            marketplace: process.env.MARKETPLACE_ADDRESS
        };
        if (!addresses.ticketNFT || !addresses.marketplace) {
            throw new Error("Indirizzi contratti non trovati nelle variabili d'ambiente.");
        }
        res.status(200).json(addresses);
    } catch (error) {
        console.error("Errore in getContractAddresses:", error.message);
        res.status(500).json({ error: error.message || "Errore nel recuperare gli indirizzi dei contratti." });
    }
};

// Funzione per ottenere l'owner del marketplace dalla blockchain
const getMarketplaceOwner = async (req, res) => {
    try {
        // Chiamiamo la funzione 'owner()' ereditata da Ownable nel contratto Marketplace
        const ownerAddress = await marketplaceContract.owner();
        res.status(200).json({ owner: ownerAddress });
    } catch (error) {
        console.error("Errore nel chiamare marketplaceContract.owner():", error);
        // Includiamo dettagli dell'errore per il debugging
        res.status(500).json({
            error: "Errore nel recuperare l'owner del marketplace.",
            details: error.message
        });
    }
};

// Esportiamo le funzioni del controller
module.exports = {
    getContractAddresses,
    getMarketplaceOwner
};