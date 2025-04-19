const { pool } = require('../config/db'); // Importiamo il pool di connessioni DB
const bcrypt = require('bcrypt');
const { ethers } = require('ethers'); // Per generare il wallet address
const { encrypt } = require('../utils/cryptoUtils'); // <-- Importa encrypt dalla nostra utility

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


module.exports = {
    createUser,
    findUserByUsername, // Assicurati sia esportato
    updateUserWalletPreference
};