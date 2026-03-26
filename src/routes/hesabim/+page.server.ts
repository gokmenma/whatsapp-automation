import { db } from '$lib/server/db';
import { users, sessions, accounts, purchases, creditPackages, creditPurchases } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';

export const load = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(303, '/login');
    }
    
    const user = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
    const purchaseHistory = await db.select()
        .from(purchases)
        .where(eq(purchases.userId, locals.user.id))
        .orderBy(desc(purchases.createdAt))
        .all();
    
    const isPro = purchaseHistory.length > 0 && purchaseHistory.some(p => p.packageName === "Pro Aylık");
    const creditPacks = await db.select().from(creditPackages).all();
    
    if (!user) {
        throw redirect(303, '/login');
    }

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            credits: user.credits,
            isPro
        },
        purchases: purchaseHistory,
        creditPackages: creditPacks
    };
};

export const actions = {
    updatePassword: async ({ request, locals }) => {
        if (!locals.user) return fail(401);
        
        const formData = await request.formData();
        const currentPassword = formData.get('currentPassword') as string;
        const newPassword = formData.get('newPassword') as string;
        const confirmPassword = formData.get('confirmPassword') as string;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            return fail(400, { message: 'Tüm alanları doldurun' });
        }
        
        if (newPassword !== confirmPassword) {
            return fail(400, { message: 'Yeni şifreler eşleşmiyor' });
        }
        
        const user = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
        if (!user) return fail(404, { message: 'Kullanıcı bulunamadı' });
        
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return fail(400, { message: 'Mevcut şifre hatalı' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.update(users).set({ password: hashedPassword }).where(eq(users.id, locals.user.id));
        
        return { success: true, message: 'Şifre başarıyla güncellendi' };
    },
    
    buyPackage: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        
        const formData = await request.formData();
        const packageName = formData.get('packageName') as string;
        const credits = parseInt(formData.get('credits') as string);
        const amount = parseInt(formData.get('amount') as string);
        
        if (!packageName || !credits) return fail(400, { message: 'Geçersiz paket' });
        
        // Update user credits
        const currentUser = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
        if (!currentUser) return fail(404, { message: 'Kullanıcı bulunamadı' });
        
        await db.update(users)
            .set({ credits: (currentUser.credits || 0) + credits })
            .where(eq(users.id, locals.user.id));
            
        // Record purchase
        await db.insert(purchases).values({
            userId: locals.user.id,
            packageName,
            credits,
            amount,
            createdAt: new Date()
        });
        
        return { success: true, message: `${packageName} başarıyla aktif edildi!` };
    },

    buyCredits: async ({ request, locals }) => {
        if (!locals.user) throw redirect(303, '/login');
        
        const formData = await request.formData();
        const packageId = parseInt(formData.get('packageId') as string);
        
        const pkg = await db.select().from(creditPackages).where(eq(creditPackages.id, packageId)).get();
        if (!pkg) return fail(400, { message: 'Geçersiz kredi paketi' });
        
        const currentUser = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
        if (!currentUser) return fail(404, { message: 'Kullanıcı bulunamadı' });
        
        // Update credits
        await db.update(users)
            .set({ credits: (currentUser.credits || 0) + pkg.credits })
            .where(eq(users.id, locals.user.id));
            
        // Record purchase in creditPurchases
        await db.insert(creditPurchases).values({
            userId: locals.user.id,
            packageId: pkg.id,
            credits: pkg.credits,
            amount: pkg.price,
            createdAt: new Date(),
            status: 'completed'
        });

        // Also record in general purchases if needed (for unified history)
        await db.insert(purchases).values({
            userId: locals.user.id,
            packageName: `${pkg.credits} Kredi Paketi`,
            credits: pkg.credits,
            amount: pkg.price,
            createdAt: new Date()
        });
        
        return { success: true, message: `${pkg.credits} Kredi başarıyla eklendi!` };
    },
    
    deleteAccount: async ({ request, locals, cookies }) => {
        if (!locals.user) return fail(401);
        
        const formData = await request.formData();
        const password = formData.get('password') as string;
        
        if (!password) {
            return fail(400, { message: 'Şifrenizi girmelisiniz' });
        }
        
        const user = await db.select().from(users).where(eq(users.id, locals.user.id)).get();
        if (!user) return fail(404, { message: 'Kullanıcı bulunamadı' });
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return fail(400, { message: 'Şifre hatalı' });
        }
        
        await db.delete(users).where(eq(users.id, locals.user.id));
        
        cookies.delete('session_id', { path: '/' });
        throw redirect(303, '/login');
    }
};
