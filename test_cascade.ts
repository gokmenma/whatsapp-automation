
import { db } from './src/lib/server/db';
import { accounts, messages } from './src/lib/server/db/schema';
import { eq } from 'drizzle-orm';

async function testCascade() {
    try {
        // Find an account that has messages
        const accs = await db.select().from(accounts).limit(1);
        if (accs.length === 0) {
            console.log("No accounts to test");
            return;
        }
        const accId = accs[0].id;
        console.log(`Testing cascade for account ${accId}`);
        
        const msgCountBefore = (await db.select().from(messages).where(eq(messages.accountId, accId))).length;
        console.log(`Messages before: ${msgCountBefore}`);
        
        if (msgCountBefore === 0) {
            console.log("Adding a test message...");
            await db.insert(messages).values({
                id: `${accId}:test`,
                accountId: accId,
                contactJid: 'test@s.whatsapp.net',
                fromMe: true,
                body: 'test',
                timestamp: new Date()
            });
        }
        
        console.log("Deleting account...");
        await db.delete(accounts).where(eq(accounts.id, accId));
        
        const msgCountAfter = (await db.select().from(messages).where(eq(messages.accountId, accId))).length;
        console.log(`Messages after: ${msgCountAfter}`);
        
        if (msgCountAfter === 0) {
            console.log("CASCADE WORKED!");
        } else {
            console.log("CASCADE FAILED!");
        }
    } catch (e) {
        console.error(e.message);
    }
}

testCascade();
