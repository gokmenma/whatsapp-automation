
import { db } from './src/lib/server/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        const rows = await db.all(sql`SELECT * FROM messages LIMIT 100;`);
        console.log(JSON.stringify(rows));
    } catch (e) {
        console.error(e.message);
    }
}

main();
