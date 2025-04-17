// packages/frontend/src/axios-config.js

import axios from 'axios';

// *** CHIEDI A LORENZO: Qual è la porta del tuo backend? ***
// Sostituisci '3000' con il numero di porta corretto su cui è in ascolto
// il tuo server backend Node.js/Express (es. 3001, 8080, etc.)
const BACKEND_PORT = 3000; // <--- MODIFICA QUESTO NUMERO DI PORTA!

const instance = axios.create({
  baseURL: `http://localhost:${BACKEND_PORT}/api`, // Imposta l'URL base per le API
  timeout: 5000, // Aggiunge un timeout di 5 secondi per le richieste
  headers: {
    'Content-Type': 'application/json', // Imposta il tipo di contenuto di default
  }
});

// Esporta l'istanza configurata
export default instance;