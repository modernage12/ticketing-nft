// IMPORT NECESSARI ALL'INIZIO DEL FILE
const { pool } = require('../config/db');
// ASSUMIAMO CHE 'ethersConfig' ESPORTI provider, ticketNFTContract (con ABI/address), e minterWallet (signer owner)
const { provider, ticketNFTContract, marketplaceContract, minterWallet } = require('../config/ethers');
// IMPORTA ethers SE NON GIA' PRESENTE IN ethersConfig O SE SERVE ALTROVE
const { ethers } = require('ethers'); // Serve per ethers.isAddress
const userService = require('./userService');

// --- INIZIO CODICE NUOVO DA INCOLLARE (sostituisce la vecchia createEvent) ---

// Sostituisci l'intera funzione createEvent esistente con questa:
const createEvent = async (eventData) => {
    const {
        name, date, location, totalTickets, priceWei, // Già Wei (stringa)
        description, imageUrl, creatorAddress
    } = eventData;

    // Validazione indirizzo creatore (già presente e corretta)
    if (!creatorAddress || !ethers.isAddress(creatorAddress)) {
        console.error("ERRORE SERVICE: creatorAddress non valido:", creatorAddress);
        throw new Error("Indirizzo creatore non valido fornito al service.");
    }

    let newEvent; // Variabile per l'evento creato nel DB

    // ---- PRIMA PARTE: Salva nel Database ----
    // (Questa parte rimane invariata rispetto al tuo file attuale)
    try {
        const query = `
            INSERT INTO events (
                name, date, location, total_tickets, original_price, description, image_url, tickets_minted
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [
            name, date, location, totalTickets, priceWei, description, imageUrl, 0
        ];

        console.log("Eseguo query DB per creare evento:", values);
        const result = await pool.query(query, values);

        if (result.rows.length > 0) {
            newEvent = result.rows[0];
            console.log("Evento creato nel DB:", newEvent);
        } else {
            throw new Error('Creazione evento fallita nel DB.');
        }
    } catch (dbError) {
        console.error('Errore DB durante creazione evento:', dbError);
        throw new Error('Operazione DB fallita durante creazione evento.');
    }

    // ---- SECONDA PARTE: Registra On-Chain (ASINCRONO) ----
    // (Questa parte viene modificata per non attendere 'tx.wait()')

    let onChainTxHash = null; // Per memorizzare l'hash

    // Verifica che l'evento sia stato creato nel DB prima di procedere
    if (!newEvent || !newEvent.event_id) {
         console.error("ERRORE INTERNO: newEvent non definito dopo insert DB! Salto registrazione on-chain.");
         // Restituiamo comunque l'evento DB (senza hash)
         return { ...newEvent, onChainTxHash: null };
    }

    // Se l'evento DB esiste, invia la transazione on-chain
    console.log(`---> Avvio registrazione on-chain per evento ID: ${newEvent.event_id}`);
    const eventId = newEvent.event_id;
    const originalPriceBigInt = BigInt(newEvent.original_price);

    try {
        // Verifica disponibilità wallet e contratto (già presente e corretta)
        if (!minterWallet) throw new Error("minterWallet non disponibile.");
        if (!ticketNFTContract || !ticketNFTContract.target) throw new Error("ticketNFTContract o il suo indirizzo non disponibili.");

        console.log(`     Dettagli On-Chain: Evento ${eventId}, Creatore ${creatorAddress}, Prezzo ${originalPriceBigInt.toString()} Wei`);
        console.log(`     Contratto: ${ticketNFTContract.target}, Wallet firmatario: ${minterWallet.address}`);

        // --- INVIO TRANSAZIONE (SENZA ATTENDERE CONFERMA) ---
        const tx = await ticketNFTContract.connect(minterWallet).registerEvent(
            eventId,
            creatorAddress,
            originalPriceBigInt
        );
        // -----------------------------------------------------

        onChainTxHash = tx.hash; // Salva l'hash subito dopo l'invio
        console.log(`     Transazione inviata! Hash: ${onChainTxHash}`);
        console.log(`     La conferma verrà gestita in background (non attesa).`);

        // --- GESTIONE ASINCRONA DELLA CONFERMA (NON BLOCCANTE) ---
        // Aggiungiamo un gestore per loggare l'esito quando avverrà
        tx.wait(1).then(receipt => {
            if (receipt && receipt.status === 1) {
                console.log(`---> CONFERMA ASYNC On-Chain: Evento ${eventId} registrato! Blocco: ${receipt.blockNumber}, Tx: ${tx.hash}`);
            } else {
                console.error(`---> FALLIMENTO ASYNC On-Chain: Registrazione evento ${eventId} fallita (reverted?). Tx Hash: ${tx.hash}, Receipt Status: ${receipt?.status}`);
            }
        }).catch(waitError => {
            console.error(`---> ERRORE ASYNC On-Chain durante attesa conferma per evento ${eventId}, Tx: ${tx.hash}:`, waitError);
        });
        // ------------------------------------------------------------

    } catch (contractError) {
        // Gestisce errori DURANTE L'INVIO della transazione
        let reason = contractError.reason || contractError.message || "Errore sconosciuto durante invio tx on-chain";
        console.error(`---> ERRORE On-Chain durante invio tx per evento ${eventId}: ${reason}`, contractError.code ? `(Code: ${contractError.code})` : '', contractError);
        // Logghiamo l'errore ma NON lo rilanciamo, perché l'evento nel DB è valido.
        // L'hash rimarrà null, indicando che l'invio on-chain è fallito.
    }

    // ---- PARTE FINALE: Restituisci Risultato ----
    // Restituisce i dati dell'evento dal DB e l'hash (se l'invio è avvenuto)
    return {
       ...newEvent,             // Campi dell'evento (event_id, name, ...)
       onChainTxHash: onChainTxHash // Hash della transazione (o null se invio fallito)
   };
}; // Fine della funzione createEvent aggiornata

// --- FINE CODICE NUOVO DA INCOLLARE ---

// Assicurati che alla fine del file ci sia l'export corretto per questa funzione,
// ad esempio, se usi module.exports:
// module.exports = {
//    createEvent,
//    // ...altre funzioni del service...
// };
// Se usi export:
// export { createEvent };

/**
 * Recupera tutti gli eventi dal database.
 */
const getAllEvents = async () => {
    // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
    const query = `
        SELECT event_id, name, description, date, location, original_price, total_tickets, tickets_minted
        FROM events ORDER BY date ASC;
        -- Assumendo che la tabella e la colonna 'date' siano state create in minuscolo (default)
    `;
    try {
        const result = await pool.query(query);
        console.log(`INFO: Recuperati ${result.rows.length} eventi dal DB.`);
        return result.rows.map(event => ({
            ...event,
            original_price: event.original_price?.toString(),
            // La colonna 'date' nel DB è timestamp with time zone, pg la restituisce come Date object
            // quindi toISOString() funziona. Se fosse stata solo 'date' senza fuso, sarebbe diverso.
            date: event.date?.toISOString()
        }));
    } catch (error) {
        console.error("ERRORE in getAllEvents service:", error);
        throw new Error('Errore durante il recupero degli eventi.');
    }
};

/**
 * Minta un nuovo biglietto NFT per un utente, dopo aver controllato la disponibilità nel DB,
 * e aggiorna la tabella Tickets nel DB.
 */
const mintTicketForUser = async (userId, userWalletAddress, eventId) => {
    if (!minterWallet) throw new Error('Wallet minter non inizializzato.');

    let dbClient;
    console.log(`INFO: Inizio mintTicketForUser per userId: ${userId}, userWallet: ${userWalletAddress}, eventId: ${eventId}`);
    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        // --- 1. Recupera dettagli Evento e VERIFICA DISPONIBILITA' dal DB ---
        // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
        const eventQuery = `
            SELECT original_price, tickets_minted, total_tickets
            FROM events WHERE event_id = $1 FOR UPDATE;
        `;
        const eventResult = await dbClient.query(eventQuery, [eventId]);

        if (eventResult.rows.length === 0) { throw new Error(`Evento con ID ${eventId} non trovato.`); }

        const eventData = eventResult.rows[0];
        const dbOriginalPrice = eventData.original_price;
        const ticketsMinted = parseInt(eventData.tickets_minted, 10);
        const totalTickets = parseInt(eventData.total_tickets, 10);

        // Controllo disponibilità
        if (ticketsMinted >= totalTickets) {
            await dbClient.query('ROLLBACK');
            console.warn(`WARN: Tentativo minting fallito per evento ${eventId} - Esaurito (${ticketsMinted}/${totalTickets})`);
            throw new Error(`Biglietti esauriti per l'evento ${eventId}.`);
        }

        const priceForContract = BigInt(dbOriginalPrice);
        console.log(`INFO: Evento ${eventId}: Prezzo ${priceForContract}, Disponibili ${totalTickets - ticketsMinted}/${totalTickets}. Procedo...`);

        // --- 2. Chiama la funzione mintTicket on-chain ---
        console.log(`INFO: Invio mintTicket Tx per user ${userWalletAddress}...`);
        const tx = await ticketNFTContract.connect(minterWallet).mintTicket(userWalletAddress, eventId, priceForContract);
        const receipt = await tx.wait(1);
        if (receipt.status !== 1) throw new Error(`Minting fallito on-chain (Tx: ${tx.hash})`);
        console.log(`INFO: mintTicket Tx ${tx.hash} completata nel blocco ${receipt.blockNumber}.`);

        const transferEvent = receipt.logs?.find(log => log.fragment?.name === 'Transfer' && log.args?.to === userWalletAddress);
        const mintedTokenId = transferEvent ? transferEvent.args.tokenId : null;
        if (mintedTokenId === null) throw new Error("Token ID mintato non trovato negli eventi.");
        console.log(`INFO: Minted tokenId: ${mintedTokenId.toString()}`);

         // --- 3. Aggiorna il contatore tickets_minted nella tabella Events ---
         // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
         const updateEventQuery = `UPDATE events SET tickets_minted = tickets_minted + 1 WHERE event_id = $1;`;
         await dbClient.query(updateEventQuery, [eventId]);
         console.log(`INFO: Contatore DB tickets_minted aggiornato per eventId: ${eventId}`);

         // === 4. AGGIUNGI IL NUOVO BIGLIETTO ALLA TABELLA Tickets ===
         // === QUERY CORRETTA: usa nomi minuscoli senza virgolette ===
         const block = await provider.getBlock(receipt.blockNumber);
         const issuanceTimestamp = new Date(Number(block.timestamp) * 1000);
         const insertTicketQuery = `
            INSERT INTO tickets (token_id, nft_contract_address, owner_wallet_address, owner_user_id, event_id, original_price, issuance_date, is_listed, last_checked_block)
            VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8);
            -- Assumendo nomi colonna minuscoli anche per Tickets
         `;
         await dbClient.query(insertTicketQuery, [
            mintedTokenId.toString(), ticketNFTContract.target, userWalletAddress, userId,
            eventId, priceForContract.toString(), issuanceTimestamp, receipt.blockNumber
         ]);
         console.log(`INFO: Nuovo biglietto (tokenId: ${mintedTokenId.toString()}) inserito nella tabella Tickets.`);

         // --- 5. Completa la Transazione DB e Restituisci il risultato ---
         await dbClient.query('COMMIT');
         return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, tokenId: mintedTokenId.toString() };

    } catch (error) {
        if (dbClient) await dbClient.query('ROLLBACK');
        console.error(`ERRORE in mintTicketForUser (eventId: ${eventId}):`, error);
        if (error.code === 'INSUFFICIENT_FUNDS') throw new Error('Fondi insufficienti wallet minter per gas.');
        // Se l'errore originale è quello della relazione non esistente, rendilo più chiaro
        if (error.code === '42P01') throw new Error(`Tabella necessaria non trovata nel DB (${error.message}).`);
        throw new Error(error.message || 'Errore durante il minting.');
    } finally {
         if (dbClient) dbClient.release();
    }
};

// Nuova funzione in eventService.js

/**
 * Gestisce l'acquisto primario di un biglietto da parte di un utente.
 * Chiama buyAndMintTicket sul contratto TicketNFT usando la chiave dell'utente.
 * @param {number} userId - L'ID dell'utente che acquista.
 * @param {number} eventId - L'ID dell'evento da acquistare.
 * @returns {Promise<object>} - Oggetto con dettagli della transazione/biglietto.
 */
const purchasePrimaryTicket = async (userId, eventId) => {
    console.log(`---> Avvio acquisto primario per Utente ID: ${userId}, Evento ID: ${eventId}`);

    let eventDetails;
    let userSigner;

    try {
        // --- 1. Recupera Dettagli Evento dal DB ---
        console.log(`     Recupero dettagli evento ${eventId} dal DB...`);
        const eventQuery = await pool.query(
            'SELECT event_id, name, original_price, total_tickets, tickets_minted FROM events WHERE event_id = $1',
            [eventId]
        );

        if (eventQuery.rows.length === 0) {
            throw new Error(`Evento con ID ${eventId} non trovato.`);
        }
        eventDetails = eventQuery.rows[0];

        // Verifica disponibilità biglietti
        if (eventDetails.tickets_minted >= eventDetails.total_tickets) {
            throw new Error(`Biglietti esauriti per l'evento ${eventId}.`);
        }
        console.log(`     Evento trovato: ${eventDetails.name}, Prezzo: ${ethers.formatEther(eventDetails.original_price)} MATIC, Disponibili: ${eventDetails.total_tickets - eventDetails.tickets_minted}`);

        // --- 2. Recupera Dettagli Commissione dal Marketplace Contract ---
        console.log(`     Recupero dettagli commissione da Marketplace Contract (${marketplaceContract.target})...`);
        // Verifica che il contratto sia disponibile
         if (!marketplaceContract || !marketplaceContract.target) {
             throw new Error("Istanza contratto Marketplace non disponibile.");
         }
        const feeBps = await marketplaceContract.serviceFeeBasisPoints();
        const serviceWallet = await marketplaceContract.serviceWallet(); // Indirizzo che riceve la fee
        if (!serviceWallet || serviceWallet === ethers.ZeroAddress) {
             throw new Error("Indirizzo wallet servizio non configurato correttamente nel Marketplace contract.");
        }
        console.log(`     Fee: ${Number(feeBps) / 100}%, Wallet Servizio: ${serviceWallet}`);

        // --- 3. Calcola Costo Totale ---
        const originalPriceBigInt = BigInt(eventDetails.original_price);
        const serviceFeeBigInt = (originalPriceBigInt * feeBps) / 10000n; // Usa 10000n per BigInt
        const totalDueBigInt = originalPriceBigInt + serviceFeeBigInt;
        console.log(`     Costo Totale Calcolato: ${ethers.formatEther(totalDueBigInt)} MATIC (Prezzo: ${ethers.formatEther(originalPriceBigInt)}, Fee: ${ethers.formatEther(serviceFeeBigInt)})`);

        // --- 4. Ottieni il Signer dell'Utente ---
        console.log(`     Ottenimento signer per utente ID: ${userId}...`);
        // !!! PARTE DELICATA: dipende da come gestisci le chiavi !!!
        // Assumiamo una funzione che recupera la chiave criptata e la decripta.
        // Questa funzione POTREBBE richiedere la password dell'utente o usare una chiave master.
        try {
             // Questa funzione è un ESEMPIO, devi implementarla o adattarla!
            // RIGA MODIFICATA:
            userSigner = await userService.getUserSigner(userId);
            if (!userSigner) {
                throw new Error("Impossibile ottenere il signer per l'utente.");
            }       
            console.log(`     Signer ottenuto per indirizzo: ${await userSigner.getAddress()}`);
             // Verifica fondi (opzionale ma utile)
             // RIGA CORRETTA:
            const userBalance = await provider.getBalance(await userSigner.getAddress()); // Assumiamo 'provider' esportato da ethersConfig
            console.log(`     Saldo utente: ${ethers.formatEther(userBalance)} MATIC`);
            if (userBalance < totalDueBigInt) {
                throw new Error(`Fondi insufficienti per l'utente ${userId}. Richiesti: ${ethers.formatEther(totalDueBigInt)} MATIC`);
            }
        }
        catch (signerError) {
            console.error(`Errore ottenimento/verifica signer per utente ${userId}:`, signerError);
            throw new Error(`Impossibile procedere all'acquisto: ${signerError.message}`);
        }


        // --- 5. Esegui Transazione On-Chain ---
        console.log(`     Invio transazione buyAndMintTicket per evento ${eventId} con valore ${ethers.formatEther(totalDueBigInt)} MATIC...`);
         if (!ticketNFTContract || !ticketNFTContract.target) {
             throw new Error("Istanza contratto TicketNFT non disponibile.");
         }

        const tx = await ticketNFTContract.connect(userSigner).buyAndMintTicket(
            eventId,
            {
                value: totalDueBigInt,
                // Potresti aggiungere gasLimit qui se necessario, come per registerEvent
                // gasLimit: 500000n
            }
        );

        console.log(`     Transazione buyAndMintTicket inviata! Hash: ${tx.hash}`);
        console.log(`     In attesa di conferma...`);
        const receipt = await tx.wait(1);

        // --- 6. Gestisci Risultato On-Chain ---
        if (receipt && receipt.status === 1) {
            console.log(`---> SUCCESSO On-Chain: Acquisto per evento ${eventId} completato! Blocco: ${receipt.blockNumber}, Tx: ${receipt.hash}`);

            // --- 7. Estrai Token ID dai Log ---
            let mintedTokenId = null;
            try {
                // L'ABI del contratto è già noto all'istanza usata per inviare la tx,
                // quindi Ethers v6 dovrebbe aver già parsato i log.
                // Cerchiamo l'evento Transfer standard ERC721 emesso dal contratto TicketNFT
                const transferEventSignature = 'Transfer(address,address,uint256)';
                const ticketNFTInterface = new ethers.Interface(ticketNFTContract.interface.fragments); // Usa l'interfaccia del contratto

                for (const log of receipt.logs) {
                     // Confronta l'indirizzo del log con quello del contratto NFT
                     if (log.address.toLowerCase() === ticketNFTContract.target.toLowerCase()) {
                        try {
                            const parsedLog = ticketNFTInterface.parseLog(log);
                            if (parsedLog && parsedLog.name === 'Transfer') {
                                // Controlla se è un evento di mint (from == address(0))
                                if (parsedLog.args.from === ethers.ZeroAddress) {
                                    mintedTokenId = parsedLog.args.tokenId;
                                    console.log(`     Token ID mintato estratto dai log: ${mintedTokenId.toString()}`);
                                    break; // Trovato, esci dal ciclo
                                }
                            }
                        } catch (parseError) {
                           // Ignora log che non corrispondono all'ABI del TicketNFT
                           // console.debug("Log non parsabile con ABI TicketNFT:", log);
                        }
                    }
                }

                if (mintedTokenId === null) {
                    console.error("ERRORE CRITICO: Impossibile estrarre il tokenId mintato dai log della transazione!", receipt.logs);
                    // Potremmo lanciare un errore qui o procedere senza tokenId, ma è rischioso per la consistenza DB
                    throw new Error("Estrazione Token ID fallita dopo minting on-chain.");
                }
            } catch (logError) {
                console.error("ERRORE durante l'estrazione del Token ID dai log:", logError);
                // Rilancia l'errore perché senza Token ID non possiamo aggiornare il DB correttamente
                throw logError;
            }


            // --- 8. Aggiorna Database (INSERT Ticket, UPDATE Event) ---
            console.log("     Aggiornamento database...");
            const dbClient = await pool.connect(); // Ottieni un client dal pool per la transazione DB
            try {
                await dbClient.query('BEGIN'); // Inizia la transazione DB

                // Recupera il timestamp del blocco
                const block = await provider.getBlock(receipt.blockNumber);
                const issuanceTimestamp = new Date(Number(block.timestamp) * 1000);
                const ownerWalletAddress = await userSigner.getAddress();

                // Inserisci il nuovo biglietto nella tabella 'tickets'
                const insertTicketQuery = `
                    INSERT INTO tickets (
                        token_id, nft_contract_address, owner_wallet_address, owner_user_id,
                        event_id, original_price, issuance_date, is_listed, last_checked_block
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
                    RETURNING db_ticket_id;
                `;
                const insertTicketValues = [
                    mintedTokenId.toString(),   // token_id (convertito in stringa se BigInt)
                    ticketNFTContract.target,   // nft_contract_address
                    ownerWalletAddress,         // owner_wallet_address
                    userId,                     // owner_user_id
                    eventId,                    // event_id
                    eventDetails.original_price,// original_price (già nel formato corretto dal DB)
                    issuanceTimestamp,          // issuance_date
                    receipt.blockNumber         // last_checked_block
                ];
                const ticketResult = await dbClient.query(insertTicketQuery, insertTicketValues);
                console.log(`     Nuovo record inserito nella tabella 'tickets' (ID: ${ticketResult.rows[0].ticket_id})`);

                // Aggiorna il contatore 'tickets_minted' nella tabella 'events'
                const updateEventQuery = `
                    UPDATE events
                    SET tickets_minted = tickets_minted + 1
                    WHERE event_id = $1;
                `;
                await dbClient.query(updateEventQuery, [eventId]);
                console.log(`     Contatore 'tickets_minted' incrementato per evento ${eventId}.`);

                await dbClient.query('COMMIT'); // Conferma la transazione DB
                console.log("     Aggiornamento database completato con successo.");

                // --- 9. Restituisci Risultato Completo ---
                return {
                    success: true,
                    message: "Acquisto completato con successo!",
                    transactionHash: receipt.hash,
                    tokenId: mintedTokenId.toString(), // Restituisci il tokenId reale
                    blockNumber: receipt.blockNumber,
                    eventId: eventId
                };

            } catch (dbError) {
                await dbClient.query('ROLLBACK'); // Annulla la transazione DB in caso di errore
                console.error("ERRORE durante l'aggiornamento del database dopo minting:", dbError);
                // Lancia un errore specifico per indicare che l'aggiornamento DB è fallito
                // L'acquisto on-chain è avvenuto, ma il DB non è consistente! Richiede attenzione.
                throw new Error(`Minting on-chain completato (Tx: ${receipt.hash}), ma aggiornamento DB fallito: ${dbError.message}`);
            } finally {
                dbClient.release(); // Rilascia sempre il client DB
            }

        } else { // Se receipt.status !== 1 (transazione on-chain fallita/reverted)
            console.error(`---> FALLIMENTO On-Chain: Acquisto per evento ${eventId} fallito (reverted?). Tx Hash: ${tx?.hash}, Receipt Status: ${receipt?.status}`);
            // Cerca di estrarre il motivo del revert, se disponibile nella ricevuta (Ethers v6 potrebbe averlo)
            let revertReason = "La transazione on-chain è fallita (reverted).";
            // Nota: l'errore originale catturato nel blocco catch esterno potrebbe avere più dettagli sul revert
            // throw new Error(revertReason); // Rilancia con motivo specifico se possibile
             throw new Error(`La transazione on-chain per l'acquisto è fallita (reverted).`); // Errore generico
        }

    } catch (error) { // Blocco catch esterno per errori generali (es. ottenimento signer, chiamata contratto iniziale, errori DB non gestiti)
        console.error(`ERRORE CRITICO durante purchasePrimaryTicket per Utente ${userId}, Evento ${eventId}:`, error.reason || error.message || error);
        // Prova a dare un messaggio più utile basato sull'errore catturato
        let userFriendlyMessage = 'Acquisto fallito';
        if (error.code === 'INSUFFICIENT_FUNDS') {
             userFriendlyMessage = 'Fondi insufficienti nel wallet per completare l\'acquisto (prezzo + gas).';
        } else if (error.message.includes('Evento non trovato')) {
             userFriendlyMessage = 'Evento specificato non trovato nel database.';
        } else if (error.message.includes('Biglietti esauriti')) {
             userFriendlyMessage = 'I biglietti per questo evento sono esauriti.';
        } else if (error.message.includes('Estrazione Token ID fallita')) {
            userFriendlyMessage = 'Acquisto on-chain riuscito, ma errore interno nel processare il risultato.'; // Segnala problema interno
        } else if (error.message.includes('aggiornamento DB fallito')) {
             userFriendlyMessage = 'Acquisto on-chain riuscito, ma errore interno nell\'aggiornare i dati.'; // Segnala problema interno
        } else if (error.code === 'CALL_EXCEPTION' || error.message.toLowerCase().includes('reverted')) {
            // Errore generico da revert del contratto, se non catturato specificamente prima
             userFriendlyMessage = 'La transazione è stata rifiutata dal contratto.';
             // Potresti provare ad estrarre error.reason qui se disponibile
        } else if (error.message.includes('Impossibile procedere all\'acquisto')) {
             userFriendlyMessage = `Impossibile procedere: ${error.message.split(': ')[1]}`; // Usa messaggio da errore signer/recupero chiave
        }
        // Rilancia l'errore con un messaggio più strutturato o solo il messaggio user-friendly
        throw new Error(`${userFriendlyMessage}`); // Passa solo il messaggio pulito al controller
    }
};

module.exports = {
    getAllEvents,
    mintTicketForUser,
    createEvent,
    purchasePrimaryTicket
};