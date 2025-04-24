const ticketService = require('../services/ticketService');
// Importiamo marketplaceService perché ora contiene list e cancel
const marketplaceService = require('../services/marketplaceService');

/**
 * Controller per ottenere i biglietti posseduti dall'utente autenticato
 * o da un indirizzo wallet specifico fornito come query parameter.
 */
const getMyTickets = async (req, res, next) => { // Aggiunto 'next' per gestione errori migliore
    try {
        let addressToQuery;

        // Controlla se è stato fornito un indirizzo specifico nella query string
        // Esempio URL frontend: /api/tickets/my?wallet_address=0x.....
        if (req.query.wallet_address) {
            console.log(`>>> getMyTickets Controller: Ricevuto wallet_address da query: ${req.query.wallet_address}`);
            // Qui potremmo aggiungere validazione per verificare che sia un indirizzo valido
            // e potenzialmente verificare che l'utente loggato sia autorizzato a vedere
            // i dati di questo indirizzo (se implementassimo l'associazione user <-> external_wallet).
            // Per ora, usiamo l'indirizzo fornito se presente.
            addressToQuery = req.query.wallet_address;
        } else {
            // Se non c'è indirizzo nella query, usa l'indirizzo interno associato all'utente JWT
            console.log(`>>> getMyTickets Controller: Nessun wallet_address nella query, uso l'indirizzo interno dell'utente JWT.`);
            addressToQuery = req.user.walletAddress; // Indirizzo wallet INTERNO da authMiddleware
             if (!addressToQuery) {
                console.error(">>> getMyTickets Controller: Indirizzo wallet interno non trovato in req.user");
                return res.status(400).json({ error: 'Indirizzo wallet interno non trovato per l\'utente.' });
             }
        }

        console.log(`>>> getMyTickets Controller: Chiamo ticketService.findTicketsByOwner con indirizzo: ${addressToQuery}`);
        const tickets = await ticketService.findTicketsByOwner(addressToQuery);
        console.log(`>>> getMyTickets Controller: Trovati ${tickets.length} biglietti per l'indirizzo ${addressToQuery}`);

        res.status(200).json(tickets);

    } catch (error) {
        console.error(">>> ERRORE nel controller getMyTickets:", error);
        // Passiamo l'errore al middleware di gestione errori generale (se ne hai uno)
        // o restituiamo un errore generico
        // next(error); // Se hai un error handler middleware
         res.status(500).json({ error: error.message || 'Errore durante il recupero dei biglietti.' });
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