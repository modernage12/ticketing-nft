const { pool } = require('../config/db');
const { provider, ticketNFTContract, marketplaceContract } = require('../config/ethers');
const { ethers } = require('ethers');

// Costanti per Query Eventi
const EVENT_QUERY_CHUNK_SIZE = 9900; // Pezzi < 10k blocchi
// Da dove partire a cercare la storia se il DB è vuoto (blocco di deploy o recente)
// Potremmo raffinarlo leggendo il blocco di deploy dei contratti
const DEFAULT_START_BLOCK = 20400000; // Metti un blocco ragionevolmente recente su Amoy o 0

/**
 * Determina l'ultimo blocco scansionato leggendo dal DB.
 * Se la tabella è vuota, usa DEFAULT_START_BLOCK.
 * @returns {Promise<number>} Il numero di blocco da cui iniziare la prossima scansione.
 */
async function getLastScannedBlock() {
    let client;
    try {
        // Legge il numero di blocco più alto salvato in QUALSIASI record della tabella Listings
        // Questo è un metodo SEMPLICE, non perfetto. Una tabella SyncStatus sarebbe meglio.
        client = await pool.connect();
        const res = await client.query('SELECT MAX(last_checked_block) as last_block FROM Listings');
        const lastBlock = res.rows[0]?.last_block; // Può essere null se la tabella è vuota
        // Restituisce il blocco successivo a quello trovato, o il default se non trovato/null
        return lastBlock ? Number(lastBlock) + 1 : DEFAULT_START_BLOCK;
    } catch (error) {
        console.error("Errore nel determinare l'ultimo blocco scansionato:", error);
        return DEFAULT_START_BLOCK; // In caso di errore, riparte dal default
    } finally {
        if (client) client.release();
    }
}

/**
 * Scansiona la blockchain per nuovi eventi del Marketplace e aggiorna la tabella Listings.
 */
async function syncMarketplaceEvents() {
    console.log(">>> Inizio sincronizzazione eventi Marketplace...");
    let startBlock;
    try {
        startBlock = await getLastScannedBlock();
    } catch (e) {
        console.error("Impossibile determinare il blocco di partenza, uso default.");
        startBlock = DEFAULT_START_BLOCK;
    }

    let latestBlock;
    try {
        latestBlock = await provider.getBlockNumber();
    } catch (e) {
         console.error("Impossibile ottenere l'ultimo blocco dalla rete:", e);
         return; // Non possiamo procedere senza l'ultimo blocco
    }

    console.log(`>>> Sincronizzazione richiesta da blocco ${startBlock} a ${latestBlock}`);
    if (startBlock > latestBlock) {
        console.log(">>> Nessun nuovo blocco da scansionare.");
        return { scannedToBlock: latestBlock, eventsProcessed: 0 };
    }

    // Definiamo i filtri per i 3 eventi che modificano lo stato di una listing
    const listedFilter = marketplaceContract.filters.ItemListed();
    const soldFilter = marketplaceContract.filters.ItemSold();
    const cancelledFilter = marketplaceContract.filters.ListingCancelled();

    let eventsProcessed = 0;
    let currentBlock = latestBlock; // Partiamo dal blocco più recente e andiamo indietro

    // Otteniamo una connessione singola dal pool per tutti gli update di questo ciclo
    const dbClient = await pool.connect();
    try {
        // Ciclo di Chunking (invertito rispetto a prima per semplicità logica qui)
         for (let fromChunkBlock = startBlock; fromChunkBlock <= latestBlock; fromChunkBlock += EVENT_QUERY_CHUNK_SIZE) {
            const toChunkBlock = Math.min(fromChunkBlock + EVENT_QUERY_CHUNK_SIZE - 1, latestBlock);
            console.log(`--- Scansiono chunk: ${fromChunkBlock} to ${toChunkBlock} ---`);

            // Recuperiamo gli eventi per questo chunk in parallelo
            const [listedEvents, soldEvents, cancelledEvents] = await Promise.all([
                marketplaceContract.queryFilter(listedFilter, fromChunkBlock, toChunkBlock),
                marketplaceContract.queryFilter(soldFilter, fromChunkBlock, toChunkBlock),
                marketplaceContract.queryFilter(cancelledFilter, fromChunkBlock, toChunkBlock)
            ]);

            console.log(`    Chunk <span class="math-inline">\{fromChunkBlock\}\-</span>{toChunkBlock}: Trovati ${listedEvents.length} Listed, ${soldEvents.length} Sold, ${cancelledEvents.length} Cancelled`);
            eventsProcessed += listedEvents.length + soldEvents.length + cancelledEvents.length;

            // --- Processa ItemListed ---
            for (const event of listedEvents) {
                const { tokenId, seller, price } = event.args;
                const block = await provider.getBlock(event.blockNumber); // Ottieni timestamp
                const listedAt = new Date(Number(block.timestamp) * 1000);
                const blockNumber = event.blockNumber;

                // Recupera dati aggiuntivi (opzionale, potrebbe fallire per rate limit)
                let eventId = null, originalPrice = null;
                try {
                     const ticketDataResult = await ticketNFTContract.ticketData(tokenId);
                     eventId = ticketDataResult[0];
                     originalPrice = ticketDataResult[1];
                } catch { /* ignora errore qui */ }

                // Query UPSERT: Inserisce se non esiste (basato sul constraint UNIQUE), altrimenti aggiorna
                const upsertQuery = `
                    INSERT INTO Listings (token_id, nft_contract_address, seller_address, price, event_id, original_price, is_active, listed_at, sold_at, cancelled_at, last_checked_block)
                    VALUES ($1, $2, $3, $4, $5, $6, true, $7, NULL, NULL, $8)
                    ON CONFLICT (nft_contract_address, token_id)
                    DO UPDATE SET
                        price = EXCLUDED.price,
                        seller_address = EXCLUDED.seller_address,
                        is_active = true, -- Riattiva se era stato annullato/venduto e poi ri-listato
                        listed_at = EXCLUDED.listed_at,
                        sold_at = NULL,       -- Resetta questi campi in caso di re-listing
                        cancelled_at = NULL,
                        last_checked_block = EXCLUDED.last_checked_block;
                `;
                await dbClient.query(upsertQuery, [
                    tokenId.toString(), // Salva come stringa o assicurati che il tipo DB sia BIGINT
                    ticketNFTContract.target,
                    seller,
                    price.toString(),
                    eventId ? eventId.toString() : null,
                    originalPrice ? originalPrice.toString() : null,
                    listedAt,
                    blockNumber
                ]);
                console.log(`    -> DB UPSERT Listing per tokenId ${tokenId.toString()}`);
            }

            // --- Processa ItemSold ---
            for (const event of soldEvents) {
                const { tokenId } = event.args;
                const block = await provider.getBlock(event.blockNumber);
                const soldAt = new Date(Number(block.timestamp) * 1000);
                const blockNumber = event.blockNumber;
                const updateQuery = `
                    UPDATE Listings
                    SET is_active = false, sold_at = $1, last_checked_block = $2
                    WHERE token_id = $3 AND nft_contract_address = $4 AND is_active = true;
                `;
                const res = await dbClient.query(updateQuery, [soldAt, blockNumber, tokenId.toString(), ticketNFTContract.target]);
                if (res.rowCount > 0) console.log(`    -> DB UPDATE Listing (Sold) per tokenId ${tokenId.toString()}`);
            }

             // --- Processa ListingCancelled ---
             for (const event of cancelledEvents) {
                const { tokenId } = event.args;
                const block = await provider.getBlock(event.blockNumber);
                const cancelledAt = new Date(Number(block.timestamp) * 1000);
                const blockNumber = event.blockNumber;
                const updateQuery = `
                    UPDATE Listings
                    SET is_active = false, cancelled_at = $1, last_checked_block = $2
                    WHERE token_id = $3 AND nft_contract_address = $4 AND is_active = true;
                `;
                const res = await dbClient.query(updateQuery, [cancelledAt, blockNumber, tokenId.toString(), ticketNFTContract.target]);
                 if (res.rowCount > 0) console.log(`    -> DB UPDATE Listing (Cancelled) per tokenId ${tokenId.toString()}`);
            }

             // TODO: Aggiornare il valore "last_checked_block" nella nostra ipotetica tabella SyncStatus
             // Per ora, la prossima chiamata ripartirà dall'ultimo blocco salvato in *qualsiasi* record di Listings.
        } // Fine ciclo for chunk

        console.log(`>>> Sincronizzazione eventi Marketplace completata fino al blocco ${latestBlock}. Eventi processati: ${eventsProcessed}`);
        return { scannedToBlock: latestBlock, eventsProcessed };

    } catch (error) {
         console.error("ERRORE CRITICO durante sincronizzazione eventi Marketplace:", error.code ? `${error.code} - ${error.message}` : error);
         throw new Error("Sincronizzazione eventi fallita.");
    } finally {
        if (dbClient) dbClient.release(); // Rilascia la connessione presa all'inizio
         console.log(">>> Connessione DB rilasciata per syncMarketplaceEvents.");
    }
}

module.exports = {
    syncMarketplaceEvents
};