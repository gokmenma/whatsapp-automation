
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`SELECT account_id, contact_jid, body FROM messages LIMIT 20;`);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

main();
