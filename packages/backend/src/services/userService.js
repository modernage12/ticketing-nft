const { pool } = require('../config/db'); // Importiamo il pool di connessioni DB
const bcrypt = require('bcrypt');
const { ethers } = require('ethers'); // Per generare il wallet address
const { encrypt, decrypt } = require('../utils/cryptoUtils'); // <-- Importa encrypt dalla nostra utility
const { provider } = require('../config/ethers');

const SALT_ROUNDS = 10; // Costo computazionale per l'hashing bcrypt

const createUser = async (username, password, registerAsCreator) => {
    // 1. Hash della password (invariato)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 2. Genera un nuovo wallet Ethereum/Polygon
    const newWallet = ethers.Wallet.createRandom();
    const walletAddress = newWallet.address;
    const privateKey = newWallet.privateKey; // Otteniamo la chiave privata (include '0x')

    // 3. CRIPTA la chiave privata prima di salvarla!
    let encryptedPrivateKeyData;
    try {
         // Usiamo la nostra funzione helper encrypt
         encryptedPrivateKeyData = encrypt(privateKey);
         console.log(`Chiave privata per ${username} criptata con successo.`);
    } catch (encryptError) {
         // Gestisci l'errore di crittografia - forse non continuare la registrazione?
         console.error(`Errore CRITICO durante la crittografia della chiave per ${username}:`, encryptError);
         // Rilanciamo un errore generico per non esporre dettagli interni
         throw new Error("Errore interno durante la preparazione sicura dell'account.");
    }


    // 4. Inserisci nel database (CORRETTO)
    const query = `
        INSERT INTO Users (
            username,       -- $1
            password_hash,  -- $2
            wallet_address, -- $3
            encrypted_private_key, -- $4
            is_admin,       -- $5
            is_creator,     -- $6
            wallet_preference -- $7
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7) -- Ora 7 placeholders
        RETURNING user_id, username, wallet_address, created_at, is_admin, is_creator, wallet_preference; -- Restituisci anche i nuovi campi
    `;
    const values = [
        username,           // $1
        passwordHash,       // $2
        walletAddress,      // $3
        encryptedPrivateKeyData, // $4
        false,              // $5: is_admin (sempre false alla registrazione)
        registerAsCreator,  // $6: is_creator (dal parametro della funzione)
        'internal'          // $7: wallet_preference (default 'internal')
    ]; // Ora 7 valori, corrispondenti ai placeholders

    try {
        const result = await pool.query(query, values);
        console.log(`Utente ${username} (${walletAddress}) creato con ID: ${result.rows[0].user_id}`);
        // Restituiamo i dati SENZA la chiave criptata o l'hash password
        return {
             user_id: result.rows[0].user_id,
             username: result.rows[0].username,
             wallet_address: result.rows[0].wallet_address,
             created_at: result.rows[0].created_at
         };
    } catch (error) {
        console.error("Errore nell'inserimento utente nel DB:", error);
        // Rilanciamo l'errore (il controller lo gestirà, es. per username duplicato)
        throw error;
    }
};

// Funzione per trovare utente (invariata)
const findUserByUsername = async (username) => {
    const query = 'SELECT * FROM users WHERE LOWER(username) = LOWER($1)';
    try {
        const result = await pool.query(query, [username]);
        return result.rows[0]; // Restituisce l'utente se trovato, altrimenti undefined
    } catch (error) {
        console.error("Errore nella ricerca utente per username:", error);
        throw error; // Rilancia per gestione nel controller
    }
};

/**
 * Aggiorna la preferenza del wallet per un utente specifico.
 * @param {number} userId L'ID dell'utente.
 * @param {'internal' | 'external'} walletPreference La nuova preferenza.
 * @returns {Promise<boolean>} True se l'aggiornamento ha avuto successo.
 */
const updateUserWalletPreference = async (userId, walletPreference) => {
    // Validazione semplice del valore della preferenza
    if (walletPreference !== 'internal' && walletPreference !== 'external') {
        throw new Error('Valore non valido per walletPreference.');
    }
    const query = `
        UPDATE users
        SET wallet_preference = $1
        WHERE user_id = $2;
    `;
    try {
        const result = await pool.query(query, [walletPreference, userId]);
        // result.rowCount dovrebbe essere 1 se l'utente è stato trovato e aggiornato
        return result.rowCount === 1;
    } catch (error) {
        console.error(`Errore nell'aggiornare wallet_preference per userId ${userId}:`, error);
        throw new Error('Errore database durante aggiornamento preferenza wallet.');
    }
};

// --- INIZIO NUOVA FUNZIONE getUserSigner ---

/**
 * Recupera la chiave privata criptata di un utente dal DB, la decripta
 * e restituisce un oggetto Wallet (Signer) di Ethers.js.
 * @param {number} userId L'ID dell'utente.
 * @returns {Promise<ethers.Wallet>} Oggetto Wallet/Signer connesso al provider.
 * @throws Se l'utente non viene trovato, la chiave non è disponibile/decriptabile, o errore DB/crypto.
 */
const getUserSigner = async (userId) => {
    console.log(`userService: Tentativo di ottenere signer per userId: ${userId}`);

    // 1. Trova la chiave privata criptata nel DB
    const query = 'SELECT encrypted_private_key FROM users WHERE user_id = $1';
    let encryptedKeyData;
    try {
        const result = await pool.query(query, [userId]);
        if (result.rows.length === 0) {
            throw new Error(`Utente con ID ${userId} non trovato.`);
        }
        if (!result.rows[0].encrypted_private_key) {
             throw new Error(`Chiave privata criptata non trovata per l'utente ${userId}.`);
        }
        encryptedKeyData = result.rows[0].encrypted_private_key;
        // Nota: encryptedKeyData qui è probabilmente l'oggetto { iv: '...', content: '...' } restituito da encrypt
        console.log(`userService: Chiave criptata recuperata per userId: ${userId}`);

    } catch (dbError) {
        console.error(`userService: Errore DB recupero chiave per userId ${userId}:`, dbError);
        throw new Error('Errore database durante recupero dati utente.');
    }

    // 2. Decripta la chiave privata
    let decryptedPrivateKey;
    try {
        // Chiama la funzione decrypt (assumendo che esista e funzioni correttamente)
        decryptedPrivateKey = decrypt(encryptedKeyData);
        if (!decryptedPrivateKey || !decryptedPrivateKey.startsWith('0x')) {
             throw new Error('Decriptazione chiave fallita o formato non valido.');
        }
        console.log(`userService: Chiave privata decriptata con successo per userId: ${userId}`);
    } catch (decryptError) {
        console.error(`userService: Errore decrittografia chiave per userId ${userId}:`, decryptError);
        throw new Error('Errore durante la decrittografia della chiave privata.');
    }

    // 3. Crea l'oggetto Wallet/Signer Ethers.js
    try {
        if (!provider) {
            throw new Error("Provider Ethers non disponibile/importato in userService.");
        }
        // Crea il wallet usando la chiave decifrata e il provider importato
        const userWallet = new ethers.Wallet(decryptedPrivateKey, provider);
        console.log(`userService: Signer creato per indirizzo ${userWallet.address} (userId: ${userId})`);
        return userWallet; // Restituisce l'oggetto Wallet (che è un Signer)

    } catch (walletError) {
        console.error(`userService: Errore creazione Wallet Ethers per userId ${userId}:`, walletError);
        throw new Error('Errore durante la creazione del signer utente.');
    }
};

// --- FINE NUOVA FUNZIONE getUserSigner ---


module.exports = {
    createUser,
    findUserByUsername, // Assicurati sia esportato
    updateUserWalletPreference,
    getUserSigner
};