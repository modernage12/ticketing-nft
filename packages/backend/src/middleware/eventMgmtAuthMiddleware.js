// packages/backend/src/middleware/eventMgmtAuthMiddleware.js
// --- VERSIONE CORRETTA CON REQUIRE / MODULE.EXPORTS E AGGIUNTA WALLET_ADDRESS ---

const jwt = require('jsonwebtoken');
const pool = require('../config/db').pool; // Assicurati che l'import sia corretto

const eventMgmtAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization token required' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const USER_ID_DAL_TOKEN = decoded.userId; // <-- VERIFICA NOME CAMPO ID TOKEN!

    if (!USER_ID_DAL_TOKEN) {
       console.error('Event Mgmt Auth Middleware Error: userId not found in JWT payload');
       return res.status(401).json({ message: 'Invalid token: User ID missing.' });
    }

    // --- MODIFICA QUERY: AGGIUNGI wallet_address ---
    // Selezioniamo ANCHE la colonna wallet_address dal database
    const userResult = await pool.query(
      'SELECT user_id, username, is_admin, is_creator, wallet_address FROM users WHERE user_id = $1', // <--- AGGIUNTO wallet_address
      [USER_ID_DAL_TOKEN]
    );
    // --- FINE MODIFICA QUERY ---
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'User not found for provided token' });
    }

    // CONTROLLA PERMESSI (Admin O Creator)
    if (!user.is_admin && !user.is_creator) {
      return res.status(403).json({ message: 'Forbidden: Admin or Creator privileges required' });
    }

    // --- MODIFICA req.user: AGGIUNGI walletAddress ---
    // Aggiungiamo ANCHE il walletAddress all'oggetto req.user
    req.user = {
        ...(req.user || {}),
        userId: user.user_id,
        username: user.username,
        isAdmin: user.is_admin,
        isCreator: user.is_creator,
        walletAddress: user.wallet_address // <--- AGGIUNTO walletAddress (da user.wallet_address)
    };
    // --- FINE MODIFICA req.user ---

    next(); // Procedi

  } catch (error) {
    console.error('Event Mgmt Auth Middleware Error:', error);
    if (error.name === 'JsonWebTokenError') {
       return res.status(401).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
       return res.status(401).json({ message: 'Expired token.' });
    }
    return res.status(500).json({ message: 'Internal server error during authorization.' });
  }
};

module.exports = eventMgmtAuthMiddleware;