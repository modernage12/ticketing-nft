const userService = require('../services/userService');
const jwt = require('jsonwebtoken'); // Lo useremo magari dopo per il login
const bcrypt = require('bcrypt');

const registerUser = async (req, res) => {
    const { username, password } = req.body;

    // Validazione input base
    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password sono obbligatori.' });
    }
    if (password.length < 6) { // Esempio di regola password
         return res.status(400).json({ error: 'La password deve essere almeno 6 caratteri.' });
    }

    try {
        // Chiamiamo il servizio per creare l'utente
        const newUser = await userService.createUser(username, password);
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
            walletAddress: user.wallet_address // Includiamo anche l'indirizzo wallet nel token
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

        // 4. Invia il token al client
        res.status(200).json({
            message: 'Login effettuato con successo!',
            token: token // Il frontend salverà questo token
        });

    } catch (error) {
        console.error("Errore durante il login:", error);
        res.status(500).json({ error: error.message || 'Errore interno del server durante il login.' });
    }
};

// === NUOVA FUNZIONE PER OTTENERE UTENTE CORRENTE ===
const getCurrentUser = (req, res) => {
    // Il middleware 'protect' ha già verificato il token
    // e messo i dati utente in req.user
    if (req.user) {
        res.status(200).json(req.user); // Restituisce i dati dal token
    } else {
        // Questo non dovrebbe accadere se il middleware funziona
        res.status(401).json({ error: 'Utente non trovato nel token.' });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getCurrentUser // Esporta la nuova funzione
};