import { db } from './src/lib/server/db/index.ts';
import { logs } from './src/lib/server/db/schema.ts';
import { desc } from 'drizzle-orm';

async function main() {
    const latestLogs = await db.select().from(logs).orderBy(desc(logs.timestamp)).limit(5);
    console.log(JSON.stringify(latestLogs, null, 2));
}

main().catch(console.error);
