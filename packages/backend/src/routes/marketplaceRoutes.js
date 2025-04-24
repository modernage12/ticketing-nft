// packages/backend/src/routes/marketplaceRoutes.js

const express = require('express');
const router = express.Router();

// --- CORREZIONE IMPORT ---
// Importiamo l'INTERO oggetto controller invece delle singole funzioni
// Assicurati che il percorso '../controllers/marketplaceController' sia giusto!
const marketplaceController = require('../controllers/marketplaceController');

// Importiamo il middleware di autenticazione (il tuo file lo chiama 'protect')
// Assicurati che il percorso '../middleware/authMiddleware' sia giusto!
const { protect } = require('../middleware/authMiddleware');
// --- FINE CORREZIONE IMPORT ---

// --- Definizione Rotte per /api/marketplace ---

// GET /api/marketplace/listings
// Usa la funzione dal controller importato come oggetto
router.get(
    '/listings',
    marketplaceController.getListings
);

// POST /api/marketplace/buy/:listingId
// Usa la funzione dal controller importato come oggetto e il middleware 'protect'
router.post(
    '/buy/:listingId',
    protect,
    marketplaceController.buyListing // Assicurati che buyListing sia esportata dal controller
);

// DELETE /api/marketplace/listings/:tokenId (Per Annullare Listing)
// Usa la funzione dal controller importato come oggetto e il middleware 'protect'
router.delete(
    '/listings/:tokenId', // Assicurati che questa sia la rotta giusta per annullare
    protect,
    marketplaceController.cancelListing // Assicurati che cancelListing sia esportata dal controller
);

// --- NUOVA ROTTA (Corretta) ---
// POST /api/marketplace/notify-external-listing
router.post(
    '/notify-external-listing',
    protect, // Usa 'protect' come importato sopra
    marketplaceController.handleExternalListingNotification // Usa la funzione dal controller importato
);
// --- FINE NUOVA ROTTA ---


// Esporta il router configurato
module.exports = router;

/* --- NOTE IMPORTANTI ---
 * 1. Controlla che TUTTE le funzioni usate qui (getListings, buyListing, cancelListing, handleExternalListingNotification)
 * siano effettivamente ESPORTATE alla fine del file 'marketplaceController.js'.
 * 2. Controlla che il percorso per importare 'marketplaceController' e 'authMiddleware' sia corretto
 * rispetto alla posizione del tuo file 'marketplaceRoutes.js'.
 * 3. Rimuovi eventuali definizioni di rotte duplicate o non più usate se ce ne sono.
*/