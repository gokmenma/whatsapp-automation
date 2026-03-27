import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { messageTemplates } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const DELETE = async ({ params, locals }) => {
    if (!locals.user) {
        return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, { status: 401 });
    }

    try {
        const id = parseInt(params.id);
        
        db.delete(messageTemplates)
            .where(and(
                eq(messageTemplates.id, id),
                eq(messageTemplates.userId, locals.user.id)
            ))
            .run();

        return json({ success: true });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
};
