// 1. Carica le variabili d'ambiente dal file .env come primissima cosa
require('dotenv').config();

// 2. Importa i moduli necessari
const express = require('express');
const cors = require('cors');
const { provider } = require('./config/ethers'); // Importa solo il provider se non serve altro qui
require('./config/db.js'); // Esegue il codice di connessione al DB (che stampa il log)

// Importa i router
const contractInfoRoutes = require('./routes/contractInfoRoutes');
const authRoutes = require('./routes/authRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const eventRoutes = require('./routes/eventRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes'); // <-- Importa
const internalRoutes = require('./routes/internalRoutes');

// 3. Crea l'applicazione Express
const app = express();
const port = process.env.PORT || 3000;

// 4. Configura CORS in modo più completo
const corsOptions = {
  origin: 'http://localhost:5173', // Assicurati che la porta sia quella del tuo frontend Vue
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Specifica i metodi HTTP permessi
  allowedHeaders: "Content-Type, Authorization", // Specifica gli header permessi (fondamentale per il token JWT!)
  optionsSuccessStatus: 200 // Per compatibilità
};
app.use(cors(corsOptions)); // Applica il middleware CORS PRIMA delle rotte

// 5. Applica altri middleware globali
app.use(express.json()); // Permette di leggere il corpo JSON delle richieste POST/PUT

// 6. Monta i router delle API
app.use('/api/auth', authRoutes);
app.use('/api/contracts', contractInfoRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/internal', internalRoutes);

// 7. Route di base (opzionale)
app.get('/', (req, res) => {
  res.send('Backend Ticketing NFT funzionante!');
});

// 8. Avvia il server
app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
  // Verifichiamo la connessione Ethers qui (o potremmo toglierla ora che sappiamo che funziona)
  provider.getNetwork().then(network => {
      console.log(`Connesso alla rete: ${network.name} (Chain ID: ${network.chainId})`);
  }).catch(error => {
      console.error("Errore connessione provider Ethers all'avvio:", error);
  });
});