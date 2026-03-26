import { db } from '$lib/server/db';
import { purchases } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }
    
    const purchaseHistory = await db.select()
        .from(purchases)
        .where(eq(purchases.userId, locals.user.id))
        .orderBy(desc(purchases.createdAt))
        .all();
    
    return {
        purchases: purchaseHistory
    };
};
