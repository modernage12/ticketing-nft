// Usiamo marketplaceService per entrambe le funzioni
const marketplaceService = require('../services/marketplaceService');
const db = require('../config/db');

/**
 * Controller per ottenere tutte le listing attive.
 */
const getListings = async (req, res) => {
    try {
        const listings = await marketplaceService.getActiveListings();
        res.status(200).json(listings);
    } catch (error) {
        console.error("Errore in getListings controller:", error);
        res.status(500).json({ error: error.message || 'Errore nel recuperare le offerte.' });
    }
};

/**
 * Controller per acquistare un biglietto listato.
 */
const buyListedTicket = async (req, res) => {
    // <-- LOG Controller INIZIO -->
    console.log(">>> buyListedTicket Controller INIZIO");
    try {
        const tokenId = parseInt(req.params.tokenId, 10); // ID Token dall'URL
        const buyerUserId = req.user.userId; // ID Utente acquirente (dal middleware protect)

        // <-- LOG Controller Dati -->
        console.log(`>>> buyListedTicket Controller: Dati ricevuti - buyerUserId: ${buyerUserId}, tokenId: ${tokenId}`);

        if (isNaN(tokenId)) {
            console.log(">>> buyListedTicket Controller: Errore - Token ID non valido");
            return res.status(400).json({ error: 'Token ID non valido.' });
        }

        // <-- LOG Controller Chiama Service -->
        console.log(`>>> buyListedTicket Controller: Chiamo marketplaceService.buyListedItem...`);
        const result = await marketplaceService.buyListedItem(buyerUserId, tokenId);
        // <-- LOG Controller Service OK -->
        console.log(`>>> buyListedTicket Controller: Chiamata a service completata con successo.`);

        res.status(200).json({ message: 'Acquisto completato con successo!', transaction: result });

    } catch (error) {
         // <-- LOG Controller ERRORE -->
         console.error(">>> ERRORE nel blocco catch di buyListedTicket controller:", error);
         // Rispondiamo con l'errore specifico lanciato dal service
         // O potremmo mappare certi errori a status code specifici
        if (error.message.includes('non trovato') || error.message.includes('non in vendita')) {
             res.status(404).json({ error: error.message }); // Not Found
        } else if (error.message.includes('stesso biglietto') || error.message.includes('non valido')) {
            res.status(400).json({ error: error.message }); // Bad Request
        } else if (error.message.includes('credenziali')) {
             res.status(403).json({ error: error.message }); // Forbidden (anche se improbabile qui)
        } else if (error.message.includes('Fondi insufficienti')) {
            res.status(402).json({ error: error.message }); // Payment Required (kinda)
        }
        else {
             res.status(500).json({ error: error.message || 'Errore interno durante l\'acquisto.' });
        }
    }
};

const cancelListing = async (req, res) => {
    try {
        // MODIFICA: Prendi tokenId dall'URL invece che dal body
        const tokenId = parseInt(req.params.tokenId, 10);
        const userId = req.user.userId;

        // MODIFICA: Chiama la funzione corretta del service
        const result = await marketplaceService.cancelListingForUser(userId, tokenId); // <-- Nome corretto
        
        res.status(200).json({ 
            success: true,
            cancelTxHash: result.cancelTxHash 
        });

    } catch (error) {
        console.error("Errore in cancelListing controller:", error);
        res.status(500).json({ error: error.message || 'Errore annullamento' });
    }
};

// NUOVA FUNZIONE PER GESTIRE L'ACQUISTO SECONDARIO (Codice invariato)
const buyListing = async (req, res, next) => { // 'exports.' rimosso, esportiamo sotto
    try {
        const { listingId } = req.params;
        const buyerUserId = req.user.userId;

        if (!listingId || isNaN(parseInt(listingId, 10))) { // Aggiunto controllo isNaN
             return res.status(400).json({ status: 'fail', message: 'Listing ID mancante o non valido' });
        }

        console.log(`[MarketplaceController] Richiesta acquisto listing ${listingId} da utente ${buyerUserId}`);

        const result = await marketplaceService.purchaseSecondaryTicket(buyerUserId, parseInt(listingId, 10));

        console.log(`[MarketplaceController] Acquisto listing ${listingId} completato con successo.`);

        res.status(200).json({
            status: 'success',
            message: 'Acquisto completato con successo!',
            details: result
        });

    } catch (error) {
        console.error(`[MarketplaceController] Errore durante l'acquisto del listing ${req.params.listingId}:`, error);
         // Miglioriamo la gestione errori specifica se necessario
        if (error.message.includes('Listing non trovato') || error.message.includes('Listing non attivo')) {
             res.status(404).json({ status: 'fail', message: error.message });
        } else if (error.message.includes('acquistare il proprio listing') || error.message.includes('Fondi insufficienti')) {
            res.status(400).json({ status: 'fail', message: error.message });
        } else if (error.message.includes('decriptare la chiave') || error.message.includes('utente non trovato')) {
             res.status(500).json({ status: 'error', message: 'Errore interno del server durante il recupero delle credenziali utente.' }); // Nasconde dettagli implementativi
        } else {
            // Passa l'errore al middleware di gestione errori globale per errori generici/imprevisti
            next(error);
        }
    }
};

module.exports = {
    getListings,
    buyListedTicket, // <-- Esporta la nuova funzione
    cancelListing,
    buyListing
};