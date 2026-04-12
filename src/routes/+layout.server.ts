import { db, remoteDb } from '$lib/server/db';
import { accounts, userSettings } from '$lib/server/db/schema';
import { users, userCredits, userSubscriptions, subscriptionPackages, resources, rolePermissions } from '$lib/server/db/remote-schema';
import { eq, and, gt, or, asc, isNull } from 'drizzle-orm';
import { getAllAccounts } from '$lib/whatsapp';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals, url }) => {
    if (!locals.user) return { user: null, accounts: [], credits: 0, darkMode: true };

    const { pathname: rawPathname } = url;
    const pathname = rawPathname.endsWith('/') && rawPathname.length > 1 ? rawPathname.slice(0, -1) : rawPathname;
    const pathWithoutSlash = pathname.startsWith('/') ? pathname.slice(1) : pathname;

    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isSuperAdmin = locals.user.role === 'superadmin';
    const isScanner = locals.user.role === 'qrcode_scanner';
    const userIdInt = Number(locals.user.id);
    const userIdStr = String(locals.user.id);

    const publicPaths = ['/hesabim', '/logout', '/ayarlar', '/unauthorized', '/login', '/register'];
    const isPublic = publicPaths.some(p => pathname.startsWith(p));
    const isDashboard = pathname === '/';
    const isApi = pathname.startsWith('/api');

    try {
        // Parallelize all independent database fetches
        const [
            dbAccountsRaw,
            userResult,
            creditsResult,
            activeSubResult,
            settingsResult,
            resourcesList,
            permissionsResult
        ] = await Promise.all([
            // 1. Accounts
            (async () => {
                if (isAdminOrSuper) {
                    return db.select().from(accounts).where(or(eq(accounts.userId, userIdStr), isNull(accounts.userId)));
                } else if (isScanner) {
                    return db.select().from(accounts).where(eq(accounts.scannerId, userIdInt));
                } else {
                    return db.select().from(accounts).where(eq(accounts.userId, userIdStr));
                }
            })(),

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
            .limit(1),

            // 5. Settings
            db.select({ darkMode: userSettings.darkMode }).from(userSettings).where(eq(userSettings.userId, userIdInt)).limit(1),

            // 6. Resources (for sidebar)
            remoteDb.select().from(resources).orderBy(asc(resources.sortOrder)).execute(),

            // 7. Role Permissions
            (async () => {
                if (isSuperAdmin) return { current: null, all: [] };
                
                // Concurrent fetch for current route permission and all permissions
                const [currentPerm, allPerms] = await Promise.all([
                    (isDashboard || isApi || isPublic) ? Promise.resolve([]) : remoteDb.select()
                        .from(rolePermissions)
                        .where(and(
                            eq(rolePermissions.role, locals.user.role), 
                            or(eq(rolePermissions.resource, pathname), eq(rolePermissions.resource, pathWithoutSlash))
                        ))
                        .limit(1),
                    remoteDb.select().from(rolePermissions).where(eq(rolePermissions.role, locals.user.role)).execute()
                ]);

                return { current: currentPerm[0], all: allPerms };
            })()
        ]);

        // Security Check
        if (!isSuperAdmin && !isDashboard && !isApi && !isPublic) {
            if (!permissionsResult.current || !permissionsResult.current.canAccess) {
                throw redirect(303, '/unauthorized');
            }
        }

        const user = userResult[0];
        const activeSub = activeSubResult[0];
        const settings = settingsResult[0];

        // Process live statuses (bulk optimized internally)
        const liveAccounts = dbAccountsRaw.length > 0 ? await getAllAccounts(dbAccountsRaw) : [];

        return {
            user: {
                ...locals.user,
                fullName: user?.fullName || locals.user.name,
                role: user?.role || 'user',
                packageName: activeSub?.packageName || 'Ücretsiz'
            },
            accounts: liveAccounts,
            credits: creditsResult[0]?.balance ?? 0,
            limit: Math.max(activeSub?.limit ?? 1, user?.accountLimit ?? 0, 1),
            darkMode: settings?.darkMode !== false,
            permissions: (permissionsResult.all || []).map(p => ({ resource: p.resource, canAccess: !!p.canAccess })),
            resources: resourcesList
        };
    } catch (error) {
        if ((error as any).status === 303) throw error;
        console.error('Layout Load Error:', error);
        return { 
            user: locals.user, 
            accounts: [], 
            credits: 0, 
            limit: 1, 
            darkMode: true,
            permissions: [],
            resources: []
        };
    }
};
