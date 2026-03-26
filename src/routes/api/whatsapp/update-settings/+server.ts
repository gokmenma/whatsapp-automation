import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const { accountId, autoReply, autoReplyMessage, isDefault } = await request.json();
    
    if (isDefault) {
        // Clear default for all other accounts of this user
        await db.update(accounts)
            .set({ isDefault: false })
            .where(eq(accounts.userId, locals.user.id));
    }

    const result = await db.update(accounts)
        .set({ autoReply, autoReplyMessage, isDefault })
        .where(and(eq(accounts.id, accountId), eq(accounts.userId, locals.user.id)))
        .returning();

    if (result.length === 0) {
        return json({ success: false, error: 'Hesap bulunamadı veya yetkiniz yok.' });
    }

    return json({ success: true });
};
