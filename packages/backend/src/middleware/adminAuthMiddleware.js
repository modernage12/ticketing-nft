// packages/backend/src/middleware/adminAuthMiddleware.js
// --- INIZIO BLOCCO NUOVO ---
const jwt = require('jsonwebtoken');
const db = require('../config/db'); // Assicurati che il path sia corretto per il tuo setup

const adminAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Recupera l'utente E il suo stato di admin
        const userResult = await db.query('SELECT id, username, is_admin FROM users WHERE id = $1', [decoded.userId]);
        const user = userResult.rows[0];

        if (!user) {
            // Anche se il token era valido, l'utente potrebbe essere stato cancellato
            return res.status(401).json({ message: 'User not found for provided token' });
        }

        // Verifica cruciale: l'utente è admin?
        if (!user.is_admin) {
            // Non è admin, accesso negato alla risorsa protetta
            return res.status(403).json({ message: 'Forbidden: Admin privileges required' });
        }

        // Utente trovato ed è admin. Allega info utili alla request per uso successivo
        req.user = {
            id: user.id,
            username: user.username,
            isAdmin: user.is_admin // Conferma che è admin
        };

        // Prosegui alla prossima funzione middleware o al controller della route
        next();

    } catch (error) {
        console.error('Admin Auth Middleware Error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        res.status(500).json({ message: 'Internal server error during admin authorization' });
    }
};

module.exports = adminAuthMiddleware;
// --- FINE BLOCCO NUOVO ---