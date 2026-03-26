import { json } from '@sveltejs/kit';
import { getAllAccounts } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user) {
        return json({ accounts: [] }, { status: 401 });
    }
    
    // Fetch user-specific accounts from database
    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, locals.user.id));
    
    return json({ accounts: getAllAccounts(userAccounts) });
};
