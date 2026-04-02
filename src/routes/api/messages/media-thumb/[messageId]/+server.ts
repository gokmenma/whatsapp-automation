import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { proto } from '@whiskeysockets/baileys';

const MEDIA_PATH = process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'media')
    : './media';

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });

    const messageId = decodeURIComponent(params.messageId);
    const colonIdx = messageId.indexOf(':');
    if (colonIdx === -1) return new Response('Bad Request', { status: 400 });

    const accountId = messageId.slice(0, colonIdx);
    const rawMsgId = messageId.slice(colonIdx + 1);

    if (accountId.includes('/') || accountId.includes('..') || rawMsgId.includes('/') || rawMsgId.includes('..')) {
        return new Response('Bad Request', { status: 400 });
    }

    try {
        const { db } = await import('$lib/server/db');
        const { accounts } = await import('$lib/server/db/schema');
        const { eq, and } = await import('drizzle-orm');
        const account = await db.select().from(accounts)
            .where(and(eq(accounts.id, accountId), eq(accounts.userId, locals.user.id)))
            .get();
        if (!account) return new Response('Forbidden', { status: 403 });
    } catch {
        return new Response('Internal Server Error', { status: 500 });
    }

    const rawPath = path.join(MEDIA_PATH, accountId, 'raw', `${rawMsgId}.bin`);
    if (!fs.existsSync(rawPath)) return new Response('Not Found', { status: 404 });

    try {
        const bytes = fs.readFileSync(rawPath);
        const decoded = proto.WebMessageInfo.decode(bytes) as any;
        const content = decoded.message?.ephemeralMessage?.message ||
            decoded.message?.viewOnceMessage?.message ||
            decoded.message?.viewOnceMessageV2?.message ||
            decoded.message;

        const thumb =
            content?.documentMessage?.jpegThumbnail ||
            content?.imageMessage?.jpegThumbnail ||
            content?.videoMessage?.jpegThumbnail ||
            null;

        if (!thumb) return new Response('Not Found', { status: 404 });

        const buf = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb);
        return new Response(new Uint8Array(buf), {
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'private, max-age=86400',
                'Content-Length': String(buf.byteLength)
            }
        });
    } catch {
        return new Response('Not Found', { status: 404 });
    }
};
