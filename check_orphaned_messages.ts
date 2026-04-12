
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`
            SELECT DISTINCT m.account_id 
            FROM messages m 
            LEFT JOIN accounts a ON m.account_id = a.id 
            WHERE a.id IS NULL;
        `);
        console.log(JSON.stringify(rows));
    } catch (e) {
        console.error(e.message);
    }
}

main();
