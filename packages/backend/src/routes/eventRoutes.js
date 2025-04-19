const express = require('express');
const router = express.Router();
// Importiamo TUTTI i controller necessari
const eventController = require('../controllers/eventController');
const { protect } = require('../middleware/authMiddleware'); // Auth middleware
// Importa il middleware di autenticazione admin
const eventMgmtAuthMiddleware = require('../middleware/eventMgmtAuthMiddleware');

// POST /api/events/:eventId/buy (Rotta protetta per comprare)
router.post('/:eventId/buy', protect, eventController.buyTicket);

// === NUOVA ROTTA PER OTTENERE TUTTI GLI EVENTI ===
// GET /api/events/ (Non protetta per ora, chiunque può vederli)
router.get('/', eventController.getAllEvents);

// POST /api/events/
// Richiede autenticazione ADMIN
router.post('/', eventMgmtAuthMiddleware, eventController.createEvent);


module.exports = router;