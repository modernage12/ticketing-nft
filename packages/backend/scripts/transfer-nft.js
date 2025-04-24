// packages/backend/scripts/transfer-nft.js

const path = require('path');
// Carica dotenv per le variabili d'ambiente (come DATABASE_URL, JWT_SECRET, INFURA_AMOY_URL etc.)
// Assicurati che il percorso al file .env sia corretto rispetto a dove esegui lo script
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Importa il servizio utenti (che contiene la logica per ottenere il signer)
// ADATTA IL PERCORSO SE NECESSARIO
const userService = require('../src/services/userService'); // O dove si trova getUserSigner
const { ethers } = require('ethers'); // <== AGGIUNGI QUESTA RIGA

// Importa la configurazione di ethers (provider, ABI contratti)
// ADATTA IL PERCORSO SE NECESSARIO
const { provider, getContractInstance } = require('../src/config/ethers'); // Assumendo che ethers.js esporti queste cose
const TicketNFTJson = require('../src/contracts/abi/TicketNFT.json'); // Assicurati che l'ABI sia qui

// --- CONFIGURA QUESTI VALORI ---
const USER_ID_OWNER = 6; // <== METTI L'ID DEL TUO UTENTE nel DB
const TOKEN_ID_TO_TRANSFER = 3; // <== METTI L'ID DEL TOKEN DA TRASFERIRE
const TARGET_EXTERNAL_ADDRESS = '0x35645af8176A62ED217e4294eabE02e449c24782'; // Il tuo indirizzo Brave
const TICKET_NFT_CONTRACT_ADDRESS = '0x64afF703E9A973A55cf23ecb616768930454a2b6';
// --------------------------------

async function main() {
    console.log(`--- Avvio Script Trasferimento NFT ---`);
    console.log(`Utente proprietario (ID): ${USER_ID_OWNER}`);
    console.log(`Token ID da trasferire: ${TOKEN_ID_TO_TRANSFER}`);
    console.log(`Indirizzo Destinatario: ${TARGET_EXTERNAL_ADDRESS}`);
    console.log(`Contratto NFT: ${TICKET_NFT_CONTRACT_ADDRESS}`);

    if (!USER_ID_OWNER || !TOKEN_ID_TO_TRANSFER || !TARGET_EXTERNAL_ADDRESS || !TICKET_NFT_CONTRACT_ADDRESS) {
        console.error("ERRORE: Configurare tutti i valori necessari nello script.");
        return;
    }

    try {
        // 1. Ottieni il signer per il wallet interno dell'utente
        console.log(`Ottenimento signer per utente ${USER_ID_OWNER}...`);
        // Assumiamo che getUserSigner richieda l'ID utente e la password o usi una chiave interna
        // Se richiede la password, dovrai trovarla o modificare temporaneamente la funzione
        // per usare una chiave di decrypt fissa se necessario (solo per questo script!)
        const internalWalletSigner = await userService.getUserSigner(USER_ID_OWNER); // ADATTA se la funzione richiede altri parametri (es. password)
        if (!internalWalletSigner) {
            throw new Error(`Impossibile ottenere il signer per l'utente ${USER_ID_OWNER}. Verifica la logica in userService.`);
        }
        const internalAddress = await internalWalletSigner.getAddress();
        console.log(`Signer per wallet interno ${internalAddress} ottenuto.`);

        // 2. Ottieni istanza del contratto NFT connessa al signer interno
        console.log(`Connessione al contratto NFT (${TICKET_NFT_CONTRACT_ADDRESS})...`);
        const ticketNFTContract = new ethers.Contract(
            TICKET_NFT_CONTRACT_ADDRESS,
            TicketNFTJson.abi,
            internalWalletSigner // Usa il signer del wallet interno!
        );

        // (Opzionale) Verifica proprietà prima del trasferimento
        console.log(`Verifica proprietà attuale del Token ID ${TOKEN_ID_TO_TRANSFER}...`);
        const currentOwner = await ticketNFTContract.ownerOf(TOKEN_ID_TO_TRANSFER);
        console.log(`Proprietario attuale on-chain: ${currentOwner}`);
        if (currentOwner.toLowerCase() !== internalAddress.toLowerCase()) {
            throw new Error(`Il proprietario on-chain (<span class="math-inline">\{currentOwner\}\) non corrisponde all'indirizzo del wallet interno \(</span>{internalAddress})! Impossibile trasferire.`);
        }
        console.log(`Proprietà confermata.`);

        // 3. Chiama safeTransferFrom
        console.log(`Invio transazione safeTransferFrom...`);
        console.log(`  Da: ${internalAddress}`);
        console.log(`  A:  ${TARGET_EXTERNAL_ADDRESS}`);
        console.log(`  ID: ${TOKEN_ID_TO_TRANSFER}`);

        const tx = await ticketNFTContract.safeTransferFrom(
            internalAddress,
            TARGET_EXTERNAL_ADDRESS,
            TOKEN_ID_TO_TRANSFER
            // Potresti voler aggiungere opzioni gas qui se necessario: { gasLimit: 300000 }
        );

        console.log(`Transazione inviata! Hash: ${tx.hash}`);
        console.log(`In attesa di conferma...`);

        // 4. Attendi conferma
        const receipt = await tx.wait(1); // Attendi 1 blocco di conferma

        if (receipt.status === 1) {
            console.log(`--- SUCCESSO! ---`);
            console.log(`Trasferimento completato nel blocco: ${receipt.blockNumber}`);
            console.log(`Token ID ${TOKEN_ID_TO_TRANSFER} ora dovrebbe appartenere a ${TARGET_EXTERNAL_ADDRESS}`);

            // !!! IMPORTANTE !!!
            // Dovresti aggiornare manualmente il database backend qui!
            // L'NFT ora appartiene a un wallet esterno, quindi dovrai fare un UPDATE sulla tabella 'tickets':
            // - Cambiare owner_user_id (magari a NULL o a un ID utente associato all'esterno se ce l'hai)
            // - Cambiare owner_wallet_address a TARGET_EXTERNAL_ADDRESS
            // - Impostare is_listed = false
            console.warn("!!! RICORDA DI AGGIORNARE MANUALMENTE IL DATABASE (tabella 'tickets') per riflettere il nuovo proprietario !!!");

        } else {
            console.error(`--- FALLIMENTO ON-CHAIN ---`);
            console.error(`La transazione è stata inclusa ma è fallita (reverted). Status: ${receipt.status}`);
        }

    } catch (error) {
        console.error(`--- ERRORE DURANTE LO SCRIPT ---`);
        console.error(error);
    } finally {
        console.log(`--- Script Trasferimento NFT Terminato ---`);
        // Potrebbe essere necessario chiudere connessioni al DB se userService le apre
        // await db.pool.end(); // Esempio se usi un pool pg
    }
}

// Esegui la funzione main
main();