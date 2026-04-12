
import { globalRef } from './src/lib/whatsapp';

function main() {
    const stores = globalRef.baileysStores;
    if (!stores) {
        console.log("No stores");
        return;
    }
    for (const [accountId, store] of stores.entries()) {
        console.log(`Account ID: ${accountId}`);
        for (const [jid, contact] of store.contacts.entries()) {
            console.log(`  ${jid}: ${contact.name || contact.pushName || contact.notify || 'unknown'}`);
        }
    }
}

main();
