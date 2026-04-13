import { json } from '@sveltejs/kit';
import { removeAccount } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();
    
    if (!accountId) {
        return json({ success: false, error: 'Account ID is required' }, { status: 400 });
    }

    try {
        // First verify ownership
        const account = await db.select().from(accounts).where(
            and(
                eq(accounts.id, accountId),
                eq(accounts.userId, Number(locals.user.id))
            )
        ).limit(1);

        if (account.length === 0) {
            return json({ success: false, error: 'Hesap bulunamadı veya yetkiniz yok' }, { status: 404 });
        }

        // First delete from database so it disappears from UI immediately
        await db.delete(accounts).where(eq(accounts.id, accountId));

        // Now remove from WhatsApp instances (and delete session data/logout) in background-ready way
        await removeAccount(accountId);
        
        return json({ success: true, message: `Account ${accountId} removed` });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
