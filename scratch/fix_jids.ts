import { db } from '../src/server/db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        console.log('Running DB update to fix 10-digit JIDs...');
        
        let result = await db.execute(sql`
            UPDATE messages
            SET contact_jid = '90' || contact_jid
            WHERE contact_jid LIKE '5_________%@s.whatsapp.net' 
               AND length(contact_jid) = 25
        `);
        console.log('Fixed 10-digit JIDs starting with 5.', result);

        result = await db.execute(sql`
            UPDATE messages
            SET contact_jid = '9' || contact_jid
            WHERE contact_jid LIKE '05_________%@s.whatsapp.net'
               AND length(contact_jid) = 26
        `);
        console.log('Fixed 11-digit JIDs starting with 05.', result);

        console.log('Done');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
