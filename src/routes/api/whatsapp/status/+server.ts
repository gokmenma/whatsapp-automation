import { json } from '@sveltejs/kit';
import { getAllAccounts } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts, users, purchases } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user) {
        return json({ accounts: [], credits: 0, limit: 1 }, { status: 401 });
    }
    
    // Fetch user-specific accounts from database
    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, locals.user.id));
    
    // Fetch current user and their plan status
    const user = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
    
    // Check if user has a Pro purchase
    const purchaseHistory = await db.select()
        .from(purchases)
        .where(eq(purchases.userId, locals.user.id))
        .all();
    
    // If they have any purchase of "Pro Aylık", limit is 3, otherwise 1
    const limit = purchaseHistory.some(p => p.packageName === "Pro Aylık") ? 3 : 1;
    
    return json({ 
        accounts: getAllAccounts(userAccounts),
        credits: user?.credits ?? 0,
        limit: limit
    });
};
