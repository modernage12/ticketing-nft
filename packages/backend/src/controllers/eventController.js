const eventService = require('../services/eventService');

/**
 * Controller per acquistare (mintare) un biglietto primario.
 */
const buyTicket = async (req, res) => {
    try {
        const userId = req.user.userId; // Dall'utente autenticato via middleware
        const userWalletAddress = req.user.walletAddress; // Dall'utente autenticato via middleware
        const eventId = parseInt(req.params.eventId, 10);

        if (isNaN(eventId)) return res.status(400).json({ error: 'ID Evento non valido.' });
        if (!userWalletAddress) return res.status(400).json({ error: 'Indirizzo wallet utente non trovato.' });

        // Passiamo anche userId al service per poterlo salvare nella tabella Tickets
        const result = await eventService.mintTicketForUser(userId, userWalletAddress, eventId);

        res.status(201).json({ message: 'Biglietto mintato con successo!', transaction: result });

    } catch (error) {
        console.error("Errore in buyTicket controller:", error);
         if (error.message.includes('esauriti') || error.message.includes('non trovato')) {
             res.status(404).json({ error: error.message });
         } else if (error.message.includes('Fondi insufficienti')) {
             res.status(400).json({ error: error.message });
         } else {
            res.status(500).json({ error: error.message || 'Errore durante il minting.' });
         }
    }
};

/**
 * Controller per ottenere tutti gli eventi dal DB.
 */
const getAllEvents = async (req, res) => {
    try {
        const events = await eventService.getAllEvents();
        res.status(200).json(events);
    } catch (error) {
        console.error("Errore in getAllEvents controller:", error);
        res.status(500).json({ error: error.message || 'Errore nel recuperare gli eventi.' });
    }
};

module.exports = {
    buyTicket,
    getAllEvents
};