const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// POST /api/auth/register
router.post('/register', authController.registerUser);
// POST /api/auth/login
router.post('/login', authController.loginUser); // Aggiungi questa riga
// GET /api/auth/me (Rotta protetta)
// Applichiamo il middleware 'protect' PRIMA della funzione del controller
router.get('/me', protect, authController.getCurrentUser);
// PUT /api/auth/me/preferences (Rotta protetta per aggiornare le preferenze dell'utente loggato)
router.put('/me/preferences', protect, authController.updateUserPreferences);

// TODO: Aggiungere rotta POST /api/auth/login qui

module.exports = router;