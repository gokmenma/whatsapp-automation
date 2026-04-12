import { json } from '@sveltejs/kit';
import { db, remoteDb } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { users } from '$lib/server/db/remote-schema';
import { eq, or, isNull } from 'drizzle-orm';
import { getAllAccounts } from '$lib/whatsapp';
import { hasPermission } from '$lib/server/permissions';

export const GET = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Giriş gerekli' }, { status: 401 });

    try {
        const userIdStr = String(locals.user.id);
        const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
        
        // Parallelize permission checks
        const [hasPoolPermission, hasStopPermission] = await Promise.all([
            hasPermission(locals.user, 'action:pool_assign'),
            hasPermission(locals.user, 'action:pool_stop')
        ]);
        
        const isManager = isAdminOrSuper || hasPoolPermission || hasStopPermission;
        
        let poolAccountsData;
        if (isManager) {
            poolAccountsData = await db.select().from(accounts).where(eq(accounts.isPrivate, false));
        } else if (locals.user.role === 'qrcode_scanner') {
            poolAccountsData = await db.select().from(accounts).where(eq(accounts.scannerId, Number(locals.user.id)));
        } else {
            poolAccountsData = await db.select().from(accounts).where(eq(accounts.userId, Number(locals.user.id)));
        }

        if (poolAccountsData.length === 0) return json({ accounts: [] });

        // Collect unique user IDs needed for name resolution
        const neededUserIds = new Set<number>();
        poolAccountsData.forEach(acc => {
            if (acc.scannerId) neededUserIds.add(Number(acc.scannerId));
            if (acc.userId) neededUserIds.add(Number(acc.userId));
        });

        // Fetch ONLY necessary remote users instead of the whole table
        let userMap: Record<number, string> = {};
        if (neededUserIds.size > 0) {
            const { inArray } = await import('drizzle-orm');
            const remoteUsers = await remoteDb.select({ 
                id: users.id, 
                username: users.username 
            })
            .from(users)
            .where(inArray(users.id, Array.from(neededUserIds)));
            
            userMap = Object.fromEntries(remoteUsers.map(u => [u.id, u.username]));
        }

        const enrichedAccounts = poolAccountsData.map(acc => {
            const scannerName = acc.scannerId ? (userMap[Number(acc.scannerId)] || `Kullanıcı #${acc.scannerId}`) : 'Bilinmiyor';
            const assignedName = acc.userId ? (userMap[Number(acc.userId)] || `Kullanıcı #${acc.userId}`) : 'Havuzda (Atanmamış)';
            return {
                ...acc,
                scannerName,
                assignedName
            };
        });

        const detailedAccounts = await getAllAccounts(enrichedAccounts);

        return json({ accounts: detailedAccounts });
    } catch (error: any) {
        console.error('[Pool API Error]:', error);
        return json({ error: error.message }, { status: 500 });
    }
};

export const POST = async ({ locals, request }) => {
    if (!locals.user) return json({ error: 'Giriş gerekli' }, { status: 401 });
    
    // Assignment is STRICTLY restricted to those with the permission
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const hasPoolPermission = await hasPermission(locals.user, 'action:pool_assign');

    if (!isAdminOrSuper && !hasPoolPermission) {
        return json({ error: 'Yetkiniz yok' }, { status: 403 });
    }

    try {
        const { accountId, targetUserId } = await request.json();

        await db.update(accounts)
            .set({ userId: targetUserId ? Number(targetUserId) : null })
            .where(eq(accounts.id, accountId));

        return json({ success: true });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};

export const DELETE = async ({ locals, request }) => {
    if (!locals.user) return json({ error: 'Giriş gerekli' }, { status: 401 });

    try {
        const { accountId } = await request.json();
        
        // Find account to check scannerId
        const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
        const account = accountResult[0];

        if (!account) {
            return json({ error: 'Hesap bulunamadı' }, { status: 404 });
        }

        const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
        const hasPoolPermission = await hasPermission(locals.user, 'action:pool_assign');
        const isScannerObj = String(account.scannerId) === String(locals.user.id);
        
        const canDelete = isAdminOrSuper || hasPoolPermission || isScannerObj;

        if (!canDelete) {
            return json({ error: 'Yetkiniz yok' }, { status: 403 });
        }

        const { removeAccount } = await import('$lib/whatsapp');
        
        await removeAccount(accountId);
        await db.delete(accounts).where(eq(accounts.id, accountId));

        return json({ success: true });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};

export const PATCH = async ({ locals, request }) => {
    if (!locals.user) return json({ error: 'Giriş gerekli' }, { status: 401 });

    try {
        const { accountId, name } = await request.json();
        if (!name) return json({ error: 'İsim gereklidir' }, { status: 400 });

        // Check permission: Scanners can rename their own accounts, others need permission
        const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
        const account = accountResult[0];

        if (!account) return json({ error: 'Hesap bulunamadı' }, { status: 404 });

        const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
        const hasPoolPermission = await hasPermission(locals.user, 'action:pool_assign');
        const isScannerObj = String(account.scannerId) === String(locals.user.id);

        if (!isAdminOrSuper && !hasPoolPermission && !isScannerObj) {
            return json({ error: 'Yetkiniz yok' }, { status: 403 });
        }

        await db.update(accounts)
            .set({ name })
            .where(eq(accounts.id, accountId));

        return json({ success: true });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};
