const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const AUTH_PATH = '.baileys_auth';

function normalizeDigits(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.split('@')[0].split(':')[0].replace(/\D/g, '');
}

async function run() {
    const stores = new Map();
    const files = fs.readdirSync(AUTH_PATH).filter(f => f.startsWith('store-') && f.endsWith('.json'));
    
    for (const f of files) {
        const accountId = f.replace('store-', '').replace('.json', '');
        try {
            const data = JSON.parse(fs.readFileSync(path.join(AUTH_PATH, f), 'utf-8'));
            const lidToJid = new Map();
            const contacts = new Map(data.contacts || []);
            
            contacts.forEach((c, id) => {
                if (c.lid && id.endsWith('@s.whatsapp.net')) {
                    lidToJid.set(c.lid.toLowerCase(), id);
                }
            });
            
            stores.set(accountId, { lidToJid, contacts });
        } catch (e) {}
    }

    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await conn.execute('SELECT DISTINCT contact_jid FROM messages');
    
    console.log(`Found ${rows.length} unique JIDs in database.`);

    for (const row of rows) {
        const jid = row.contact_jid;
        if (!jid || jid.endsWith('@g.us')) continue;

        const digits = normalizeDigits(jid);
        if (digits.length > 13) {
            console.log(`Checking potential LID JID: ${jid}`);
            
            // Try to find a mapping in ANY store
            let resolvedJid = null;
            const lid = jid.toLowerCase().includes('@lid') ? jid.toLowerCase() : `${digits}@lid`;
            
            for (const [accId, store] of stores.entries()) {
                const phoneJid = store.lidToJid.get(lid);
                if (phoneJid) {
                    resolvedJid = phoneJid;
                    console.log(`  -> Mapping found in ${accId}: ${resolvedJid}`);
                    break;
                }
            }

            if (resolvedJid) {
                const [res] = await conn.execute('UPDATE messages SET contact_jid = ? WHERE contact_jid = ?', [resolvedJid, jid]);
                console.log(`  -> Updated ${res.changedRows} rows in DB.`);
            } else {
                console.log(`  -> No mapping found for ${jid} in any store.`);
            }
        }
    }

    await conn.end();
}

run().catch(console.error);
