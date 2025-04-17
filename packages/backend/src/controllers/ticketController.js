const ticketService = require('../services/ticketService');
// Importiamo marketplaceService perché ora contiene list e cancel
const marketplaceService = require('../services/marketplaceService');

/**
 * Controller per ottenere i biglietti posseduti dall'utente autenticato.
 */
const getMyTickets = async (req, res) => {
    try {
        const userId = req.user.userId;
        const userWalletAddress = req.user.walletAddress;
        if (!userWalletAddress) return res.status(400).json({ error: 'Indirizzo wallet non trovato.' });
        // Usiamo ticketService per trovare i biglietti
        const tickets = await ticketService.findTicketsByOwner(userWalletAddress);
        res.status(200).json(tickets);
    } catch (error) {
        console.error("Errore in getMyTickets controller:", error);
        res.status(500).json({ error: error.message || 'Errore recupero biglietti.' });
    }
};

/**
 * Controller per mettere in vendita un biglietto specifico posseduto dall'utente.
 */
const listTicketForSale = async (req, res) => {
    console.log(">>> listTicketForSale Controller INIZIO");
    try {
        const tokenId = parseInt(req.params.tokenId, 10);
        const { price } = req.body;
        const userId = req.user.userId;
        console.log(`>>> listTicketForSale Controller: Dati ricevuti - userId: ${userId}, tokenId: ${tokenId}, price: ${price}`);
        if (isNaN(tokenId)) return res.status(400).json({ error: 'Token ID non valido.' });
        if (!price || typeof price !== 'string') return res.status(400).json({ error: 'Il prezzo (come stringa) è obbligatorio.' });

        console.log(`>>> listTicketForSale Controller: Chiamo marketplaceService.listItemForSale...`);
        // Usiamo marketplaceService per listare
        const result = await marketplaceService.listItemForSale(userId, tokenId, price);
        console.log(`>>> listTicketForSale Controller: Chiamata a service completata.`);
        res.status(200).json({ message: 'Biglietto messo in vendita con successo!', transactions: result });
    } catch (error) {
        console.error(">>> ERRORE nel blocco catch di listTicketForSale controller:", error);
        if (error.message.includes('proprietario') || error.message.includes('non valido') || error.message.includes('prezzo') || error.message.includes('esauriti')) {
             res.status(400).json({ error: error.message });
        } else if (error.message.includes('Utente con ID') || error.message.includes('credenziali')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Fondi insufficienti')) {
            res.status(400).json({ error: error.message }); // 400 o 402
        } else {
            res.status(500).json({ error: error.message || 'Errore interno messa in vendita.' });
        }
    }
};

// === NUOVA FUNZIONE PER ANNULLARE LISTING ===
/**
 * Controller per annullare la messa in vendita di un biglietto specifico.
 */
const cancelTicketListing = async (req, res) => {
    console.log(">>> cancelTicketListing Controller INIZIO");
    try {
        const tokenId = parseInt(req.params.tokenId, 10); // ID Token dall'URL
        const userId = req.user.userId; // ID utente dal JWT

        console.log(`>>> cancelTicketListing Controller: Dati ricevuti - userId: ${userId}, tokenId: ${tokenId}`);
        if (isNaN(tokenId)) {
            console.log(">>> cancelTicketListing Controller: Errore - Token ID non valido");
            return res.status(400).json({ error: 'Token ID non valido.' });
        }

        console.log(`>>> cancelTicketListing Controller: Chiamo marketplaceService.cancelListingForUser...`);
        // Usiamo marketplaceService per annullare
        const result = await marketplaceService.cancelListingForUser(userId, tokenId);
        console.log(`>>> cancelTicketListing Controller: Chiamata a service completata.`);

        res.status(200).json({ message: 'Offerta annullata con successo!', transaction: result });

    } catch (error) {
        console.error(">>> ERRORE nel blocco catch di cancelTicketListing controller:", error);
        // Restituiamo l'errore specifico lanciato dal service
        if (error.message.includes('non attiva') || error.message.includes('non è tua') || error.message.includes('non valido')) {
            res.status(400).json({ error: error.message }); // Bad Request / Forbidden implicito
        } else if (error.message.includes('Utente con ID') || error.message.includes('credenziali')) {
            res.status(404).json({ error: error.message }); // Not Found / Unauthorized
        } else if (error.message.includes('Fondi insufficienti')) {
             res.status(400).json({ error: error.message }); // 400 o 402
        } else {
            res.status(500).json({ error: error.message || 'Errore interno durante l\'annullamento.' });
        }
    }
};


module.exports = {
    getMyTickets,
    listTicketForSale,
    cancelTicketListing // <-- Esporta la nuova funzione
};