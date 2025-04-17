

// Importiamo la classe Pool dalla libreria 'pg'
const { Pool } = require('pg');

// Creiamo un nuovo Pool di connessioni usando la stringa dal file .env
// Il Pool gestisce più connessioni per efficienza.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Potremmo aggiungere opzioni SSL qui se ci connettessimo a un DB cloud in produzione
    // ssl: {
    //   rejectUnauthorized: false // Necessario per alcuni servizi cloud con certificati self-signed
    // }
});

// Testiamo la connessione al primo avvio (opzionale ma utile)
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('!!! ERRORE Connessione Database !!!', err.stack);
    } else {
        console.log('>>> Connessione al Database PostgreSQL stabilita con successo alle:', res.rows[0].now);
    }
});

// Esportiamo il pool (o un metodo query) per usarlo nel resto dell'applicazione
module.exports = {
    pool,
    // Potremmo esportare una funzione query specifica per centralizzare le query:
    // query: (text, params) => pool.query(text, params),
};