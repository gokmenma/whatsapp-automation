import { json } from '@sveltejs/kit';
import { remoteDb, db } from '$lib/server/db';
import { users, userCredits } from '$lib/server/db/remote-schema';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user || (locals.user.role !== 'superadmin' && locals.user.role !== 'admin')) {
        return json({ error: 'Yetkiniz yok' }, { status: 403 });
    }

    try {
        // Fetch users and their credits
        const allUsers = await remoteDb.select({
            id: users.id,
            username: users.username,
            fullName: users.fullName,
            email: users.email,
            role: users.role,
            status: users.status,
            accountLimit: users.accountLimit,
            canAddAccount: users.canAddAccount,
            createdAt: users.createdAt,
            balance: userCredits.balance
        })
        .from(users)
        .leftJoin(userCredits, eq(users.id, userCredits.userId))
        .where(eq(users.deleted, 0))
        .execute();

        // Optimized: Fetch account counts per user in a single query
        const accountCounts = await db.select({
            userId: accounts.userId,
            count: sql`count(*)`
        })
        .from(accounts)
        .groupBy(accounts.userId)
        .execute();

        const countMap = Object.fromEntries(
            accountCounts.map(a => [String(a.userId), Number(a.count || 0)])
        );

        // Don't call getAllAccounts here as it calculates heavy unread counts for EVERY account.
        // We only provide basic account info and status 'ready'/'disconnected' placeholder.
        // If specific details are needed, they can be fetched on demand.
        const allAccountsRaw = await db.select({
            id: accounts.id,
            name: accounts.name,
            userId: accounts.userId
        }).from(accounts).execute();

        const usersWithAccounts = (allUsers as any[]).map(u => {
            const userIdStr = String(u.id);
            const userAccountsRaw = allAccountsRaw.filter(a => String(a.userId) === userIdStr);
            
            return {
                ...u,
                accounts: userAccountsRaw.map(a => ({ 
                    id: a.id, 
                    name: a.name, 
                    status: 'ready' // Placeholder, the dialog will fetch live status if needed
                })),
                accountCount: countMap[userIdStr] || 0
            };
        });

        return json({ users: usersWithAccounts });
    } catch (error: any) {
        console.error('Fetch Users Error:', error);
        return json({ error: error.message }, { status: 500 });
    }
};

// ... Rest of the file (POST, PUT, DELETE) remains the same ...
export const POST = async ({ locals, request }) => {
    if (!locals.user || (locals.user.role !== 'superadmin' && locals.user.role !== 'admin')) return json({ error: 'Yetkiniz yok' }, { status: 403 });
    try {
        const { username, fullName, email, password, role, accountLimit, credits, canAddAccount } = await request.json();
        const existing = await remoteDb.select().from(users).where(eq(users.username, username)).limit(1);
        if (existing.length > 0) return json({ error: 'Bu kullanıcı adı zaten alınmış' }, { status: 400 });
        const { default: bcrypt } = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await remoteDb.insert(users).values({ username, fullName, email, password: hashedPassword, role, accountLimit: accountLimit || 5, canAddAccount: canAddAccount ? 1 : 0, status: 'active' });
        const newUserId = (result as any).insertId;
        if (credits !== undefined) {
            await remoteDb.insert(userCredits).values({ userId: newUserId, balance: credits, updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { balance: credits, updatedAt: new Date() } });
        }
        return json({ success: true, userId: newUserId });
    } catch (error: any) { return json({ error: error.message }, { status: 500 }); }
};

export const PUT = async ({ locals, request }) => {
    if (!locals.user || (locals.user.role !== 'superadmin' && locals.user.role !== 'admin')) return json({ error: 'Yetkiniz yok' }, { status: 403 });
    try {
        const { id, fullName, email, role, accountLimit, status, credits, password, canAddAccount } = await request.json();
        const updateData: any = { fullName, email, role, accountLimit, status, canAddAccount: canAddAccount ? 1 : 0, updatedAt: new Date().toISOString() };
        if (password) {
            const { default: bcrypt } = await import('bcryptjs');
            updateData.password = await bcrypt.hash(password, 10);
        }
        await remoteDb.update(users).set(updateData).where(eq(users.id, id));
        if (credits !== undefined) {
             await remoteDb.insert(userCredits).values({ userId: id, balance: credits, updatedAt: new Date() }).onDuplicateKeyUpdate({ set: { balance: credits, updatedAt: new Date() } });
        }
        return json({ success: true });
    } catch (error: any) { return json({ error: error.message }, { status: 500 }); }
};

export const DELETE = async ({ locals, request }) => {
    if (!locals.user || locals.user.role !== 'superadmin') return json({ error: 'Sadece Superadmin silebilir' }, { status: 403 });
    try {
        const { id } = await request.json();
        await remoteDb.update(users).set({ deleted: 1 }).where(eq(users.id, id));
        return json({ success: true });
    } catch (error: any) { return json({ error: error.message }, { status: 500 }); }
};
