// Importiamo solo il pool DB ora! Non serve più ethers o i contratti qui per leggere.
const { pool } = require('../config/db');

/**
 * Trova tutti i biglietti posseduti da un indirizzo specifico LEGGENDO DAL DB CACHE.
 * @param {string} ownerWalletAddress L'indirizzo del wallet da controllare.
 * @returns {Promise<Array>} Un array di oggetti rappresentanti i biglietti posseduti dal DB.
 */
const findTicketsByOwner = async (ownerWalletAddress) => {
    // Log iniziale (invariato)
    console.log(`>>> findTicketsByOwner Service: Tentativo recupero tickets per indirizzo: ${ownerWalletAddress}`);

    // Query SQL MODIFICATA per confronto case-insensitive
    const query = `
        SELECT
            token_id,
            event_id,
            original_price,
            issuance_date,
            is_listed,
            owner_wallet_address -- Seleziona anche l'indirizzo per debug/verifica
        FROM Tickets
        WHERE LOWER(owner_wallet_address) = LOWER($1) -- Confronto case-insensitive!
        ORDER BY token_id ASC;
    `;
    // Parametro per la query (invariato)
    const values = [ownerWalletAddress];

    console.log(`>>> findTicketsByOwner Service: Eseguo query: ${query.replace('$1', `'${ownerWalletAddress}'`)}`); // Logga la query con il valore

    try {
        const result = await pool.query(query, values);
        console.log(`>>> findTicketsByOwner Service: Query eseguita. Numero righe trovate nel DB: ${result.rows.length} per indirizzo (case-insensitive): ${ownerWalletAddress}`);

        // Logga i risultati grezzi se utili per debug
        // if (result.rows.length > 0) {
        //     console.log(">>> findTicketsByOwner Service: Dati grezzi dal DB:", result.rows);
        // }

        // Mappatura risultati (invariata, ma aggiungi robustezza)
        return result.rows.map(ticket => ({
            // Assicurati che le proprietà esistano prima di chiamare metodi
            tokenId: ticket.token_id?.toString() ?? 'N/D', // Usa toString solo se non è null/undefined
            eventId: ticket.event_id?.toString() ?? 'N/D',
            originalPrice: ticket.original_price?.toString() ?? '0', // Default a '0' o 'N/D' se nullo
            issuanceDate: ticket.issuance_date ? new Date(ticket.issuance_date).toISOString() : null, // Restituisci null se la data è nulla
            isListed: ticket.is_listed ?? false // Default a false se nullo
        }));
    } catch (error) {
        console.error(`>>> ERRORE in findTicketsByOwner Service durante query DB per ${ownerWalletAddress}:`, error);
        // Restituisci array vuoto o lancia errore
        // return []; // Comportamento attuale
        throw new Error(`Errore database durante ricerca biglietti per ${ownerWalletAddress}`); // Lancia errore per farlo gestire dal controller
    }
};

module.exports = {
    findTicketsByOwner,
};