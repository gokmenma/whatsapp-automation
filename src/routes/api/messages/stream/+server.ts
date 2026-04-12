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

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const accountRes = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountRes[0];
    if (!account) throw error(404, 'Hesap bulunamadı');

    // Verify account belongs to user (Admins/Superadmins can see all non-private accounts)
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

    if (!canAccess) throw error(403, 'Erişim reddedildi');

    const textEncoder = encoder();
    let pollId: ReturnType<typeof setInterval> | null = null;
    let keepAliveId: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let lastFingerprint = '';

            const pushEvent = (event: string, payload: unknown) => {
                controller.enqueue(textEncoder.encode(sseData(event, payload)));
            };

            const sendSnapshotIfChanged = async () => {
                try {
                    const [rows]: any = await db.execute(sql`
                        SELECT
                            MAX(COALESCE(edited_at, timestamp)) AS max_update,
                            COUNT(*) AS total_count,
                            SUM(
                                CASE
                                    WHEN from_me = 0
                                     AND status NOT IN ('read', 'played', 'deleted_me', 'deleted_everyone')
                                    THEN 1
                                    ELSE 0
                                END
                            ) AS unread_count,
                            SUM(COALESCE(CHAR_LENGTH(reaction), 0)) AS reaction_sum
                        FROM messages
                        WHERE account_id = ${accountId}
                    `);
                    const row = (rows as any[])[0];

                    const rawMaxUpdate = row?.max_update;
                    const maxUpdate = rawMaxUpdate instanceof Date 
                        ? rawMaxUpdate.getTime() 
                        : (rawMaxUpdate ? new Date(rawMaxUpdate).getTime() : 0);
                    
                    const totalCount = Number(row?.total_count || 0);
                    const unreadCount = Number(row?.unread_count || 0);
                    const reactionSum = Number(row?.reaction_sum || 0);
                    const fingerprint = `${maxUpdate}|${totalCount}|${unreadCount}|${reactionSum}`;

                    if (fingerprint !== lastFingerprint) {
                        lastFingerprint = fingerprint;
                        pushEvent('messages', { maxUpdate, totalCount, unreadCount, fingerprint, accountId });
                    }
                } catch (e: any) {
                    pushEvent('error', { message: String(e?.message || 'stream-error') });
                }
            };

            pushEvent('ready', { accountId });
            void sendSnapshotIfChanged();

            pollId = setInterval(() => {
                void sendSnapshotIfChanged();
            }, 5000);

            keepAliveId = setInterval(() => {
                controller.enqueue(textEncoder.encode(': keepalive\n\n'));
            }, 15000);
        },
        cancel() {
            if (pollId) {
                clearInterval(pollId);
                pollId = null;
            }
            if (keepAliveId) {
                clearInterval(keepAliveId);
                keepAliveId = null;
            }
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
