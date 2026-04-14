import { db } from './src/lib/server/db/index.js';
import { conversationPreferences } from './src/lib/server/db/schema.js';
import { eq, and } from 'drizzle-orm';

async function main() {
    const accountId = '9851bbd4-67d8-4051-afbb-597a6d73f5f3';
    try {
        const prefs = await db.select().from(conversationPreferences).where(eq(conversationPreferences.accountId, accountId));
        console.log('Conversation Preferences:', JSON.stringify(prefs, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
}

main();
