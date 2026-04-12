import { remoteDb } from '$lib/server/db';
import { creditPurchases, users, userCredits, creditPackages } from '$lib/server/db/remote-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
    if (!locals.user || locals.user.role !== 'superadmin') {
        throw redirect(303, '/');
    }

    const pendingPurchases = await remoteDb.select({
        id: creditPurchases.id,
        credits: creditPurchases.credits,
        amount: creditPurchases.amount,
        status: creditPurchases.status,
        createdAt: creditPurchases.createdAt,
        userName: users.fullName,
        userEmail: users.email,
        userId: users.id
    })
    .from(creditPurchases)
    .innerJoin(users, eq(creditPurchases.userId, users.id))
    .where(eq(creditPurchases.status, 'pending'))
    .orderBy(desc(creditPurchases.createdAt));

    const approvedPurchases = await remoteDb.select({
        id: creditPurchases.id,
        credits: creditPurchases.credits,
        amount: creditPurchases.amount,
        status: creditPurchases.status,
        createdAt: creditPurchases.createdAt,
        userName: users.fullName,
        userEmail: users.email,
        userId: users.id
    })
    .from(creditPurchases)
    .innerJoin(users, eq(creditPurchases.userId, users.id))
    .where(eq(creditPurchases.status, 'completed'))
    .orderBy(desc(creditPurchases.createdAt))
    .limit(50);

    const packages = await remoteDb.select().from(creditPackages).orderBy(desc(creditPackages.id));

    return {
        pendingPurchases,
        approvedPurchases,
        packages
    };
};

export const actions = {
    approve: async ({ request, locals }) => {
        if (!locals.user || locals.user.role !== 'superadmin') return fail(401);

        const formData = await request.formData();
        const purchaseId = parseInt(formData.get('id') as string);

        const [purchase] = await remoteDb.select().from(creditPurchases).where(eq(creditPurchases.id, purchaseId)).limit(1);
        if (!purchase || purchase.status !== 'pending') return fail(400, { message: 'Geçersiz talep' });

        try {
            // Update purchase status
            await remoteDb.update(creditPurchases)
                .set({ status: 'completed' })
                .where(eq(creditPurchases.id, purchaseId));

            // Update user balance
            await remoteDb.execute(sql`
                INSERT INTO user_credits (user_id, balance) 
                VALUES (${purchase.userId}, ${purchase.credits}) 
                ON DUPLICATE KEY UPDATE balance = balance + ${purchase.credits}
            `);

            return { success: true, message: 'Kredi başarıyla onaylandı ve kullanıcı hesabına eklendi.' };
        } catch (e: any) {
            console.error('Approval Error:', e);
            return fail(500, { message: 'Onaylama sırasında hata oluştu: ' + e.message });
        }
    },
    reject: async ({ request, locals }) => {
        if (!locals.user || locals.user.role !== 'superadmin') return fail(401);

        const formData = await request.formData();
        const purchaseId = parseInt(formData.get('id') as string);

        try {
            await remoteDb.update(creditPurchases)
                .set({ status: 'failed' })
                .where(eq(creditPurchases.id, purchaseId));

            return { success: true, message: 'Talep reddedildi.' };
        } catch (e: any) {
            return fail(500, { message: 'İşlem sırasında hata oluştu: ' + e.message });
        }
    },
    savePackage: async ({ request, locals }) => {
        if (!locals.user || locals.user.role !== 'superadmin') return fail(401);

        const formData = await request.formData();
        const id = formData.get('id') ? parseInt(formData.get('id') as string) : null;
        const name = formData.get('name') as string;
        const credits = parseInt(formData.get('credits') as string);
        const price = parseInt(formData.get('price') as string);
        const description = formData.get('description') as string;

        try {
            if (id) {
                await remoteDb.update(creditPackages)
                    .set({ name, credits, price, description })
                    .where(eq(creditPackages.id, id));
            } else {
                await remoteDb.insert(creditPackages)
                    .values({ name, credits, price, description });
            }
            return { success: true, message: 'Paket başarıyla kaydedildi.' };
        } catch (e: any) {
            return fail(500, { message: 'Kaydetme hatası: ' + e.message });
        }
    },
    deletePackage: async ({ request, locals }) => {
        if (!locals.user || locals.user.role !== 'superadmin') return fail(401);

        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);

        try {
            await remoteDb.delete(creditPackages).where(eq(creditPackages.id, id));
            return { success: true, message: 'Paket silindi.' };
        } catch (e: any) {
            return fail(500, { message: 'Silme hatası: ' + e.message });
        }
    }
};
