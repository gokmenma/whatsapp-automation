
import { db } from './src/lib/server/db';
import { accounts, messages } from './src/lib/server/db/schema';

async function restore() {
    try {
        await db.insert(accounts).values({
            id: 'b7109d14-44e5-48fc-bbb5-79e3f26a7b34',
            name: 'Kendi Hesabım',
            userId: '13',
            createdAt: new Date(),
            autoReply: false,
            autoReplyMessage: 'Merhaba, şu an müsait değilim...'
        }).onConflictDoNothing();
        
        await db.insert(messages).values([
            {
                id: "b7109d14-44e5-48fc-bbb5-79e3f26a7b34:3EB0A23F342657AA546D8B",
                accountId: "b7109d14-44e5-48fc-bbb5-79e3f26a7b34",
                contactJid: "905077403957@s.whatsapp.net",
                fromMe: true,
                body: "test",
                mediaType: null,
                timestamp: new Date(1775301492000),
                status: "delivered",
                isRead: true
            },
            {
                id: "b7109d14-44e5-48fc-bbb5-79e3f26a7b34:AC00EAD4E332D51FA282E42F3A59DF51",
                accountId: "b7109d14-44e5-48fc-bbb5-79e3f26a7b34",
                contactJid: "905079432723@s.whatsapp.net",
                fromMe: false,
                body: "Test 28",
                mediaType: null,
                timestamp: new Date(1775301629000),
                status: "read",
                isRead: true
            }
        ]).onConflictDoNothing();
        console.log("Restored!");
    } catch (e) {
        console.error(e.message);
    }
}

restore();
