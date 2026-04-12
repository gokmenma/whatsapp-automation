
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`SELECT DISTINCT account_id FROM messages;`);
        console.log(JSON.stringify(rows));
    } catch (e) {
        console.error(e.message);
    }
}

main();
