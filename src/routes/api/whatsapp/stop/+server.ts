import { json } from '@sveltejs/kit';
import { stopWhatsApp } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { hasPermission } from '$lib/server/permissions';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    const { accountId } = await request.json();
    
    if (!accountId) {
        return json({ success: false, error: 'Hesap ID gereklidir.' }, { status: 400 });
    }

    try {
        // Check if user is the owner OR has pool_stop permission
        const canStopPool = await hasPermission(locals.user, 'action:pool_stop');
        
        const accountResult = await db.select().from(accounts).where(
            eq(accounts.id, accountId)
        ).limit(1);
        const account = accountResult[0];

        if (!account) {
            return json({ success: false, error: 'Hesap bulunamadı.' }, { status: 404 });
        }

        const isOwner = String(account.userId) === String(locals.user.id);
        
        if (!isOwner && !canStopPool) {
            return json({ success: false, error: 'Hesabı durdurma yetkiniz yok.' }, { status: 403 });
        }

        // 2. Stop the WhatsApp client session (keeps data for quick restart)
        await stopWhatsApp(accountId);
        
        return json({ success: true, message: `Account ${accountId} stopped` });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
