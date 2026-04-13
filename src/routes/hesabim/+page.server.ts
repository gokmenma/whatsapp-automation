import { remoteDb } from '$lib/server/db';
import { users, userCredits, userSubscriptions, subscriptionPackages, creditPackages, creditPurchases } from '$lib/server/db/remote-schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';

export const load = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }
    
    const userIdInt = Number(locals.user.id);

    // Safe load pattern
    const [user] = await remoteDb.select().from(users).where(eq(users.id, userIdInt)).limit(1).catch(() => []);
    if (!user) throw redirect(303, '/login');

    const [creditRes] = await remoteDb.select().from(userCredits).where(eq(userCredits.userId, userIdInt)).limit(1).catch(() => []);
    const balance = creditRes?.balance ?? 0;

    const creditPacks = await remoteDb.select().from(creditPackages).catch(() => []);
    const subPacks = await remoteDb.select().from(subscriptionPackages).catch(() => []);

    const [activeSub] = await remoteDb.select({
        packageName: subscriptionPackages.name,
        endDate: userSubscriptions.endDate
    })
    .from(userSubscriptions)
    .innerJoin(subscriptionPackages, eq(userSubscriptions.packageId, subscriptionPackages.id))
    .where(
        and(
            eq(userSubscriptions.userId, userIdInt),
            eq(userSubscriptions.status, 'active')
        )
    )
    .limit(1).catch(() => []);

    const purchaseHistory = await remoteDb.select()
        .from(creditPurchases)
        .where(eq(creditPurchases.userId, userIdInt))
        .orderBy(desc(creditPurchases.createdAt)).catch(() => []);

    return {
        user: {
            id: user.id,
            name: user.fullName || user.username,
            email: user.email,
            credits: balance,
            packageName: activeSub?.packageName || 'Ücretsiz',
            isPro: !!activeSub,
            expiryDate: activeSub?.endDate
        },
        purchases: purchaseHistory,
        creditPackages: creditPacks,
        subscriptionPackages: subPacks.map(p => ({
            ...p,
            features: (() => {
                try {
                    return JSON.parse(p.features || '[]');
                } catch {
                    return (p.features || '').split(',').map(f => f.trim()).filter(Boolean);
                }
            })()
        }))
    };
};

export const actions = {
    updatePassword: async ({ request, locals }) => {
        try {
            if (!locals.user) return fail(401);
            const formData = await request.formData();
            const currentPassword = formData.get('currentPassword') as string;
            const newPassword = formData.get('newPassword') as string;
            const confirmPassword = formData.get('confirmPassword') as string;
            const userIdInt = Number(locals.user.id);
            
            if (!currentPassword || !newPassword || !confirmPassword) return fail(400, { message: 'Tüm alanları doldurun' });
            if (newPassword !== confirmPassword) return fail(400, { message: 'Yeni şifreler eşleşmiyor' });
            
            const [user] = await remoteDb.select().from(users).where(eq(users.id, userIdInt)).limit(1).catch(() => []);
            if (!user) return fail(404, { message: 'Kullanıcı bulunamadı' });
            
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) return fail(400, { message: 'Mevcut şifre hatalı' });
            
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await remoteDb.update(users).set({ password: hashedPassword }).where(eq(users.id, userIdInt));
            return { success: true, message: 'Şifre başarıyla güncellendi' };
        } catch (e: any) {
            console.error('Password Update Error:', e);
            return fail(500, { message: 'Şifre güncellenirken bir hata oluştu: ' + e.message });
        }
    },
    
    buyCredits: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        
        try {
            const formData = await request.formData();
            const packageId = parseInt(formData.get('packageId') as string);
            const userIdInt = Number(locals.user.id);
            
            const [pkg] = await remoteDb.select().from(creditPackages).where(eq(creditPackages.id, packageId)).limit(1).catch(() => []);
            if (!pkg) return fail(400, { message: 'Geçersiz kredi paketi' });
            
            // Raw INSERT - Set status to 'pending' instead of 'completed'
            await remoteDb.execute(sql`
                INSERT INTO kredi_satin_alimlari 
                (user_id, package_id, kredi, tutar, status, created_at) 
                VALUES (${userIdInt}, ${pkg.id}, ${pkg.credits}, ${pkg.price}, 'pending', NOW())
            `);

            // REMOVED: Do not update balance here anymore. 
            // It will be updated by superadmin approval.
            
            return { success: true, message: `Satın alma talebiniz alındı. Ödemeniz onaylandıktan sonra ${pkg.credits} kredi hesabınıza eklenecektir.` };
        } catch (error: any) {
            console.error('MySQL Error Action:', error);
            // Return actual MySQL error code for diagnosis
            return fail(500, { message: 'Satın alma hatası: [' + (error.code || 'UNKNOWN') + '] - ' + error.message });
        }
    },
    
    buyPackage: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        
        try {
            const formData = await request.formData();
            const packageName = formData.get('packageName') as string;
            const creditsToGrant = parseInt(formData.get('credits') as string);
            const userIdInt = Number(locals.user.id);
            
            const [pkg] = await remoteDb.select().from(subscriptionPackages).where(eq(subscriptionPackages.name, packageName)).limit(1).catch(() => []);
            if (!pkg) return fail(400, { message: 'Üyelik paketi bulunamadı' });

            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + (pkg.durationDays || 30));

            const [existingSub] = await remoteDb.select()
                .from(userSubscriptions)
                .where(and(eq(userSubscriptions.userId, userIdInt), eq(userSubscriptions.status, 'active')))
                .limit(1).catch(() => []);

            if (existingSub) {
                const currentEnd = new Date(existingSub.endDate);
                const nextEnd = new Date(Math.max(currentEnd.getTime(), startDate.getTime()));
                nextEnd.setDate(nextEnd.getDate() + (pkg.durationDays || 30));
                
                await remoteDb.update(userSubscriptions)
                    .set({ endDate: nextEnd, packageId: pkg.id })
                    .where(eq(userSubscriptions.id, existingSub.id));
            } else {
                await remoteDb.insert(userSubscriptions).values({
                    userId: userIdInt,
                    packageId: pkg.id,
                    startDate: startDate,
                    endDate: endDate,
                    status: 'active'
                });
            }

            await remoteDb.execute(sql`
                INSERT INTO user_credits (user_id, balance) 
                VALUES (${userIdInt}, ${creditsToGrant}) 
                ON DUPLICATE KEY UPDATE balance = balance + ${creditsToGrant}
            `);

            return { success: true, message: `${packageName} üyeliğiniz başarıyla başlatıldı!` };
        } catch (error: any) {
            console.error('Plan Buy Error:', error);
            return fail(500, { message: 'Plan satın alınırken bir hata oluştu: ' + error.message });
        }
    },

    deleteAccount: async ({ request, locals, cookies }) => {
        if (!locals.user) throw redirect(303, '/login');
        
        try {
            const formData = await request.formData();
            const password = formData.get('password') as string;
            const userIdInt = Number(locals.user.id);

            const [user] = await remoteDb.select().from(users).where(eq(users.id, userIdInt)).limit(1).catch(() => []);
            if (!user || !(await bcrypt.compare(password, user.password))) {
                return fail(400, { message: 'Şifre hatalı' });
            }

            const { db } = await import('$lib/server/db');
            const { accounts } = await import('$lib/server/db/schema');
            const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, String(userIdInt))).catch(() => []);
            
            const { removeAccount } = await import('$lib/whatsapp');
            
            // Delete WhatsApp account records from local DB first
            await db.delete(accounts).where(eq(accounts.userId, String(userIdInt)));
            
            // Clean up instances in parallel (this is fast now as heavy work is backgrounded)
            await Promise.all(userAccounts.map(acc => removeAccount(acc.id)));
            await remoteDb.delete(userCredits).where(eq(userCredits.userId, userIdInt));
            await remoteDb.delete(userSubscriptions).where(eq(userSubscriptions.userId, userIdInt));
            await remoteDb.delete(users).where(eq(users.id, userIdInt));

            cookies.delete('session', { path: '/' });
            throw redirect(303, '/login');
        } catch (e: any) {
            if (e.status === 303) throw e;
            console.error('Account Delete Error:', e);
            return fail(500, { message: 'Hesap silinirken hata oluştu: ' + e.message });
        }
    }
};
