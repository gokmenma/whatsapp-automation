import { json } from '@sveltejs/kit';
import { getLogs } from '$lib/whatsapp';

export const GET = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    
    const { db } = await import('$lib/server/db');
    const { users } = await import('$lib/server/db/schema');
    const { eq } = await import('drizzle-orm');
    
    const [user] = await db.select().from(users).where(eq(users.id, locals.user.id));
    
    return json({ 
        logs: await getLogs(),
        credits: user?.credits || 0
    });
};
