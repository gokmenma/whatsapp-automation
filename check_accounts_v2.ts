
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`SELECT id, name, user_id FROM accounts;`);
        console.log(JSON.stringify(rows, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

main();
