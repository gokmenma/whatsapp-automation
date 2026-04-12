import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { messageTemplates } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    try {
        const templates = await db.select().from(messageTemplates)
            .where(eq(messageTemplates.userId, locals.user.id))
            .orderBy(desc(messageTemplates.createdAt));
        
        return json({ success: true, templates });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
};

export const POST = async ({ request, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    try {
        const { name, content } = await request.json();
        
        if (!name || !content) {
            return json({ success: false, error: 'İsim ve içerik gereklidir.' }, { status: 400 });
        }

        const result = await db.insert(messageTemplates).values({
            userId: locals.user.id,
            name,
            content,
            createdAt: new Date()
        });

        const newTemplate = {
            id: (result as any)[0].insertId,
            userId: locals.user.id,
            name,
            content,
            createdAt: new Date()
        };

        return json({ success: true, template: newTemplate });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
};
