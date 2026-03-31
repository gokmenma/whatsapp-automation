import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCanonicalContactNumber, getContactName, getContactNameAsync, markWhatsAppRead } from '$lib/whatsapp';
import { sendWhatsAppMessage } from '$lib/whatsapp';
import { deleteWhatsAppMessageForEveryone, editWhatsAppMessage } from '$lib/whatsapp';

// GET /api/messages/[jid]?accountId=xxx → messages for a conversation
export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = getCanonicalContactNumber(accountId, contactParam);
    const resolvedJid = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    // Async tasks: resolution and read receipt
    const [nameResult] = await Promise.all([
        getContactNameAsync(accountId, resolvedJid),
        markWhatsAppRead(accountId, resolvedJid)
    ]);

    const allMsgs = await db.all(sql`
        SELECT
            m.id,
            m.account_id AS accountId,
            m.contact_jid AS contactJid,
            m.from_me AS fromMe,
            m.body,
            m.media_type AS mediaType,
            m.timestamp,
            m.status,
            m.sender_jid AS senderJid,
            m.quoted_msg_id AS quotedMsgId,
            m.quoted_msg_body AS quotedMsgBody,
            m.reaction
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
            fromMe: Boolean(m.fromMe), // Explicit cast for UI
            body: String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim(),
            senderName: m.senderJid ? getContactName(accountId, m.senderJid) : null,
            reaction: m.reaction
        }))
        .slice(-500);

    return json({
        messages: msgs,
        contactName: nameResult.name,
        participants: nameResult.participants,
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

    const to = contactJid.includes('@') ? contactJid : contactJid.replace(/\D/g, '');
    const result = await sendWhatsAppMessage(accountId, to, text, hasMedia ? media : undefined);

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

// PATCH /api/messages/[jid]?accountId=xxx → update/delete single message
export const PATCH: RequestHandler = async ({ params, url, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const { messageId, action, deleteMode, newText, isMuted } = await request.json();
    
    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = getCanonicalContactNumber(accountId, contactParam);
    const resolvedJid = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;

    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    if (action === 'mute') {
        const duration = isMuted; // Actually duration passed in the request
        let muteUntilVal = null;
        let isMutedBool = false;

        if (duration === -1) {
            // Always (100 years)
            muteUntilVal = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
            isMutedBool = true;
        } else if (typeof duration === 'number' && duration > 0) {
            // Minutes (8h = 480, 1w = 10080)
            muteUntilVal = new Date(Date.now() + duration * 60000);
            isMutedBool = true;
        } else if (duration === false || duration === 0) {
            // Unmute
            muteUntilVal = null;
            isMutedBool = false;
        }

        await db.run(sql`
            INSERT INTO chats (account_id, contact_jid, is_muted, mute_until)
            VALUES (${accountId}, ${resolvedJid}, ${isMutedBool ? 1 : 0}, ${muteUntilVal})
            ON CONFLICT(account_id, contact_jid) 
            DO UPDATE SET is_muted = excluded.is_muted, mute_until = excluded.mute_until
        `);
        return json({ success: true, isMuted: isMutedBool, muteUntil: muteUntilVal });
    }
    
    if (!messageId) throw error(400, 'messageId gerekli');

    const rows = await db.all(sql`
        SELECT id, contact_jid, from_me, timestamp, media_type
        FROM messages
        WHERE account_id = ${accountId}
          AND id = ${String(messageId)}
        LIMIT 1
    `);
    const target = (rows as any[])[0];
    if (!target) throw error(404, 'Mesaj bulunamadı');

    const targetNumber = getCanonicalContactNumber(accountId, String(target.contact_jid || ''));
    if (targetNumber !== contactNumber) throw error(400, 'Mesaj bu konuşmaya ait değil');

    const prefix = `${accountId}:`;
    const rawMessageId = String(messageId).startsWith(prefix)
        ? String(messageId).slice(prefix.length)
        : String(messageId);
    const remoteJid = targetNumber.includes('@') ? targetNumber : `${targetNumber}@s.whatsapp.net`;

    if (action === 'edit') {
        if (!Boolean(target.from_me)) {
            throw error(400, 'Sadece kendi gönderdiğiniz mesajları düzenleyebilirsiniz');
        }
        if (target.media_type) {
            throw error(400, 'Medya mesajları düzenlenemez, sadece metin mesajları düzenlenebilir');
        }
        if (!newText || !newText.trim()) {
            throw error(400, 'Yeni mesaj metni gerekli');
        }

        const rawTs = target.timestamp;
        const msgTs = typeof rawTs === 'number'
            ? (rawTs < 1e12 ? rawTs * 1000 : rawTs)
            : new Date(rawTs).getTime();
        const ageMinutes = (Date.now() - msgTs) / (1000 * 60);

        if (ageMinutes > 15) {
            throw error(400, 'Mesajlar sadece ilk 15 dakika içinde düzenlenebilir');
        }

        const editResult = await editWhatsAppMessage(accountId, remoteJid, rawMessageId, newText.trim());
        if (!editResult.success) {
            throw error(400, editResult.error || 'Mesaj düzenleme başarısız');
        }

        await db.run(sql`
            UPDATE messages
            SET body = ${newText.trim()}
            WHERE account_id = ${accountId}
              AND id = ${String(messageId)}
        `);

        return json({ success: true });
    }

    // Default to delete behavior for backward compatibility if action is not 'edit'
    const mode = deleteMode || 'me';
    if (!['me', 'everyone'].includes(mode)) {
        throw error(400, 'Geçerli deleteMode gerekli');
    }

    if (mode === 'everyone') {
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

        const revokeResult = await deleteWhatsAppMessageForEveryone(accountId, remoteJid, rawMessageId);
        if (!revokeResult.success) {
            throw error(400, revokeResult.error || 'Herkesten silme başarısız');
        }
    }

    const nextStatus = mode === 'everyone' ? 'deleted_everyone' : 'deleted_me';
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
