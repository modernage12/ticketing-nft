const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;

    // Cerchiamo il token nell'header 'Authorization'
    // Il formato standard è "Bearer TOKEN_STRING"
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Estraiamo il token (togliamo "Bearer ")
            token = req.headers.authorization.split(' ')[1];

            // Verifichiamo il token usando lo stesso segreto usato per firmarlo
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // *** IMPORTANTE ***: Alleghiamo i dati dell'utente decodificati
            // all'oggetto 'req', così le funzioni controller successive
            // sapranno chi è l'utente loggato.
            // NON alleghiamo la password hashata o altri dati sensibili dal DB qui,
            // solo ciò che era nel payload del token (userId, username, walletAddress).
            req.user = decoded; // Ora req.user contiene { userId, username, walletAddress }

            next(); // Passa il controllo alla prossima funzione middleware o al controller

        } catch (error) {
            console.error('Errore verifica token:', error.message);
            // Se il token non è valido (es. scaduto o firma errata)
            res.status(401).json({ error: 'Non autorizzato, token non valido.' });
        }
    }

    // Se l'header Authorization non esiste o non inizia con 'Bearer'
    if (!token) {
        res.status(401).json({ error: 'Non autorizzato, nessun token fornito.' });
    }
};

module.exports = { protect };