import { json } from '@sveltejs/kit';
import { initializeWhatsApp, getAccountStatus } from '$lib/whatsapp';
import { db, remoteDb } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { users, userSubscriptions, subscriptionPackages } from '$lib/server/db/remote-schema';
import { eq, and, sql, gt, isNull } from 'drizzle-orm';
import { hasPermission } from '$lib/server/permissions';

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // syncHistory=true only comes from the "Account Addition" UI checkbox
        const { accountId: inputIdOrName, isPool, syncHistory = false } = await request.json();
        console.log(`[Connect API] Received request for ${inputIdOrName}. isPool=${isPool}, syncHistory=${syncHistory}`);
        
        if (!inputIdOrName) {
            return json({ success: false, error: 'Hesap ID veya ismi gereklidir.' }, { status: 400 });
        }

        const userIdInt = Number(locals.user.id);
        const userIdStr = String(locals.user.id);

        const isScanner = locals.user.role === 'qrcode_scanner';
        const isSuperAdmin = locals.user.role === 'superadmin';
        const isAdmin = locals.user.role === 'admin';
        const hasPoolPermission = await hasPermission(locals.user, 'action:pool_assign');
        const isAdminForPool = isSuperAdmin || hasPoolPermission;
        
        const shouldGoToPool = isScanner || (isAdminForPool && isPool);

        if (isPool && !isScanner && !isAdminForPool) {
             return json({ success: false, error: 'Havuz hesabı yönetme yetkiniz yok.' }, { status: 403 });
        }

        // Fetch user data to check canAddAccount permission
        const userResult = await remoteDb.select().from(users).where(eq(users.id, userIdInt)).limit(1);
        const user = userResult[0];
        const canAddAccountPermission = !!user?.canAddAccount;

        const isPrivate = !shouldGoToPool && canAddAccountPermission;

        // Limit Check (Only for direct user assignments, pool accounts are exempt)
        if (!shouldGoToPool) {
            const currentCountResult = await db.select({ count: sql`count(*)` }).from(accounts).where(eq(accounts.userId, userIdStr));
            const currentCount = Number((currentCountResult[0] as any)?.count || 0);
            
            const activeSub = await remoteDb.select({ limit: subscriptionPackages.accountLimit })
                .from(userSubscriptions)
                .innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
                .where(and(eq(userSubscriptions.userId, userIdInt), eq(userSubscriptions.status, 'active'), gt(userSubscriptions.endDate, new Date())))
                .limit(1);
            
            const userLimit = activeSub[0]?.limit ?? 1;
            if (currentCount >= userLimit) {
                return json({ success: false, error: `Hesap limitine ulaştınız (${userLimit}). Lütfen paketinizi yükseltin.` });
            }
        }

        // 1. Try finding by ID first in Local SQLite
        let existingRows = await db.select().from(accounts).where(
            and(
                shouldGoToPool ? isNull(accounts.userId) : eq(accounts.userId, userIdStr),
                eq(accounts.id, inputIdOrName)
            )
        ).limit(1);
        let existing = existingRows[0];

        // 2. If not found by ID, try finding by Name in Local SQLite
        if (!existing) {
            const existingByName = await db.select().from(accounts).where(
                and(
                    shouldGoToPool ? isNull(accounts.userId) : eq(accounts.userId, userIdStr),
                    eq(accounts.name, inputIdOrName)
                )
            ).limit(1);
            existing = existingByName[0];
        }

        let targetId = existing?.id;
        let finalName = existing?.name || inputIdOrName;

        if (!existing) {
            // New account: check limits and permissions
            if (!isScanner) {
                const countRes = await db.select({ count: sql`count(*)` }).from(accounts)
                    .where(eq(accounts.userId, userIdInt));
                
                const count = Number((countRes[0] as any)?.count || 0);

                const activeSub = await remoteDb.select({
                    limit: subscriptionPackages.accountLimit,
                    packageName: subscriptionPackages.name
                })
                .from(userSubscriptions)
                .innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
                .where(
                    and(
                        eq(userSubscriptions.userId, userIdInt),
                        eq(userSubscriptions.status, 'active'),
                        gt(userSubscriptions.endDate, new Date())
                    )
                )
                .limit(1);

                const limit = activeSub[0]?.limit ?? 1;

                if (count >= limit) {
                    return json({ 
                        success: false, 
                        error: `Üzgünüz, mevcut paketiniz (${activeSub[0]?.packageName || 'Ücretsiz'}) sadece ${limit} WhatsApp hesabı eklemenize izin veriyor. Daha fazla hesap için lütfen paketinizi yükseltin.` 
                    }, { status: 403 });
                }

                if (!canAddAccountPermission) {
                    return json({ success: false, error: 'Kendi hesabınızı ekleme yetkiniz yok.' }, { status: 403 });
                }
            }

            // Generate a TRULY unique ID for NEW account
            targetId = crypto.randomUUID();
            finalName = inputIdOrName || `Hesap ${targetId.slice(0, 4)}`;
            
            console.log(`[Connect API] NEW account. targetId=${targetId}, shouldGoToPool=${shouldGoToPool}, userId=${shouldGoToPool ? null : userIdInt}, scannerId=${(isScanner || isAdmin) ? userIdInt : null}`);

            await db.insert(accounts).values({
                id: targetId,
                name: finalName,
                userId: shouldGoToPool ? null : userIdInt,
                scannerId: (isScanner || isAdmin || isSuperAdmin) ? userIdInt : null,
                createdAt: new Date(),
                isDefault: false,
                isPrivate: isPrivate,
                syncHistory: syncHistory
            });
        } else {
            // Existing account: update its association and scanner info
            console.log(`[Connect API] Updating existing account ${targetId}. shouldGoToPool=${shouldGoToPool}`);
            
            // CRITICAL FIX: Only overwrite assignment/privacy if explicitly requested or if it's a scanner reconnecting
            const updates: any = {
                scannerId: (isScanner || isAdmin || isSuperAdmin) ? userIdInt : (existing.scannerId || null)
            };

            // If isPool is explicitly passed in the request body (e.g. from Pool management) 
            // or if it's a scanner (scanners always contribute to pool)
            if (isPool !== undefined || isScanner) {
                updates.userId = shouldGoToPool ? null : userIdInt;
                updates.isPrivate = isPrivate;
            }

            if (syncHistory !== undefined) {
                updates.syncHistory = syncHistory;
            }

            await db.update(accounts).set(updates).where(eq(accounts.id, targetId));
        }

        if (!targetId) throw new Error("Could not determine Account ID");

        // Initializing in background with the SAFE unique id
        console.log(`[Connect API] Initializing WhatsApp for ${targetId} with syncHistory=${syncHistory}`);
        initializeWhatsApp(targetId, syncHistory).catch(e => console.error(`BG Initialization Error for ${targetId}:`, e));
        
        return json({ success: true, ...getAccountStatus(targetId), id: targetId, name: finalName });
    } catch (e: any) {
        console.error('API Connect Error:', e);
        return json({ success: false, error: e.message || 'Bağlantı başlatılamadı' }, { status: 500 });
    }
};
