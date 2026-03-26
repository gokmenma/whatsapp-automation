import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { userSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    let settings = await db.select().from(userSettings).where(eq(userSettings.userId, locals.user.id)).get();

    if (!settings) {
        // Create default settings if not exists
        const newSettings = {
            userId: locals.user.id,
            readReceipt: true,
            darkMode: true,
            messageDelay: 2000,
        };
        await db.insert(userSettings).values(newSettings);
        settings = newSettings;


    }

    return json(settings);
};

export const POST = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    
    // Validate messageDelay minimum 600ms
    if (body.messageDelay !== undefined && body.messageDelay < 600) {
        return json({ error: 'Minimum delay is 600ms' }, { status: 400 });
    }

    // Check if settings already exist
    const existing = await db.select().from(userSettings).where(eq(userSettings.userId, locals.user.id)).get();

    if (existing) {
        await db.update(userSettings)
            .set(body)
            .where(eq(userSettings.userId, locals.user.id));
    } else {
        await db.insert(userSettings).values({ ...body, userId: locals.user.id });
    }

    return json({ success: true });
};
