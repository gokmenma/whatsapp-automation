import { json } from '@sveltejs/kit';
import { initializeWhatsApp, getAccountStatus } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { slugify } from '$lib/utils';

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { accountId: name } = await request.json(); // we got the display name
        
        if (!name) {
            return json({ success: false, error: 'Hesap ismi gereklidir.' }, { status: 400 });
        }

        const safeId = slugify(name);
        
        // Find if already exists for THIS user
        const existing = await db.select().from(accounts).where(
            and(
                eq(accounts.userId, locals.user.id),
                eq(accounts.id, safeId)
            )
        ).limit(1);

        if (existing.length === 0) {
            // New account, save to DB
            await db.insert(accounts).values({
                id: safeId,
                name: name,
                userId: locals.user.id,
                createdAt: new Date()
            });
        }

        // Initializing in background with the SAFE id
        initializeWhatsApp(safeId).catch(e => console.error(`BG Initialization Error for ${safeId}:`, e));
        
        return json({ success: true, ...getAccountStatus(safeId), id: safeId, name: name });
    } catch (e: any) {
        return json({ success: false, error: e.message || 'Bağlantı başlatılamadı' }, { status: 500 });
    }
};
