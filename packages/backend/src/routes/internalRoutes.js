const express = require('express');
const router = express.Router();
const internalController = require('../controllers/internalController');

// POST /api/internal/sync-events (Usiamo POST per azioni, anche se non ha corpo)
router.post('/sync-events', internalController.triggerSync);

module.exports = router;