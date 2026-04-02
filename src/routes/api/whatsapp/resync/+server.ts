import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { resyncWhatsAppAccount } from '$lib/whatsapp';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId } = await request.json();
    if (!accountId) {
        return json({ success: false, error: 'accountId gerekli' }, { status: 400 });
    }

    try {
        const account = await db
            .select()
            .from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.userId, locals.user.id)))
            .get();

        if (!account) {
            return json({ success: false, error: 'Hesap bulunamadı veya yetkiniz yok' }, { status: 404 });
        }

        const result = await resyncWhatsAppAccount(accountId);

        return json({
            success: true,
            message: 'Hesap senkronu yeniden baslatildi',
            refreshedGroupCount: result.refreshedGroupCount ?? 0
        });
    } catch (e: any) {
        return json({ success: false, error: e?.message || 'Resync basarisiz' }, { status: 500 });
    }
}
