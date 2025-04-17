const { pool } = require('../config/db');
const { decrypt } = require('../utils/cryptoUtils');
const { provider, ticketNFTContract, marketplaceContract } = require('../config/ethers');
const { ethers } = require('ethers');

/**
 * Recupera le offerte attive leggendo dalla tabella Listings nel database. (Invariata)
 */
const getActiveListings = async () => {
    // ... (codice getActiveListings che legge dal DB come nel messaggio precedente) ...
    console.log(">>> getActiveListings (from DB Cache): Recupero listing attive dalla tabella..."); const query = ` SELECT listing_id, token_id, nft_contract_address, seller_address, price, event_id, original_price, listed_at FROM Listings WHERE is_active = true ORDER BY listed_at DESC; `; try { const result = await pool.query(query); console.log(`>>> getActiveListings (from DB Cache): Trovate ${result.rows.length} listing attive nel DB.`); return result.rows.map(row => ({ ...row, tokenId: row.token_id.toString(), price: row.price.toString(), originalPrice: row.original_price?.toString(), eventId: row.event_id?.toString(), })); } catch (error) { console.error("ERRORE nel recuperare le listing dal DB:", error); return []; }

};


/**
 * Mette in vendita un NFT E AGGIORNA LA CACHE DB Listings.
 */
const listItemForSale = async (userId, tokenId, priceString) => {
    let dbClient;
    console.log(`INFO: Inizio listItemForSale per userId: ${userId}, tokenId: ${tokenId}, price: ${priceString}`);
    try {
        dbClient = await pool.connect(); // Ottieni connessione DB
        await dbClient.query('BEGIN'); // Inizia transazione DB

        // --- Passi 1-5: Verifica utente, ownership, decripta, crea signer, valida prezzo ---
        // [Codice omesso per brevità - come prima]
        const userQuery = 'SELECT wallet_address, encrypted_private_key FROM Users WHERE user_id = $1'; const userResult = await dbClient.query(userQuery, [userId]); if (userResult.rows.length === 0) throw new Error(`Utente ${userId} non trovato.`); const userData = userResult.rows[0]; if (!userData.wallet_address || !userData.encrypted_private_key) throw new Error(`Dati wallet/chiave mancanti utente ${userId}.`); const userWalletAddress = userData.wallet_address; const encryptedKey = userData.encrypted_private_key; const ownerOnChain = await ticketNFTContract.ownerOf(tokenId); if (ownerOnChain !== userWalletAddress) throw new Error('Non proprietario.'); let decryptedPrivateKey; try { decryptedPrivateKey = decrypt(encryptedKey); } catch (e) { throw new Error("Impossibile accedere credenziali."); } const userWallet = new ethers.Wallet(decryptedPrivateKey, provider); if (userWallet.address !== userWalletAddress) throw new Error("Errore sicurezza account."); let priceBigInt; try { priceBigInt = BigInt(priceString); if (priceBigInt <= 0) throw new Error("Prezzo positivo."); } catch (e) { throw new Error("Formato prezzo non valido."); }
        const ticketDataResult = await ticketNFTContract.ticketData(tokenId); // Recupera dati NFT
        const eventId = ticketDataResult[0]; const originalPrice = ticketDataResult[1];

        // --- 6. Transazione Approve ---
        console.log(`INFO: Invio Approve Tx...`);
        const approveTx = await ticketNFTContract.connect(userWallet).approve(marketplaceContract.target, tokenId);
        const approveReceipt = await approveTx.wait(1);
        if (approveReceipt.status !== 1) throw new Error(`Approvazione fallita (Tx: ${approveTx.hash})`);
        console.log(`INFO: Approve Tx ${approveTx.hash} completata.`);

        // --- 7. Transazione List Item ---
        console.log(`INFO: Invio listItem Tx...`);
        const listTx = await marketplaceContract.connect(userWallet).listItem(tokenId, priceBigInt);
        const listReceipt = await listTx.wait(1);
        if (listReceipt.status !== 1) throw new Error(`Listatura fallita (Tx: ${listTx.hash})`);
        console.log(`INFO: listItem Tx ${listTx.hash} completata.`);

        // === 8. AGGIORNA LA CACHE NEL DATABASE (Listings e Tickets) ===
        console.log(`INFO: Aggiorno cache DB per listing tokenId ${tokenId}...`);
        const block = await provider.getBlock(listReceipt.blockNumber);
        const listedAtTimestamp = new Date(Number(block.timestamp) * 1000);
        const blockNumber = listReceipt.blockNumber;

        // UPSERT in Listings
        const upsertListingQuery = `
            INSERT INTO Listings (token_id, nft_contract_address, seller_address, price, event_id, original_price, is_active, listed_at, sold_at, cancelled_at, last_checked_block)
            VALUES ($1, $2, $3, $4, $5, $6, true, $7, NULL, NULL, $8)
            ON CONFLICT (nft_contract_address, token_id)
            DO UPDATE SET price = EXCLUDED.price, seller_address = EXCLUDED.seller_address, is_active = true,
                          listed_at = EXCLUDED.listed_at, sold_at = NULL, cancelled_at = NULL,
                          last_checked_block = EXCLUDED.last_checked_block;
        `;
        await dbClient.query(upsertListingQuery, [ tokenId.toString(), ticketNFTContract.target, userWalletAddress, priceBigInt.toString(), eventId ? eventId.toString() : null, originalPrice ? originalPrice.toString() : null, listedAtTimestamp, blockNumber ]);

        // UPDATE in Tickets (imposta is_listed a true)
        const updateTicketQuery = `UPDATE Tickets SET is_listed = true, last_checked_block = $1 WHERE token_id = $2 AND nft_contract_address = $3;`;
        await dbClient.query(updateTicketQuery, [blockNumber, tokenId.toString(), ticketNFTContract.target]);

        console.log(`INFO: Cache DB aggiornata per listing tokenId ${tokenId}.`);
        // =======================================

        // --- 9. Successo ---
        await dbClient.query('COMMIT'); // Finalizza transazione DB
        return { approveTxHash: approveReceipt.hash, listItemTxHash: listReceipt.hash };

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Annulla transazione DB in caso di errore
        console.error(`ERRORE in listItemForSale (userId: ${userId}, tokenId: ${tokenId}):`, error);
        // ... (gestione errore come prima) ...
        throw error; // Rilancia l'errore formattato
    } finally {
        if (dbClient) dbClient.release();
    }
};

/**
 * Acquista un NFT listato E aggiorna la cache DB (Listings e Tickets).
 */
const buyListedItem = async (buyerUserId, tokenId) => {
    let dbClient;
    console.log(`INFO: Inizio buyListedItem per buyerUserId: ${buyerUserId}, tokenId: ${tokenId}`);
    try {
        // --- Passi 1-5: Verifica utente/listing, decripta chiave, crea signer ---
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // Inizia transazione DB

        const userQuery = 'SELECT user_id, wallet_address, encrypted_private_key FROM Users WHERE user_id = $1'; // Prendi anche user_id
        const userResult = await dbClient.query(userQuery, [buyerUserId]);
        if (userResult.rows.length === 0) throw new Error(`Utente acquirente ${buyerUserId} non trovato.`);
        const buyerData = userResult.rows[0];
        if (!buyerData.wallet_address || !buyerData.encrypted_private_key) throw new Error(`Dati wallet/chiave mancanti per acquirente ${buyerUserId}.`);
        const buyerWalletAddress = buyerData.wallet_address;
        const buyerEncryptedKey = buyerData.encrypted_private_key;

        // Controlla listing nel NOSTRO DB prima che on-chain (più veloce per fallimento rapido)
        const listingQuery = 'SELECT seller_address FROM Listings WHERE token_id = $1 AND nft_contract_address = $2 AND is_active = true';
        const listingResult = await dbClient.query(listingQuery, [tokenId.toString(), ticketNFTContract.target]);
        if (listingResult.rows.length === 0) throw new Error(`Biglietto ${tokenId} non risulta in vendita (cache DB).`);
        const sellerAddress = listingResult.rows[0].seller_address;
        if (buyerWalletAddress === sellerAddress) throw new Error("Non puoi comprare il tuo biglietto.");

        // Verifica stato on-chain per sicurezza aggiuntiva (opzionale ma consigliato)
        const listingDataOnChain = await marketplaceContract.listings(tokenId);
        if (!listingDataOnChain.active || listingDataOnChain.seller !== sellerAddress) throw new Error(`Stato listing on-chain non valido/cambiato per ${tokenId}.`);

        let decryptedBuyerKey; try { decryptedBuyerKey = decrypt(buyerEncryptedKey); } catch (e) { throw new Error("Impossibile accedere credenziali acquirente."); }
        const buyerWallet = new ethers.Wallet(decryptedBuyerKey, provider);
        if (buyerWallet.address !== buyerWalletAddress) throw new Error("Errore sicurezza account acquirente.");

        // --- 6. Esegui buyItem on-chain ---
        console.log(`INFO: Invio buyItem Tx per tokenId ${tokenId} da ${buyerWalletAddress}...`);
        const buyTx = await marketplaceContract.connect(buyerWallet).buyItem(tokenId);
        const buyReceipt = await buyTx.wait(1);
        if (buyReceipt.status !== 1) throw new Error(`Acquisto fallito on-chain (Tx: ${buyTx.hash})`);
        console.log(`INFO: buyItem Tx ${buyTx.hash} completata.`);

        // === 7. AGGIORNA LA CACHE NEL DATABASE (Listings e Tickets) ===
        console.log(`INFO: Aggiorno cache DB per vendita tokenId ${tokenId}...`);
        const block = await provider.getBlock(buyReceipt.blockNumber);
        const soldAtTimestamp = new Date(Number(block.timestamp) * 1000);
        const blockNumber = buyReceipt.blockNumber;

        // Aggiorna Listings (segna come non attivo)
        const updateListingQuery = `UPDATE Listings SET is_active = false, sold_at = $1, last_checked_block = $2 WHERE token_id = $3 AND nft_contract_address = $4;`;
        await dbClient.query(updateListingQuery, [ soldAtTimestamp, blockNumber, tokenId.toString(), ticketNFTContract.target ]);

        // Aggiorna Tickets (cambia proprietario e segna non listato)
        const updateTicketQuery = `UPDATE Tickets SET owner_user_id = $1, owner_wallet_address = $2, is_listed = false, last_checked_block = $3 WHERE token_id = $4 AND nft_contract_address = $5;`;
        await dbClient.query(updateTicketQuery, [ buyerUserId, buyerWalletAddress, blockNumber, tokenId.toString(), ticketNFTContract.target ]);

        console.log(`INFO: Cache DB aggiornata per vendita tokenId ${tokenId}.`);
        // =======================================

        // --- 8. Successo ---
        await dbClient.query('COMMIT'); // Finalizza transazione DB
        return { buyTxHash: buyReceipt.hash };

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Annulla transazione DB
        console.error(`ERRORE in buyListedItem (buyerUserId: ${buyerUserId}, tokenId: ${tokenId}):`, error);
        // ... (gestione errore come prima) ...
        throw error; // Rilancia errore formattato
    } finally {
        if (dbClient) dbClient.release();
    }
};


/**
 * Annulla la messa in vendita di un NFT E aggiorna la cache DB (Listings e Tickets).
 */
const cancelListingForUser = async (userId, tokenId) => {
    let dbClient;
    console.log(`INFO: Inizio cancelListingForUser per userId: ${userId}, tokenId: ${tokenId}`);
    try {
        // --- Passi 1-4: Verifica utente/listing/venditore, decripta chiave, crea signer ---
        dbClient = await pool.connect();
        await dbClient.query('BEGIN'); // Inizia transazione DB

        const userQuery = 'SELECT wallet_address, encrypted_private_key FROM Users WHERE user_id = $1';
        const userResult = await dbClient.query(userQuery, [userId]);
        if (userResult.rows.length === 0) throw new Error(`Utente ${userId} non trovato.`);
        const userData = userResult.rows[0];
        if (!userData.wallet_address || !userData.encrypted_private_key) throw new Error(`Dati wallet/chiave mancanti utente ${userId}.`);
        const userWalletAddress = userData.wallet_address;
        const encryptedKey = userData.encrypted_private_key;

        // Verifica listing ON-CHAIN prima di tentare l'annullamento
        const listingData = await marketplaceContract.listings(tokenId);
        if (!listingData.active) throw new Error(`Offerta per ${tokenId} non attiva sulla blockchain.`);
        if (listingData.seller !== userWalletAddress) throw new Error(`Non puoi annullare offerta altrui.`);
        console.log(`INFO: Confermata listing attiva on-chain per tokenId ${tokenId} da ${userWalletAddress}.`);

        let decryptedPrivateKey; try { decryptedPrivateKey = decrypt(encryptedKey); } catch (e) { throw new Error("Impossibile accedere credenziali."); }
        const userWallet = new ethers.Wallet(decryptedPrivateKey, provider);
        if (userWallet.address !== userWalletAddress) throw new Error("Errore sicurezza account.");

        // --- 5. Esegui cancelListing on-chain ---
        console.log(`INFO: Invio cancelListing Tx per tokenId ${tokenId}...`);
        const cancelTx = await marketplaceContract.connect(userWallet).cancelListing(tokenId);
        const cancelReceipt = await cancelTx.wait(1);
        if (cancelReceipt.status !== 1) throw new Error(`Annullamento fallito on-chain (Tx: ${cancelTx.hash})`);
        console.log(`INFO: cancelListing Tx ${cancelTx.hash} completata.`);

        // === 6. AGGIORNA LA CACHE NEL DATABASE (Listings e Tickets) ===
        console.log(`INFO: Aggiorno cache DB per annullamento tokenId ${tokenId}...`);
        const block = await provider.getBlock(cancelReceipt.blockNumber);
        const cancelledAtTimestamp = new Date(Number(block.timestamp) * 1000);
        const blockNumber = cancelReceipt.blockNumber;

        // Aggiorna Listings
        const updateListingQuery = `UPDATE Listings SET is_active = false, cancelled_at = $1, last_checked_block = $2 WHERE token_id = $3 AND nft_contract_address = $4;`;
        await dbClient.query(updateListingQuery, [ cancelledAtTimestamp, blockNumber, tokenId.toString(), ticketNFTContract.target ]);

        // Aggiorna Tickets (imposta is_listed a false)
        const updateTicketQuery = `UPDATE Tickets SET is_listed = false, last_checked_block = $1 WHERE token_id = $2 AND nft_contract_address = $3;`;
        await dbClient.query(updateTicketQuery, [blockNumber, tokenId.toString(), ticketNFTContract.target]);

        console.log(`INFO: Cache DB aggiornata per annullamento tokenId ${tokenId}.`);
        // =======================================

        // --- 7. Successo ---
        await dbClient.query('COMMIT'); // Finalizza transazione DB
        return { cancelTxHash: cancelReceipt.hash };

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK'); // Annulla transazione DB
        console.error(`ERRORE in cancelListingForUser (userId: ${userId}, tokenId: ${tokenId}):`, error);
        // ... (gestione errore come prima) ...
        throw error; // Rilancia errore formattato
    } finally {
        if (dbClient) dbClient.release();
    }
};


module.exports = {
    getActiveListings,      // Legge SOLO dal DB Cache
    listItemForSale,        // Scrive on-chain E aggiorna cache DB (Listings, Tickets)
    buyListedItem,          // Scrive on-chain E aggiorna cache DB (Listings, Tickets)
    cancelListingForUser    // Scrive on-chain E aggiorna cache DB (Listings, Tickets)
};