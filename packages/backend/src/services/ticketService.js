// Importiamo solo il pool DB ora! Non serve più ethers o i contratti qui per leggere.
const { pool } = require('../config/db');

/**
 * Trova tutti i biglietti posseduti da un indirizzo specifico LEGGENDO DAL DB CACHE.
 * @param {string} ownerWalletAddress L'indirizzo del wallet da controllare.
 * @returns {Promise<Array>} Un array di oggetti rappresentanti i biglietti posseduti dal DB.
 */
const findTicketsByOwner = async (ownerWalletAddress) => {
    console.log(`>>> findTicketsByOwner (from DB Cache): Recupero tickets per ${ownerWalletAddress}`);
    // Query per selezionare i biglietti posseduti dall'utente dalla nostra tabella Tickets
    const query = `
        SELECT
            token_id, event_id, original_price, issuance_date, is_listed
        FROM Tickets
        WHERE owner_wallet_address = $1
        ORDER BY token_id ASC;
    `;
    try {
        const result = await pool.query(query, [ownerWalletAddress]);
        console.log(`>>> findTicketsByOwner (from DB Cache): Trovati ${result.rows.length} tickets nel DB per ${ownerWalletAddress}`);
        // Formattiamo i dati per coerenza con l'output precedente
        return result.rows.map(ticket => ({
            tokenId: ticket.token_id.toString(),
            eventId: ticket.event_id ? ticket.event_id.toString() : 'N/D',
            originalPrice: ticket.original_price ? ticket.original_price.toString() : 'N/D',
            issuanceDate: ticket.issuance_date ? ticket.issuance_date.toISOString() : 'N/A',
            isListed: ticket.is_listed
        }));
    } catch (error) {
        console.error(`ERRORE nel recuperare i tickets dal DB per ${ownerWalletAddress}:`, error);
        // In caso di errore DB, restituisce array vuoto per non bloccare frontend
        // Potremmo anche lanciare un errore 500 qui.
        return [];
        // throw new Error('Errore durante la ricerca dei biglietti (cache DB).');
    }
};

module.exports = {
    findTicketsByOwner,
};