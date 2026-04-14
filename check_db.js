import { db } from './src/lib/server/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const [rows] = await db.execute(sql`
            SELECT account_id, COUNT(*) as count, MIN(timestamp) as oldest, MAX(timestamp) as newest 
            FROM messages 
            GROUP BY account_id
        `);
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
