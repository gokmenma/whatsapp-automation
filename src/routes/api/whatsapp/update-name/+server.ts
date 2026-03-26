import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountId, newName } = await request.json();

    if (!accountId || !newName || !newName.trim()) {
        return json({ error: 'Missing accountId or newName' }, { status: 400 });
    }

    try {
        const result = await db.update(accounts)
            .set({ name: newName.trim() })
            .where(
                and(
                    eq(accounts.id, accountId),
                    eq(accounts.userId, locals.user.id)
                )
            );

        return json({ success: true });
    } catch (e: any) {
        console.error('Update name error:', e);
        return json({ error: e.message || 'Update failed' }, { status: 500 });
    }
};
