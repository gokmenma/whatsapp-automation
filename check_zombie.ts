
import { db } from './src/lib/server/db/index.js';
import { accounts } from './src/lib/server/db/schema.js';
import { eq } from 'drizzle-orm';

async function check() {
    const accountId = 'ecb1b203-4dad-45ec-9e00-0a328729a083';
    const rows = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    console.log(`Account ID: ${accountId}`);
    console.log(`Found rows: ${rows.length}`);
    if (rows.length > 0) {
        console.log(`Account name: ${rows[0].name}`);
    }
    process.exit(0);
}

check().catch(console.error);
