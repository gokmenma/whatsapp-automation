
import { db } from '../src/lib/server/db/index.js';
import { accounts } from '../src/lib/server/db/schema.js';
import { like } from 'drizzle-orm';

async function main() {
    const rows = await db.select().from(accounts).where(like(accounts.name, '%kend%'));
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
}

main().catch(console.error);
