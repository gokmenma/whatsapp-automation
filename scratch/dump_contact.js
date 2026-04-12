import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = '.baileys_auth';
const TARGET_JID = '905077403957@s.whatsapp.net';

async function dump() {
    const files = fs.readdirSync(AUTH_PATH);
    const storeFiles = files.filter(f => f.startsWith('store-') && f.endsWith('.json'));

    for (const file of storeFiles) {
        const accountId = file.replace('store-', '').replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(AUTH_PATH, file), 'utf-8'));
        const contacts = new Map(data.contacts || []);
        const contact = contacts.get(TARGET_JID);
        
        if (contact) {
            console.log(`Account ${accountId} has contact ${TARGET_JID}:`);
            console.log(JSON.stringify(contact, null, 2));
        } else {
            // console.log(`Account ${accountId} does NOT have contact ${TARGET_JID}`);
        }
    }
}

dump();
