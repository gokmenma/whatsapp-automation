import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { downloadMediaMessage, proto } from '@whiskeysockets/baileys';
import { getWhatsAppClient } from '$lib/whatsapp';

const MEDIA_PATH = process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'media')
    : './media';

const MIME_TYPES: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    pdf: 'application/pdf',
};

export const GET: RequestHandler = async ({ params, locals }) => {
    if (!locals.user) return new Response('Unauthorized', { status: 401 });

    // messageId format: "accountId:rawMsgId"
    const messageId = decodeURIComponent(params.messageId);
    const colonIdx = messageId.indexOf(':');
    if (colonIdx === -1) return new Response('Bad Request', { status: 400 });

    const accountId = messageId.slice(0, colonIdx);
    const rawMsgId = messageId.slice(colonIdx + 1);

    // Prevent path traversal
    if (accountId.includes('/') || accountId.includes('..') || rawMsgId.includes('/') || rawMsgId.includes('..')) {
        return new Response('Bad Request', { status: 400 });
    }

    // Verify user owns this account
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

    const mediaDir = path.join(MEDIA_PATH, accountId);
    if (!fs.existsSync(mediaDir)) return new Response('Not Found', { status: 404 });

    // Find file that starts with rawMsgId
    let matchedFile: string | undefined;
    try {
        const files = fs.readdirSync(mediaDir);
        matchedFile = files.find(f => f.startsWith(rawMsgId + '.'));
    } catch {
        return new Response('Not Found', { status: 404 });
    }

    if (!matchedFile) {
        // No file on disk — try lazy download using stored proto bytes
        const rawDir = path.join(MEDIA_PATH, accountId, 'raw');
        const rawPath = path.join(rawDir, `${rawMsgId}.bin`);
        if (!fs.existsSync(rawPath)) return new Response('Not Found', { status: 404 });

        try {
            const bytes = fs.readFileSync(rawPath);
            const decoded = proto.WebMessageInfo.decode(bytes) as any;

            // Figure out media type and extension from the decoded message
            const content = decoded.message?.ephemeralMessage?.message ||
                decoded.message?.viewOnceMessage?.message ||
                decoded.message?.viewOnceMessageV2?.message ||
                decoded.message;
            
            const mimeRaw: string =
                content?.imageMessage?.mimetype ||
                content?.videoMessage?.mimetype ||
                content?.audioMessage?.mimetype ||
                content?.documentMessage?.mimetype || 'application/octet-stream';
            
            const extPart = mimeRaw.split('/')[1]?.split(';')[0]?.split('+')[0] || 'bin';
            const ext = extPart === 'jpeg' ? 'jpg' : extPart;

            const client = getWhatsAppClient(accountId) as any;
            const buffer = await downloadMediaMessage(decoded, 'buffer', {}, {
                reuploadRequest: client?.updateMediaMessage
            }) as Buffer;
            
            const filePath = path.join(MEDIA_PATH, accountId, `${rawMsgId}.${ext}`);
            fs.writeFileSync(filePath, buffer);

            const contentType = MIME_TYPES[ext] || mimeRaw;
            return new Response(new Uint8Array(buffer), {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'private, max-age=86400',
                    'Content-Length': String(buffer.byteLength)
                }
            });
        } catch (err: any) {
            console.error('[media] Lazy download error:', err.message);
            return new Response('Not Found', { status: 404 });
        }
    }

    const filePath = path.join(mediaDir, matchedFile);
    const ext = path.extname(matchedFile).slice(1).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
        const data = fs.readFileSync(filePath);
        return new Response(new Uint8Array(data), {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'private, max-age=86400',
                'Content-Length': String(data.byteLength)
            }
        });
    } catch {
        return new Response('Not Found', { status: 404 });
    }
};
