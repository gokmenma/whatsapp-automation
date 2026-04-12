import { json } from '@sveltejs/kit';
import { getAllAccounts } from '$lib/whatsapp';
import { db, remoteDb } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { users, userCredits, userSubscriptions, subscriptionPackages } from '$lib/server/db/remote-schema';
import { eq, and, gt } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user) {
        return json({ accounts: [], credits: 0, limit: 1 }, { status: 401 });
    }
    
    try {
        const userIdInt = Number(locals.user.id);
        const userIdStr = String(locals.user.id);
        const isScanner = locals.user.role === 'qrcode_scanner';

        // Parallelize all data fetching
        const [
            userAccountsResult,
            userResult,
            creditResult,
            activeSubResult
        ] = await Promise.all([
            // 1. Accounts
            isScanner 
                ? db.select().from(accounts).where(eq(accounts.scannerId, userIdInt))
                : db.select().from(accounts).where(eq(accounts.userId, userIdStr)), // Fixed: userId is string in schema
            
            // 2. User Profile
            remoteDb.select().from(users).where(eq(users.id, userIdInt)).limit(1),

            // 3. Credits
            remoteDb.select().from(userCredits).where(eq(userCredits.userId, userIdInt)).limit(1),

            // 4. Subscription
            remoteDb.select({
                limit: subscriptionPackages.accountLimit,
                packageName: subscriptionPackages.name
            })
            .from(userSubscriptions)
            .innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
            .where(and(
                eq(userSubscriptions.userId, userIdInt),
                eq(userSubscriptions.status, 'active'),
                gt(userSubscriptions.endDate, new Date())
            ))
            .limit(1)
        ]);

        const user = userResult[0];
        const currentCredits = creditResult[0]?.balance ?? 0;
        const activeSub = activeSubResult[0];

        const packageLimit = activeSub?.limit ?? 1;
        const userOverrideLimit = user?.accountLimit ?? 0;
        const finalLimit = Math.max(packageLimit, userOverrideLimit, 1);

        // Process live statuses (bulk optimized)
        const liveAccounts = userAccountsResult.length > 0 ? await getAllAccounts(userAccountsResult) : [];

        return json({ 
            accounts: liveAccounts,
            credits: currentCredits,
            limit: finalLimit,
            canAddAccount: !!user?.canAddAccount,
            packageName: activeSub?.packageName || 'Ücretsiz'
        });
    } catch (error: any) {
        console.error('API Status Error:', error);
        return json({ accounts: [], credits: 0, limit: 1, error: error.message }, { status: 500 });
    }
};
