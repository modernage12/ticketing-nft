const express = require('express');
const router = express.Router();
const contractInfoController = require('../controllers/contractInfoController'); // Importeremo il controller tra poco

// Definiamo le rotte per le informazioni sui contratti

// GET /api/contracts/addresses
router.get('/addresses', contractInfoController.getContractAddresses);

// GET /api/contracts/marketplace-owner
router.get('/marketplace-owner', contractInfoController.getMarketplaceOwner);

module.exports = router; // Esportiamo il router