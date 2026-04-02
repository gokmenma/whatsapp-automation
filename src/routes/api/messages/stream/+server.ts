import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';

function encoder() {
    return new TextEncoder();
}

function sseData(event: string, payload: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

// GET /api/messages/stream?accountId=xxx -> server-sent events for conversation updates
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = String(url.searchParams.get('accountId') || '').trim();
    if (!accountId) throw error(400, 'accountId gerekli');

    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const textEncoder = encoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let lastFingerprint = '';

            const pushEvent = (event: string, payload: unknown) => {
                controller.enqueue(textEncoder.encode(sseData(event, payload)));
            };

            const sendSnapshotIfChanged = async () => {
                try {
                    const row = await db.get(sql`
                        SELECT
                            COALESCE(MAX(timestamp), 0) AS max_ts,
                            COUNT(*) AS total_count,
                            SUM(
                                CASE
                                    WHEN from_me = 0
                                     AND status NOT IN ('read', 'played', 'deleted_me', 'deleted_everyone')
                                    THEN 1
                                    ELSE 0
                                END
                            ) AS unread_count
                        FROM messages
                        WHERE account_id = ${accountId}
                    `) as any;

                    const maxTs = Number(row?.max_ts || 0);
                    const totalCount = Number(row?.total_count || 0);
                    const unreadCount = Number(row?.unread_count || 0);
                    const fingerprint = `${maxTs}|${totalCount}|${unreadCount}`;

                    if (fingerprint !== lastFingerprint) {
                        lastFingerprint = fingerprint;
                        pushEvent('messages', { maxTs, totalCount, unreadCount, fingerprint, accountId });
                    }
                } catch (e: any) {
                    pushEvent('error', { message: String(e?.message || 'stream-error') });
                }
            };

            pushEvent('ready', { accountId });
            void sendSnapshotIfChanged();

            const pollId = setInterval(() => {
                void sendSnapshotIfChanged();
            }, 1500);

            const keepAliveId = setInterval(() => {
                controller.enqueue(textEncoder.encode(': keepalive\n\n'));
            }, 15000);

            return () => {
                clearInterval(pollId);
                clearInterval(keepAliveId);
            };
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive'
        }
    });
};
