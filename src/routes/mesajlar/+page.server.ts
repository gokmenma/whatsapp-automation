import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAllAccounts } from '$lib/whatsapp';

export const load = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const userIdInt = Number(locals.user.id);
    const dbAccountsResult = await db.select().from(accounts).where(eq(accounts.userId, userIdInt));
    const liveAccounts = dbAccountsResult.length > 0 ? await getAllAccounts(dbAccountsResult) : [];

    const hasReadyAccount = liveAccounts.some(acc => acc.status === 'ready');

    if (!hasReadyAccount) {
        throw redirect(303, '/hesaplar?error=need_active_account');
    }

    return {};
};
