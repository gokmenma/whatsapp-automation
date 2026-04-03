
import { getMessageEmitter } from '$lib/whatsapp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;

    return new Response(new ReadableStream({
        async start(controller) {
            const emitter = getMessageEmitter();
            const { db } = await import('$lib/server/db');
            const { accounts } = await import('$lib/server/db/schema');
            const { eq } = await import('drizzle-orm');
            
            // Get user's account IDs once on connect for filtering
            const userAccountIds = (await db.select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.userId, userId)))
                .map(a => a.id);

            const onMessage = (data: { accountId: string; id: string; jid: string; body: string; pushName: string }) => {
                if (userAccountIds.includes(data.accountId)) {
                    console.log(`[SSE] Sending notification to user ${userId} for account ${data.accountId}`);
                    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
                } else {
                    console.log(`[SSE] Filtered notification for user ${userId} - account ${data.accountId} not owned`);
                }
            };

            emitter.on('new_message', onMessage);

            // Send initial ping
            controller.enqueue(': ping\n\n');

            return () => {
                emitter.off('new_message', onMessage);
            };
        }
    }), {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};
