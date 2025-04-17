// Importiamo il modulo 'crypto' integrato in Node.js
const crypto = require('crypto');

// Definiamo l'algoritmo di crittografia simmetrica
// AES-256-GCM è uno standard moderno e sicuro che fornisce anche autenticazione (integrità) dei dati
const algorithm = 'aes-256-gcm';

// Leggiamo la chiave segreta dal file .env
// DEVE essere una chiave di 32 byte (64 caratteri esadecimali)
const secretKeyHex = process.env.ENCRYPTION_KEY;
let secretKey;

// Verifichiamo la chiave all'avvio del modulo
if (!secretKeyHex || secretKeyHex.length !== 64) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("ERRORE CRITICO: La variabile ENCRYPTION_KEY nel file .env è MANCANTE o NON VALIDA.");
    console.error("Deve essere una stringa esadecimale di 64 caratteri (32 byte).");
    console.error("Generane una con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error("Il backend non può funzionare in modo sicuro senza questa chiave.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    // Blocchiamo l'avvio se la chiave non è valida
    process.exit(1);
} else {
    secretKey = Buffer.from(secretKeyHex, 'hex');
    console.log(">>> Chiave di crittografia caricata correttamente.");
}


// Lunghezza standard per l'Initialization Vector (IV) per AES-GCM
const ivLength = 16; // 16 byte raccomandati per GCM
// Lunghezza standard per l'Authentication Tag generato da AES-GCM
const authTagLength = 16;

/**
 * Cripta un testo usando AES-256-GCM.
 * @param {string} text Il testo in chiaro da criptare (es. la chiave privata).
 * @returns {string} Una stringa contenente IV:AuthTag:TestoCriptato, codificati in esadecimale.
 */
function encrypt(text) {
    try {
        const iv = crypto.randomBytes(ivLength); // Genera un IV casuale e unico per ogni operazione
        const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

        // Aggiorniamo il cipher con il testo da criptare
        let encrypted = cipher.update(text, 'utf8', 'hex');
        // Finalizziamo la crittografia
        encrypted += cipher.final('hex');
        // Otteniamo l'Authentication Tag (essenziale per GCM per verificare l'integrità)
        const authTag = cipher.getAuthTag();

        // Combiniamo IV, AuthTag e testo criptato in una singola stringa, separati da ':'
        // e codificati in esadecimale per una facile memorizzazione.
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("Errore durante la crittografia:", error);
        throw new Error("Impossibile criptare i dati.");
    }
}

/**
 * Decripta una stringa precedentemente criptata con la funzione encrypt.
 * Verifica l'autenticità usando l'AuthTag.
 * @param {string} encryptedData La stringa nel formato "ivHex:authTagHex:encryptedTextHex".
 * @returns {string} Il testo originale in chiaro.
 * @throws {Error} Se i dati non sono nel formato atteso, la chiave è errata, o la verifica di autenticità fallisce.
 */
function decrypt(encryptedData) {
    try {
        // Dividiamo la stringa nei suoi componenti basandoci sul separatore ':'
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            throw new Error("Formato dati criptati non valido (devono esserci 3 parti separate da ':')");
        }

        // Riconvertiamo le parti esadecimali in Buffer
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = parts[2];

        // Controllo di sicurezza aggiuntivo sulle lunghezze (paranoia check)
        if (iv.length !== ivLength || authTag.length !== authTagLength) {
             throw new Error("Lunghezza IV o AuthTag non corrispondente a quanto atteso per AES-GCM.");
        }

        // Creiamo il decipher specificando l'algoritmo, la chiave segreta e l'IV recuperato
        const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
        // Impostiamo l'Authentication Tag recuperato. Questo è FONDAMENTALE per GCM.
        // Se l'authTag non corrisponde a quello calcolato durante la decrittografia, .final() lancerà un errore.
        decipher.setAuthTag(authTag);

        // Decriptiamo il testo
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8'); // final() verifica anche l'authTag

        return decrypted; // Restituiamo il testo in chiaro (la chiave privata)
    } catch (error) {
        console.error("Errore durante la decrittografia o verifica fallita:", error);
        // Non rivelare dettagli specifici dell'errore di crittografia al chiamante per sicurezza
        throw new Error("Impossibile decriptare i dati o verifica autenticità fallita.");
    }
}

// Esportiamo le due funzioni per poterle usare altrove
module.exports = { encrypt, decrypt };