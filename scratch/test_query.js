
import { db } from './src/lib/server/db/index.js';
import { logs, accounts } from './src/lib/server/db/schema.js';
import { desc, eq } from 'drizzle-orm';

async function test() {
    const userId = 13;
    console.log('Testing getLogs for userId:', userId);
    
    try {
        const query = db.select({
            id: logs.id,
            accountId: logs.accountId,
            accountName: accounts.name,
            userId: accounts.userId
        })
        .from(logs)
        .leftJoin(accounts, eq(logs.accountId, accounts.id));

        const results = await query.where(eq(accounts.userId, userId)).execute();
        console.log('Results found:', results.length);
        if (results.length > 0) {
            console.log('First result:', JSON.stringify(results[0]));
        } else {
            // Try without the where clause to see if join works at all
            const allJoined = await query.limit(5).execute();
            console.log('All joined (no filter) results:', allJoined.length);
            if (allJoined.length > 0) {
                console.log('First joined row accounts.userId:', typeof allJoined[0].userId, allJoined[0].userId);
            }
        }
    } catch (e) {
        console.error('Test failed:', e);
    }
    process.exit(0);
}

test();
