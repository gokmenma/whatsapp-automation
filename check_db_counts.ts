
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`SELECT account_id, COUNT(*) as cnt FROM messages GROUP BY account_id;`);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

main();
