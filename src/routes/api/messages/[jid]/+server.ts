import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCanonicalContactNumber, getContactName } from '$lib/whatsapp';
import { sendWhatsAppMessage } from '$lib/whatsapp';
import { deleteWhatsAppMessageForEveryone } from '$lib/whatsapp';

// GET /api/messages/[jid]?accountId=xxx → messages for a conversation
export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = getCanonicalContactNumber(accountId, contactParam);

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const allMsgs = await db.all(sql`
        SELECT
            m.id,
            m.account_id AS accountId,
            m.contact_jid AS contactJid,
            m.from_me AS fromMe,
            m.body,
            m.media_type AS mediaType,
            m.timestamp,
            m.status
        FROM messages m
        WHERE m.account_id = ${accountId}
        ORDER BY m.timestamp ASC
        LIMIT 2000
    `);

    const msgs = (allMsgs as any[])
        .filter((m) => getCanonicalContactNumber(accountId, String(m.contactJid || '')) === contactNumber)
        .filter((m) => {
            const body = String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            const isGhostRow = !m.mediaType && !body && m.status !== 'deleted_me' && m.status !== 'deleted_everyone';
            return !isGhostRow;
        })
        .map((m) => ({
            ...m,
            body: String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
        }))
        .slice(-500);

    return json({
        messages: msgs,
        contactName: getContactName(accountId, `${contactNumber}@s.whatsapp.net`),
        contactNumber
    });
};

// POST /api/messages/[jid] → send a message to this contact
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { accountId, message, media } = await request.json();
    const text = String(message || '').trim();
    const hasMedia = Boolean(media?.data && media?.mimetype && media?.filename);
    if (!accountId || (!text && !hasMedia)) throw error(400, 'accountId ve message veya media gerekli');

    const contactJid = decodeURIComponent(params.jid);

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const number = contactJid.split('@')[0].replace(/\D/g, '');
    const result = await sendWhatsAppMessage(accountId, number, text, hasMedia ? media : undefined);

    if (!result.success) throw error(400, result.error || 'Mesaj gönderilemedi');

    return json({ success: true, remainingCredits: result.remainingCredits });
};

// DELETE /api/messages/[jid] → delete all messages for a conversation
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = getCanonicalContactNumber(accountId, contactParam);

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const rows = await db.all(sql`
        SELECT contact_jid
        FROM messages
        WHERE account_id = ${accountId}
    `);

    const targetJids = Array.from(new Set(
        (rows as any[])
            .map((r) => String(r.contact_jid || ''))
            .filter((jid) => getCanonicalContactNumber(accountId, jid) === contactNumber)
    ));

    for (const jid of targetJids) {
        await db.run(sql`
            DELETE FROM messages
            WHERE account_id = ${accountId}
              AND contact_jid = ${jid}
        `);
    }

    return json({ success: true });
};

// PATCH /api/messages/[jid]?accountId=xxx → delete single message
export const PATCH: RequestHandler = async ({ params, url, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const { messageId, deleteMode } = await request.json();
    if (!messageId || !['me', 'everyone'].includes(deleteMode)) {
        throw error(400, 'messageId ve geçerli deleteMode gerekli');
    }

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = getCanonicalContactNumber(accountId, contactParam);

    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

        const rows = await db.all(sql`
                SELECT id, contact_jid, from_me, timestamp
        FROM messages
        WHERE account_id = ${accountId}
          AND id = ${String(messageId)}
        LIMIT 1
    `);
    const target = (rows as any[])[0];
    if (!target) throw error(404, 'Mesaj bulunamadı');

    const targetNumber = getCanonicalContactNumber(accountId, String(target.contact_jid || ''));
    if (targetNumber !== contactNumber) throw error(400, 'Mesaj bu konuşmaya ait değil');

    if (deleteMode === 'everyone') {
        if (!Boolean(target.from_me)) {
            throw error(400, 'Sadece kendi gönderdiğiniz mesajı herkesten silebilirsiniz');
        }

        const rawTs = target.timestamp;
        const msgTs = typeof rawTs === 'number'
            ? (rawTs < 1e12 ? rawTs * 1000 : rawTs)
            : new Date(rawTs).getTime();
        const ageMs = Date.now() - msgTs;
        const within24Hours = ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
        if (!within24Hours) {
            throw error(400, 'Herkesten sil sadece son 24 saatte gönderilen mesajlarda kullanılabilir');
        }

        const prefix = `${accountId}:`;
        const rawMessageId = String(messageId).startsWith(prefix)
            ? String(messageId).slice(prefix.length)
            : String(messageId);
        const remoteJid = `${targetNumber}@s.whatsapp.net`;

        const revokeResult = await deleteWhatsAppMessageForEveryone(accountId, remoteJid, rawMessageId);
        if (!revokeResult.success) {
            throw error(400, revokeResult.error || 'Herkesten silme başarısız');
        }
    }

    const nextStatus = deleteMode === 'everyone' ? 'deleted_everyone' : 'deleted_me';
    await db.run(sql`
        UPDATE messages
        SET body = 'Bu mesaj silindi',
            media_type = NULL,
            status = ${nextStatus}
        WHERE account_id = ${accountId}
          AND id = ${String(messageId)}
    `);

    return json({ success: true });
};
