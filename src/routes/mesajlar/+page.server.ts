import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAllAccounts } from '$lib/whatsapp';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) throw redirect(303, '/login');

    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, locals.user.id));
    const accountsWithStatus = await getAllAccounts(userAccounts);

    return {
        accounts: accountsWithStatus,
        user: locals.user
    };
};
