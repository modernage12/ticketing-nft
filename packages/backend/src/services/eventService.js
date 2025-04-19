const { pool } = require('../config/db');
const { provider, ticketNFTContract } = require('../config/ethers');
const { ethers } = require('ethers');

// Chiave privata del wallet che può mintare
const minterPrivateKey = process.env.PRIVATE_KEY;
let minterWallet;

try {
    if (!minterPrivateKey) throw new Error("ERRORE CRITICO: PRIVATE_KEY (minter) non impostata nel .env!");
    minterWallet = new ethers.Wallet(minterPrivateKey, provider);
    console.log(`Wallet minter inizializzato per l'indirizzo: ${minterWallet.address}`);
} catch (error) {
     console.error("ERRORE CRITICO durante inizializzazione minterWallet:", error.message || error);
     process.exit(1);
}

const createEvent = async (eventData) => {
    const {
        name,
        date,
        location,
        totalTickets,
        availableTickets,
        priceWei, // Già convertito in Wei (stringa) dal controller
        description,
        imageUrl
        // createdByUserId // Se deciso di salvarlo
    } = eventData;

    // Definisci le colonne e i valori per l'inserimento
    // name, description, date, location, original_price, total_tickets, tickets_minted
    const query = `
        INSERT INTO events (
            name, date, location, total_tickets, original_price, description, image_url,
            tickets_minted -- Aggiungiamo tickets_minted
            /*, created_by_user_id */
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8 /*, $9 */)
        RETURNING *;
    `;
    const values = [
        name, date, location, totalTickets, priceWei, // priceWei va in original_price
        description, imageUrl,
        0 // <-- NUOVO: Valore iniziale per tickets_minted
        /*, createdByUserId */
    ];

    try {
        console.log("Executing DB query to create event:", query, values);
        const result = await pool.query(query, values); // <-- MODIFICATA: usa 'pool'
        console.log("DB query result:", result.rows[0]);

        if (result.rows.length > 0) {
            // Formatta l'output se necessario (es: converti price_wei da stringa a BigInt o Ether string)
            // Per ora restituiamo i dati grezzi dal DB
            const newEvent = result.rows[0];
            // Potresti voler riconvertire price_wei in Ether per la risposta API, ma è meglio
            // che il frontend gestisca la visualizzazione dei Wei se necessario.
            // newEvent.priceEther = ethers.formatEther(newEvent.price_wei);
            return newEvent;
        } else {
            throw new Error('Event creation failed, no rows returned.');
        }
    } catch (error) {
        console.error('Database error creating event:', error);
        // Potresti voler gestire errori specifici del DB (es: violazione UNIQUE constraint)
        // if (error.code === '23505') { // Esempio: unique constraint violation
        //     throw new Error('An event with this name/date already exists.');
        // }
        throw new Error('Database operation failed during event creation.'); // Errore generico
    }
};

/**
 * Recupera tutti gli eventi dal database.
 */
const getAllEvents = async () => {
    // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
    const query = `
        SELECT event_id, name, description, date, location, original_price, total_tickets, tickets_minted
        FROM events ORDER BY date ASC;
        -- Assumendo che la tabella e la colonna 'date' siano state create in minuscolo (default)
    `;
    try {
        const result = await pool.query(query);
        console.log(`INFO: Recuperati ${result.rows.length} eventi dal DB.`);
        return result.rows.map(event => ({
            ...event,
            original_price: event.original_price?.toString(),
            // La colonna 'date' nel DB è timestamp with time zone, pg la restituisce come Date object
            // quindi toISOString() funziona. Se fosse stata solo 'date' senza fuso, sarebbe diverso.
            date: event.date?.toISOString()
        }));
    } catch (error) {
        console.error("ERRORE in getAllEvents service:", error);
        throw new Error('Errore durante il recupero degli eventi.');
    }
};

/**
 * Minta un nuovo biglietto NFT per un utente, dopo aver controllato la disponibilità nel DB,
 * e aggiorna la tabella Tickets nel DB.
 */
const mintTicketForUser = async (userId, userWalletAddress, eventId) => {
    if (!minterWallet) throw new Error('Wallet minter non inizializzato.');

    let dbClient;
    console.log(`INFO: Inizio mintTicketForUser per userId: ${userId}, userWallet: ${userWalletAddress}, eventId: ${eventId}`);
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // --- 1. Recupera dettagli Evento e VERIFICA DISPONIBILITA' dal DB ---
        // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
        const eventQuery = `
            SELECT original_price, tickets_minted, total_tickets
            FROM events WHERE event_id = $1 FOR UPDATE;
        `;
        const eventResult = await dbClient.query(eventQuery, [eventId]);

        if (eventResult.rows.length === 0) { throw new Error(`Evento con ID ${eventId} non trovato.`); }

        const eventData = eventResult.rows[0];
        const dbOriginalPrice = eventData.original_price;
        const ticketsMinted = parseInt(eventData.tickets_minted, 10);
        const totalTickets = parseInt(eventData.total_tickets, 10);

        // Controllo disponibilità
        if (ticketsMinted >= totalTickets) {
            await dbClient.query('ROLLBACK');
            console.warn(`WARN: Tentativo minting fallito per evento ${eventId} - Esaurito (${ticketsMinted}/${totalTickets})`);
            throw new Error(`Biglietti esauriti per l'evento ${eventId}.`);
        }

        const priceForContract = BigInt(dbOriginalPrice);
        console.log(`INFO: Evento ${eventId}: Prezzo ${priceForContract}, Disponibili ${totalTickets - ticketsMinted}/${totalTickets}. Procedo...`);

        // --- 2. Chiama la funzione mintTicket on-chain ---
        console.log(`INFO: Invio mintTicket Tx per user ${userWalletAddress}...`);
        const tx = await ticketNFTContract.connect(minterWallet).mintTicket(userWalletAddress, eventId, priceForContract);
        const receipt = await tx.wait(1);
        if (receipt.status !== 1) throw new Error(`Minting fallito on-chain (Tx: ${tx.hash})`);
        console.log(`INFO: mintTicket Tx ${tx.hash} completata nel blocco ${receipt.blockNumber}.`);

        const transferEvent = receipt.logs?.find(log => log.fragment?.name === 'Transfer' && log.args?.to === userWalletAddress);
        const mintedTokenId = transferEvent ? transferEvent.args.tokenId : null;
        if (mintedTokenId === null) throw new Error("Token ID mintato non trovato negli eventi.");
        console.log(`INFO: Minted tokenId: ${mintedTokenId.toString()}`);

         // --- 3. Aggiorna il contatore tickets_minted nella tabella Events ---
         // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
         const updateEventQuery = `UPDATE events SET tickets_minted = tickets_minted + 1 WHERE event_id = $1;`;
         await dbClient.query(updateEventQuery, [eventId]);
         console.log(`INFO: Contatore DB tickets_minted aggiornato per eventId: ${eventId}`);

         // === 4. AGGIUNGI IL NUOVO BIGLIETTO ALLA TABELLA Tickets ===
         // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
         const block = await provider.getBlock(receipt.blockNumber);
         const issuanceTimestamp = new Date(Number(block.timestamp) * 1000);
         const insertTicketQuery = `
            INSERT INTO tickets (token_id, nft_contract_address, owner_wallet_address, owner_user_id, event_id, original_price, issuance_date, is_listed, last_checked_block)
            VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8);
            -- Assumendo nomi colonna minuscoli anche per Tickets
         `;
         await dbClient.query(insertTicketQuery, [
            mintedTokenId.toString(), ticketNFTContract.target, userWalletAddress, userId,
            eventId, priceForContract.toString(), issuanceTimestamp, receipt.blockNumber
         ]);
         console.log(`INFO: Nuovo biglietto (tokenId: ${mintedTokenId.toString()}) inserito nella tabella Tickets.`);

         // --- 5. Completa la Transazione DB e Restituisci il risultato ---
         await dbClient.query('COMMIT');
         return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, tokenId: mintedTokenId.toString() };

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error(`ERRORE in mintTicketForUser (eventId: ${eventId}):`, error);
        if (error.code === 'INSUFFICIENT_FUNDS') throw new Error('Fondi insufficienti wallet minter per gas.');
        // Se l'errore originale è quello della relazione non esistente, rendilo più chiaro
        if (error.code === '42P01') throw new Error(`Tabella necessaria non trovata nel DB (${error.message}).`);
        throw new Error(error.message || 'Errore durante il minting.');
    } finally {
         if (dbClient) dbClient.release();
    }
};

module.exports = {
    getAllEvents,
    mintTicketForUser,
    createEvent
};