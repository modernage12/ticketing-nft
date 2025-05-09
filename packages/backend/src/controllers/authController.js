const userService = require('../services/userService');
const jwt = require('jsonwebtoken'); // Lo useremo magari dopo per il login
const bcrypt = require('bcrypt');
const { pool } = require('../config/db'); 
const authService = require('../services/userService');

const registerUser = async (req, res) => {
    const { username, password, registerAsCreator = false } = req.body;

    // Validazione input base
    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password sono obbligatori.' });
    }
    if (password.length < 6) { // Esempio di regola password
         return res.status(400).json({ error: 'La password deve essere almeno 6 caratteri.' });
    }

    try {
        // Chiamiamo il servizio per creare l'utente
        const newUser = await authService.createUser(username, password, registerAsCreator);
        // Per ora restituiamo solo i dati utente (senza password hash)
        // In futuro potremmo generare e restituire un JWT qui
        res.status(201).json({
            message: 'Utente registrato con successo!',
            user: {
                userId: newUser.user_id,
                username: newUser.username,
                walletAddress: newUser.wallet_address
            }
         });
    } catch (error) {
        console.error("Errore durante la registrazione:", error);
        // Se l'errore è dovuto a username duplicato (violazione UNIQUE constraint)
        if (error.code === '23505' && error.constraint === 'users_username_key') {
             return res.status(409).json({ error: 'Username già esistente.' }); // 409 Conflict
        }
        res.status(500).json({ error: error.message || 'Errore interno del server durante la registrazione.' });
    }
};


// === NUOVA FUNZIONE LOGIN ===
const loginUser = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password sono obbligatori.' });
    }

    try {
        // 1. Trova l'utente per username
        const user = await userService.findUserByUsername(username);
        if (!user) {
            // Utente non trovato - usiamo un messaggio generico per sicurezza
            return res.status(401).json({ error: 'Credenziali non valide.' }); // 401 Unauthorized
        }

        // 2. Verifica la password usando bcrypt.compare
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            // Password errata - usiamo un messaggio generico
            return res.status(401).json({ error: 'Credenziali non valide.' }); // 401 Unauthorized
        }

        // 3. Password Corretta: Genera il JWT
        const payload = {
            userId: user.user_id,
            username: user.username,
            walletAddress: user.wallet_address, // Indirizzo wallet interno
            walletPreference: user.wallet_preference, // Includi la preferenza nel payload del token
            isAdmin: user.isAdmin,
            isCreator: user.is_creator
        };

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
             throw new Error('La chiave segreta JWT non è configurata nel .env!');
        }
        const token = jwt.sign(
            payload,
            jwtSecret,
            { expiresIn: '1h' } // Il token scade tra 1 ora (puoi cambiare la durata)
        );

        // 4. Invia il token E i dati utente (inclusa la preferenza) al client
        res.status(200).json({
            message: 'Login effettuato con successo!',
            token: token,
            // Aggiungiamo un oggetto 'user' con i dati necessari al frontend
            user: {
                userId: user.user_id,
                username: user.username,
                walletAddress: user.wallet_address, // Indirizzo wallet interno
                walletPreference: user.wallet_preference, // --> AGGIUNTO: La preferenza letta dal DB
                isAdmin: user.is_admin,
                isCreator: user.is_creator,
            }
        });

    } catch (error) {
        console.error("Errore durante il login:", error);
        res.status(500).json({ error: error.message || 'Errore interno del server durante il login.' });
    }
};

// === NUOVA FUNZIONE PER OTTENERE UTENTE CORRENTE ===
const getCurrentUser = async (req, res) => {
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Token non valido o utente non identificato.' });
    }
    const userId = req.user.userId;

    try { // <-- Blocco try INIZIA qui
        // Query diretta al DB
        const userResult = await pool.query(
            'SELECT user_id, username, wallet_address, wallet_preference, is_admin, is_creator FROM users WHERE user_id = $1', // <-- AGGIUNGI is_creator
            [req.user.userId] // req.user.userId viene dal middleware di autenticazione base
        );
        const userFromDb = userResult.rows[0];

        if (!userFromDb) {
            return res.status(404).json({ error: 'Utente non trovato nel database.' });
        }

        // Costruisci la risposta JSON
        res.status(200).json({
            userId: userFromDb.user_id,
            username: userFromDb.username,
            walletAddress: userFromDb.wallet_address,
            walletPreference: userFromDb.wallet_preference,
            isAdmin: userFromDb.is_admin,
            isCreator: userFromDb.is_creator
        });

    } catch (error) { // <-- Blocco catch per gestire errori della query
        console.error("Errore in getCurrentUser (/me):", error);
        res.status(500).json({ error: error.message || 'Errore interno del server recuperando i dati utente.' });
    } 
};

const updateUserPreferences = async (req, res) => {
    const userId = req.user.userId; // Ottenuto dal token JWT tramite il middleware protect
    const { walletPreference } = req.body; // Legge dal corpo della richiesta JSON

    // Validazione input base
    if (!walletPreference || (walletPreference !== 'internal' && walletPreference !== 'external')) {
        return res.status(400).json({ error: 'Campo walletPreference mancante o non valido (deve essere "internal" o "external").' });
    }

    try {
        const success = await userService.updateUserWalletPreference(userId, walletPreference);
        if (success) {
            res.status(200).json({ message: 'Preferenza wallet aggiornata con successo.' });
        } else {
             // Questo non dovrebbe accadere se l'userId dal token è valido
             res.status(404).json({ error: 'Utente non trovato.' });
        }
    } catch (error) {
        console.error("Errore in updateUserPreferences:", error);
        res.status(500).json({ error: error.message || 'Errore interno del server durante l\'aggiornamento delle preferenze.' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getCurrentUser,
    updateUserPreferences
};