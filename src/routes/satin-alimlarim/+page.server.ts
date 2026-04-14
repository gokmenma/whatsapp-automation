import { remoteDb } from '$lib/server/db';
import { creditPurchases } from '$lib/server/db/remote-schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }
    
    const purchaseHistory = await remoteDb.select()
        .from(creditPurchases)
        .where(eq(creditPurchases.userId, locals.user.id))
        .orderBy(desc(creditPurchases.createdAt));
    
    return {
        purchases: purchaseHistory
    };
};
