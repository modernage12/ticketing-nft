const express = require('express');
const router = express.Router();
// Importiamo entrambe le funzioni controller
const { getListings, buyListedTicket, cancelListing } = require('../controllers/marketplaceController');
// Importiamo il middleware di autenticazione
const { protect } = require('../middleware/authMiddleware');

// --- Definizione Rotte per /api/marketplace ---

// GET /api/marketplace/listings
// Restituisce tutte le offerte attive (pubblica per ora)
router.get('/listings', getListings);

// POST /api/marketplace/listings/:tokenId/buy
// Permette a un utente autenticato di acquistare un biglietto listato.
// La rotta è protetta: solo gli utenti loggati possono acquistare.
router.post('/listings/:tokenId/buy', protect, buyListedTicket);
router.delete('/listings/:tokenId', protect, cancelListing);


module.exports = router;