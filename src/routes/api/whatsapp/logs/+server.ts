import { json } from '@sveltejs/kit';
import { getLogs } from '$lib/whatsapp';

export const GET = async ({ locals }) => {
    if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
    
    const { remoteDb } = await import('$lib/server/db');
    const { userCredits } = await import('$lib/server/db/remote-schema');
    const { eq } = await import('drizzle-orm');
    
    const userId = Number(locals.user.id);
    let userBalance = 0;
    try {
        const [creditRow]: any = await remoteDb.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);
        userBalance = creditRow?.balance || 0;
    } catch (e) {
        console.error('Credits fetch error in logs API:', e);
    }
    
    return json({ 
        logs: await getLogs(userId),
        credits: userBalance
    });
};
