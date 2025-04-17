const indexingService = require('../services/indexingService');

const triggerSync = async (req, res) => {
    console.log("Ricevuta richiesta API per triggerare sync...");
    try {
        // Chiamata asincrona, ma non aspettiamo qui per non bloccare la risposta API
        // In un sistema reale useremmo code o processi background
        indexingService.syncMarketplaceEvents()
            .then(result => console.log("Sync completato in background:", result))
            .catch(error => console.error("Errore sync in background:", error));

        // Rispondiamo subito che la sincronizzazione è stata avviata
        res.status(202).json({ message: 'Sincronizzazione eventi avviata in background.' });
    } catch (error) {
        console.error("Errore nell'avviare la sincronizzazione:", error);
        res.status(500).json({ error: 'Impossibile avviare la sincronizzazione.' });
    }
};

module.exports = { triggerSync };