const eventService = require('../services/eventService');
const ethers = require('ethers');

const createEvent = async (req, res) => {
    console.log('Dati ricevuti dal frontend:', req.body);
    console.log('Create Event Controller called by user:', req.user); // req.user viene da adminAuthMiddleware
    try {
        // 1. Estrai i dati dal corpo della richiesta
        const {
            name,
            date, // Formato atteso: es. 'YYYY-MM-DD HH:MM:SS' o timestamp ISO 8601
            location,
            totalTickets,
            price, // Prezzo in ETHER (es. "0.1") inviato dal frontend
            description, // Opzionale
            imageUrl // Opzionale
        } = req.body;

        // 2. Validazione Input Base (migliorabile con librerie come Joi o express-validator)
        if (!name || !date || !location || !totalTickets || !price) {
            return res.status(400).json({ message: 'Missing required event fields: name, date, location, totalTickets, price' });
        }

        const parsedTotalTickets = parseInt(totalTickets, 10);
        if (isNaN(parsedTotalTickets) || parsedTotalTickets <= 0) {
            return res.status(400).json({ message: 'Total tickets must be a positive integer' });
        }

        let priceWei;
        try {
            // Converti il prezzo da Ether (stringa) a Wei (BigInt)
            priceWei = ethers.parseEther(price.toString()); // Usa toString() per sicurezza
        } catch (err) {
            console.error("Errore conversione prezzo:", err);
            return res.status(400).json({ message: 'Invalid price format. Use standard Ether format (e.g., "0.1").' });
        }

        // 3. Prepara i dati per il service
        const eventData = {
            name,
            date,
            location,
            totalTickets: parsedTotalTickets,
            // Non passiamo availableTickets, il service gestirà tickets_minted
            priceWei: priceWei.toString(), // Passiamo come stringa, compatibile con bigint/numeric
            description: description || null,
            imageUrl: imageUrl || null,
            // createdByUserId: req.user.id // Opzionale
        };

        // 4. Chiama il service per creare l'evento nel DB
        const newEvent = await eventService.createEvent(eventData);

        // 5. Risposta di successo
        res.status(201).json({ message: 'Event created successfully', event: newEvent });

    } catch (error) {
        console.error('Error creating event:', error);
        // Controlla se è un errore specifico che vuoi gestire diversamente
        // if (error.message === 'Specific validation error from service') {
        //     return res.status(400).json({ message: error.message });
        // }
        res.status(500).json({ message: 'Internal server error creating event' });
    }
};

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
    getAllEvents,
    createEvent
};