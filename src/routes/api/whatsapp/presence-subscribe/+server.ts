import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { subscribeToPresence } from '$lib/whatsapp';

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const payload = await request.json().catch(() => ({}));
        const accountId = String(payload?.accountId || '').trim();
        const jid = String(payload?.jid || '').trim();

        if (!accountId || !jid) {
            return json({ success: false, error: 'accountId ve jid gerekli' }, { status: 400 });
        }

        const accountResult = await db.select().from(accounts)
            .where(eq(accounts.id, accountId))
            .limit(1);
        const account = accountResult[0];

        const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
        const isOwner = account && String(account.userId) === String(locals.user.id);
        const canAccess = isOwner || (account && isAdminOrSuper && !account.isPrivate);

        if (!account || !canAccess) {
            return json({ success: false, error: 'Erişim reddedildi' }, { status: 403 });
        }

        const subscribed = await subscribeToPresence(accountId, jid);
        return json({ success: true, subscribed });
    } catch (err: any) {
        return json({ success: false, error: err?.message || 'presence-subscribe-failed' }, { status: 500 });
    }
};
