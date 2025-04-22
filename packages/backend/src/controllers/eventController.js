const eventService = require('../services/eventService');
const ethers = require('ethers');

const createEvent = async (req, res) => {
    console.log('Dati ricevuti dal frontend:', req.body);
    console.log('Create Event Controller called by user:', req.user); // req.user viene da adminAuthMiddleware

    // ASSUMIAMO CHE IL MIDDLEWARE DI AUTENTICAZIONE METTA L'INDIRIZZO IN req.user.walletAddress
    const creatorAddress = req.user?.walletAddress;
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) { // AGGIUNTO CONTROLLO VALIDITA'
        console.error('ERRORE: Indirizzo wallet del creatore non valido o non trovato in req.user:', creatorAddress);
        // È un errore dell'applicazione se l'utente è autenticato ma non ha un indirizzo valido
        return res.status(500).json({ message: 'Errore interno: impossibile recuperare indirizzo wallet creatore valido.' });
    }
    console.log(`Indirizzo creatore recuperato da req.user: ${creatorAddress}`);
    // --- FINE NUOVA AGGIUNTA ---

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
            creatorAddress: creatorAddress
            // createdByUserId: req.user.id // Opzionale
        };

        // 4. Chiama il service per creare l'evento nel DB
        const serviceResult = await eventService.createEvent(eventData);

        // --- MODIFICA SOLO QUESTA PARTE (Risposta di successo) ---
        // 5. Risposta di successo al frontend
        // Includiamo l'intero oggetto restituito dal service
        res.status(201).json({
            message: 'Evento creato nel DB e registrazione on-chain avviata.',
            event: serviceResult // Contiene { event_id, name, ..., onChainTxHash }
        });
        // --- FINE MODIFICA ---


    } catch (error) {
        console.error('Error creating event:', error);
        // Controlla se è un errore specifico che vuoi gestire diversamente
        // if (error.message === 'Specific validation error from service') {
        //     return res.status(400).json({ message: error.message });
        // }
        res.status(500).json({ message: 'Internal server error creating event' });
    }
};

// --- INIZIO NUOVA VERSIONE DELLA FUNZIONE BUYTICKET ---
// QUESTA FUNZIONE SOSTITUISCE COMPLETAMENTE LA VECCHIA buyTicket
/**
 * Controller per acquistare un biglietto primario tramite la nuova funzione del service.
 */
const buyTicket = async (req, res) => {
    // PRENDIAMO L'ID DELL'EVENTO DAI PARAMETRI DELLA RICHIESTA (URL)
    const { eventId } = req.params;
    // PRENDIAMO L'ID DELL'UTENTE DAL MIDDLEWARE DI AUTENTICAZIONE (req.user AGGIUNTO DA authMiddleware)
    // req.user dovrebbe contenere { userId: ..., walletAddress: ..., ... }
    const userId = req.user?.userId;

    // CONTROLLO DI SICUREZZA: ASSICURIAMOCI CHE L'UTENTE SIA AUTENTICATO
    if (!userId) {
        // SE NON TROVIAMO userId, L'UTENTE NON È AUTENTICATO CORRETTAMENTE
        console.warn('[eventController - buyTicket] Tentativo di acquisto non autorizzato (userId mancante).');
        return res.status(401).json({ message: 'Utente non autorizzato.' });
    }

    // VALIDIAMO eventId
    const parsedEventId = parseInt(eventId, 10);
    if (isNaN(parsedEventId)) {
        console.warn(`[eventController - buyTicket] Tentativo di acquisto con eventId non valido: ${eventId}`);
        return res.status(400).json({ message: 'ID Evento non valido.' });
    }

    console.log(`[eventController - buyTicket] Ricevuta richiesta acquisto per evento ${parsedEventId} da utente ${userId}`); // LOG PER DEBUG

    try {
        // --- QUESTA È LA CHIAMATA ALLA NUOVA FUNZIONE NEL SERVICE ---
        // CHIAMIAMO purchasePrimaryTicket PASSANDO L'ID DELL'UTENTE E L'ID DELL'EVENTO (NUMERICO)
        // IL SERVICE SI OCCUPERÀ DI RECUPERARE LA CHIAVE DELL'UTENTE, CALCOLARE IL COSTO E INVIARE LA TRANSAZIONE PAYABLE
        const result = await eventService.purchasePrimaryTicket(userId, parsedEventId);
        // -------------------------------------------------------------

        console.log(`[eventController - buyTicket] Acquisto completato con successo per evento ${parsedEventId}. Risultato:`, result); // LOG PER DEBUG

        // SE TUTTO VA BENE, INVIAMO UNA RISPOSTA POSITIVA (200 OK o 201 Created)
        // INCLUDIAMO IL RISULTATO DAL SERVICE (CHE POTREBBE CONTENERE txHash, tokenId, ecc.)
        res.status(200).json({ // Usiamo 200 OK perché l'evento esiste già, stiamo creando un ticket (risorsa figlia)
            message: 'Biglietto acquistato con successo!',
            details: result // Restituiamo quello che il service ci ha dato (es. transactionHash, ticketId)
        });

    } catch (error) {
        // --- GESTIONE DEGLI ERRORI ---
        console.error(`[eventController - buyTicket] Errore durante l'acquisto del biglietto per evento ${parsedEventId} da utente ${userId}:`, error);

        // PROVIAMO A DARE UN FEEDBACK PIÙ SPECIFICO BASATO SUL MESSAGGIO DI ERRORE DAL SERVICE O DAL CONTRATTO
        let statusCode = 500; // Default a Internal Server Error
        let userMessage = 'Errore durante l\'elaborazione dell\'acquisto del biglietto.';

        // Esempi di errori comuni che potremmo ricevere da ethers o dal service
        if (error.message.toLowerCase().includes('insufficient funds')) {
            statusCode = 400; // Bad Request
            userMessage = 'Fondi insufficienti nel wallet per completare l\'acquisto (prezzo + gas).';
        } else if (error.message.includes('EVENT_NOT_REGISTERED')) { // Assumendo un codice di errore custom dal contratto/service
            statusCode = 404; // Not Found
            userMessage = 'Evento non trovato o non ancora registrato sulla blockchain.';
        } else if (error.message.includes('INVALID_EVENT_ID')) { // Assumendo un codice di errore custom dal contratto/service
            statusCode = 400; // Bad Request
            userMessage = 'ID Evento non valido.';
        } else if (error.message.includes('SALE_NOT_ACTIVE') || error.message.includes('MAX_SUPPLY_REACHED')) { // Esempi
             statusCode = 400; // Bad Request
             userMessage = 'Vendita non attiva o biglietti esauriti.';
        } else if (error.code === 'CALL_EXCEPTION') { // Errore generico da chiamata contratto fallita (es. require fallito)
             statusCode = 400; // Bad Request
             userMessage = 'La transazione è stata rifiutata dal contratto. Controlla i dettagli dell\'evento o i fondi disponibili.';
        } else if (error.message.includes('utente non trovato') || error.message.includes('chiave privata')) {
            // Errore interno nel recupero chiave utente, non mostrare dettagli sensibili
             statusCode = 500;
             userMessage = 'Errore interno durante il recupero dei dati utente.';
        }
        // Aggiungere altri controlli specifici se necessario...

        // INVIA LA RISPOSTA DI ERRORE
        res.status(statusCode).json({
            message: userMessage,
            // INCLUDIAMO IL MESSAGGIO DI ERRORE ORIGINALE SOLO IN SVILUPPO PER DEBUG, MAI IN PRODUZIONE!
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            errorCode: process.env.NODE_ENV === 'development' ? error.code : undefined // Includi anche il codice errore in dev
        });
        // ----------------------------
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