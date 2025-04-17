const express = require('express');
const router = express.Router();

// Importiamo TUTTE le funzioni necessarie dal controller
const { getMyTickets, listTicketForSale, cancelTicketListing } = require('../controllers/ticketController');

// Importiamo il middleware di autenticazione
const { protect } = require('../middleware/authMiddleware');

// --- Definizione delle Rotte per /api/tickets ---

// GET /api/tickets/my (Protetta)
router.get('/my', protect, getMyTickets);

// POST /api/tickets/:tokenId/list (Protetta)
router.post('/:tokenId/list', protect, listTicketForSale);

// === NUOVA ROTTA PER ANNULLARE LISTING ===
// DELETE /api/tickets/:tokenId/list (Protetta)
// Usiamo il metodo DELETE per l'azione di rimozione/annullamento
router.delete('/:tokenId/list', protect, cancelTicketListing);


module.exports = router; // Esportiamo il router aggiornato