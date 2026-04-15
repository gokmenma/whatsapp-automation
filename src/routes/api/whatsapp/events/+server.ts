
import { getMessageEmitter } from '$lib/whatsapp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
    if (!locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;

    // Shared cleanup function assigned inside start(), called from cancel()
    let cleanup: (() => void) | null = null;

    return new Response(new ReadableStream({
        async start(controller) {
            const emitter = getMessageEmitter();
            const { db } = await import('$lib/server/db');
            const { accounts } = await import('$lib/server/db/schema');
            const accountRows = await db
                .select({
                    id: accounts.id,
                    userId: accounts.userId,
                    scannerId: accounts.scannerId,
                    isPrivate: accounts.isPrivate
                })
                .from(accounts);

            const role = String(locals.user?.role || '').trim();
            const userIdNum = Number(userId);

            // Mirror the access model used across message APIs:
            // owner can receive their own account events, scanners receive assigned accounts,
            // admins/superadmins can receive non-private account events.
            const userAccountIds = accountRows
                .filter((account) => {
                    const isOwner = String(account.userId || '') === String(userId);
                    const isScanner = role === 'qrcode_scanner' && Number(account.scannerId) === userIdNum;
                    const isAdminOrSuper = (role === 'admin' || role === 'superadmin') && !Boolean(account.isPrivate);
                    return isOwner || isScanner || isAdminOrSuper;
                })
                .map((account) => String(account.id));

            let closed = false;

            const safeEnqueue = (chunk: string) => {
                if (closed) return;
                try {
                    controller.enqueue(chunk);
                } catch {
                    closed = true;
                    cleanup?.();
                }
            };

            const onMessage = (data: { accountId: string; id: string; jid: string; body: string; pushName: string; fromMe?: boolean; timestamp?: number }) => {
                if (!userAccountIds.includes(data.accountId)) return;
                console.log(`[SSE] Sending notification to user ${userId} for account ${data.accountId}`);
                safeEnqueue(`data: ${JSON.stringify(data)}\n\n`);
            };

            const onTyping = (data: { accountId: string; chatJid: string; participantJid?: string | null; participantName?: string | null; presence: string; timestamp?: number }) => {
                if (!userAccountIds.includes(data.accountId)) return;
                safeEnqueue(`event: typing\ndata: ${JSON.stringify(data)}\n\n`);
            };

            const onRaw = (data: { accountId: string; message: string }) => {
                if (!userAccountIds.includes(data.accountId)) return;
                safeEnqueue(data.message);
            };

            cleanup = () => {
                if (closed) return;
                closed = true;
                emitter.off('new_message', onMessage);
                emitter.off('typing', onTyping);
                emitter.off('sse_raw', onRaw);
            };

            emitter.on('new_message', onMessage);
            emitter.on('typing', onTyping);
            emitter.on('sse_raw', onRaw);

            // Send initial ping
            safeEnqueue(': ping\n\n');
        },
        cancel() {
            cleanup?.();
        }
    }), {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};
