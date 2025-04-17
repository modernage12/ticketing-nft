const { pool } = require('../config/db'); // Importiamo il pool di connessioni DB
const bcrypt = require('bcrypt');
const { ethers } = require('ethers'); // Per generare il wallet address
const { encrypt } = require('../utils/cryptoUtils'); // <-- Importa encrypt dalla nostra utility

const SALT_ROUNDS = 10; // Costo computazionale per l'hashing bcrypt

const createUser = async (username, password) => {
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


    // 4. Inserisci nel database (includendo la chiave criptata)
    //    Assicurati che la colonna nel DB si chiami 'encrypted_private_key'
    const query = `
        INSERT INTO Users (username, password_hash, wallet_address, encrypted_private_key)
        VALUES ($1, $2, $3, $4)
        RETURNING user_id, username, wallet_address, created_at;
        -- Non restituiamo la chiave criptata per sicurezza
    `;
    // Passiamo i valori corretti, inclusa la chiave criptata (formato iv:authTag:key)
    const values = [username, passwordHash, walletAddress, encryptedPrivateKeyData];

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
    const query = 'SELECT * FROM Users WHERE username = $1';
    try {
        const result = await pool.query(query, [username]);
        return result.rows[0]; // Restituisce l'utente se trovato, altrimenti undefined
    } catch (error) {
        console.error("Errore nella ricerca utente per username:", error);
        throw error; // Rilancia per gestione nel controller
    }
};

module.exports = {
    createUser,
    findUserByUsername // Assicurati sia esportato
};