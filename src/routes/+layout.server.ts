import { db } from '$lib/server/db';
import { accounts, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAllAccounts } from '$lib/whatsapp';

export const load = async ({ locals }) => {
    if (!locals.user) return { user: null, accounts: [] };

    const dbAccounts = await db.select().from(accounts).where(eq(accounts.userId, locals.user.id)).all();
    const liveAccounts = getAllAccounts(dbAccounts);
    const user = await db.select().from(users).where(eq(users.id, locals.user.id)).get();

    return {
        user: locals.user,
        accounts: liveAccounts,
        credits: user?.credits ?? 0
    };
};
