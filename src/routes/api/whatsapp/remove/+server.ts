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
        // Delete from DB first (only if owned by user)
        const deletedResult = await db.delete(accounts).where(
            and(
                eq(accounts.userId, locals.user.id),
                eq(accounts.id, accountId)
            )
        ).returning();

        if (deletedResult.length === 0) {
            return json({ success: false, error: 'Account not found or not owned by you' }, { status: 404 });
        }

        // Now remove from WhatsApp instances (and delete session data)
        await removeAccount(accountId);
        
        return json({ success: true, message: `Account ${accountId} removed` });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
