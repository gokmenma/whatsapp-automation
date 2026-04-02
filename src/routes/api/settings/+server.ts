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
            batchSize: 25,
            batchWaitMinutes: 5,
            useGreetingVariations: true,
            useIntroVariations: true,
            useClosingVariations: true,
        };
        await db.insert(userSettings).values(newSettings);
        settings = newSettings;


    }

    return json(settings);
};

export const POST = async ({ request, locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    
    // Validate messageDelay minimum 400ms
    if (body.messageDelay !== undefined && body.messageDelay < 400) {
        return json({ error: 'Minimum delay is 400ms' }, { status: 400 });
    }

    if (body.batchSize !== undefined) {
        if (body.batchSize < 20 || body.batchSize > 300) {
            return json({ error: 'Batch size must be between 20 and 300' }, { status: 400 });
        }
    }

    if (body.batchWaitMinutes !== undefined) {
        if (body.batchWaitMinutes < 3 || body.batchWaitMinutes > 30) {
            return json({ error: 'Batch wait time must be between 3 and 30 minutes' }, { status: 400 });
        }
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
