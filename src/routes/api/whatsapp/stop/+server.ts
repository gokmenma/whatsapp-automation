import { json } from '@sveltejs/kit';
import { stopWhatsApp } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { accountId } = await request.json();
    
    if (!accountId) {
        return json({ success: false, error: 'Hesap ID gereklidir.' }, { status: 400 });
    }

    try {
        // 1. Verify account ownership
        const account = await db.select().from(accounts).where(
            and(
                eq(accounts.userId, locals.user.id),
                eq(accounts.id, accountId)
            )
        ).get();

        if (!account) {
            return json({ success: false, error: 'Hesap bulunamadı veya yetkiniz yok.' }, { status: 404 });
        }

        // 2. Stop the WhatsApp client session (keeps data for quick restart)
        await stopWhatsApp(accountId);
        
        return json({ success: true, message: `Account ${accountId} stopped` });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
