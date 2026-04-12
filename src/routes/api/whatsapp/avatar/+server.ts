import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getWhatsAppAvatarUrl } from '$lib/whatsapp';

export const GET = async ({ url, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = String(url.searchParams.get('accountId') || '').trim();
    const jid = String(url.searchParams.get('jid') || '').trim();
    if (!accountId || !jid) {
        return json({ error: 'accountId ve jid gerekli' }, { status: 400 });
    }

    const accountResult = await db.select().from(accounts)
        .where(and(eq(accounts.id, accountId), eq(accounts.userId, locals.user.id)))
        .limit(1);
    const account = accountResult[0];

    if (!account) {
        return json({ error: 'Erisim reddedildi' }, { status: 403 });
    }

    const avatarUrl = await getWhatsAppAvatarUrl(accountId, jid);
    return json({ success: true, avatarUrl });
};