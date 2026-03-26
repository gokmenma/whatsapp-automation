import { json } from '@sveltejs/kit';
import { initializeWhatsApp, getAccountStatus } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts, purchases } from '$lib/server/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { slugify } from '$lib/utils';

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { accountId: inputIdOrName } = await request.json();
        
        if (!inputIdOrName) {
            return json({ success: false, error: 'Hesap ID veya ismi gereklidir.' }, { status: 400 });
        }

        // 1. Try finding by ID first (SAFE UUID)
        let existing = await db.select().from(accounts).where(
            and(
                eq(accounts.userId, locals.user.id),
                eq(accounts.id, inputIdOrName)
            )
        ).get();

        // 2. If not found by ID, try finding by Name
        if (!existing) {
            existing = await db.select().from(accounts).where(
                and(
                    eq(accounts.userId, locals.user.id),
                    eq(accounts.name, inputIdOrName)
                )
            ).get();
        }

        let targetId = existing?.id;
        let finalName = existing?.name || inputIdOrName;

        if (!existing) {
            // New account - Check Limit (Standard: 1, Pro: 3)
            const countRes = await db.select({ count: sql`count(*)` }).from(accounts)
                .where(eq(accounts.userId, locals.user.id)).get();
            
            const count = Number((countRes as any)?.count || 0);

            // Check if user has a Pro purchase
            const purchaseHistory = await db.select()
                .from(purchases)
                .where(eq(purchases.userId, locals.user.id))
                .all();
            
            const limit = purchaseHistory.some(p => p.packageName === "Pro Aylık") ? 3 : 1;

            if (count >= limit) {
                return json({ 
                    success: false, 
                    error: `Üzgünüz, mevcut paketinizde sadece ${limit} WhatsApp hesabı ekleyebilirsiniz. Daha fazla hesap için lütfen paketinizi yükseltin.` 
                }, { status: 403 });
            }

            // Generate a TRULY unique ID
            targetId = crypto.randomUUID();
            finalName = inputIdOrName;

            const isFirst = count === 0;

            await db.insert(accounts).values({
                id: targetId,
                name: finalName,
                userId: locals.user.id,
                createdAt: new Date(),
                isDefault: isFirst
            });
        }

        if (!targetId) throw new Error("Could not determine Account ID");

        // Initializing in background with the SAFE unique id
        initializeWhatsApp(targetId).catch(e => console.error(`BG Initialization Error for ${targetId}:`, e));
        
        return json({ success: true, ...getAccountStatus(targetId), id: targetId, name: finalName });
    } catch (e: any) {
        console.error('API Connect Error:', e);
        return json({ success: false, error: e.message || 'Bağlantı başlatılamadı' }, { status: 500 });
    }
};
