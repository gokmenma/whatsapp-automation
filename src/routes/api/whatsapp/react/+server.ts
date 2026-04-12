import { json, error } from '@sveltejs/kit';
import { sendWhatsAppReaction } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    try {
        const { accountId, messageId, emoji } = await request.json();

        if (!accountId || !messageId) {
            throw error(400, 'accountId and messageId are required');
        }

        // Security check: verify account belongs to user (or is admin)
        const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
        const account = accountResult[0];

        if (!account) {
            throw error(404, 'Account not found');
        }

        const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
        const isOwner = String(account.userId) === String(locals.user.id);
        const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

        if (!canAccess) {
            throw error(403, 'Erişim reddedildi');
        }

        const result = await sendWhatsAppReaction(accountId, messageId, emoji);
        return json({ success: true, result });
    } catch (e: any) {
        console.error('API React Error:', e);
        return json({ success: false, error: e.message || 'Ifade birakilemedi' }, { status: 500 });
    }
};
