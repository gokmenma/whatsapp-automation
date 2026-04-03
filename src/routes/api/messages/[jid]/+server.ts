import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCanonicalContactNumber, getContactName, getAccountStatus } from '$lib/whatsapp';
import { sendWhatsAppMessage } from '$lib/whatsapp';
import { deleteWhatsAppMessageForEveryone } from '$lib/whatsapp';
import { editWhatsAppMessage } from '$lib/whatsapp';
import { markConversationAsReadOnWhatsApp } from '$lib/whatsapp';

function normalizeDirectDigits(value: string) {
    return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function resolveDirectConversationNumber(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';

    if (!raw.includes('@')) {
        return normalizeDirectDigits(raw);
    }

    const [, domain = ''] = raw.split('@');
    const digits = normalizeDirectDigits(raw);
    if ((domain === 's.whatsapp.net' || domain === 'c.us') && digits) {
        return digits;
    }

    return getCanonicalContactNumber(accountId, raw) || digits;
}

// GET /api/messages/[jid]?accountId=xxx → messages for a conversation
export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const isGroupChat = contactParam.endsWith('@g.us');
    const contactNumber = isGroupChat ? '' : resolveDirectConversationNumber(accountId, contactParam);
    const statusUser: any = getAccountStatus(accountId)?.user || {};
    const selfDigits = String(getAccountStatus(accountId)?.user?.id || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');
    const normalizeName = (value: unknown) => String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const selfNameSet = new Set(
        [statusUser?.name, statusUser?.verifiedName, statusUser?.notify]
            .map((value) => normalizeName(value))
            .filter(Boolean)
    );

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    // Mark incoming messages in this conversation as read in local DB so unread badge clears after opening.
    if (isGroupChat) {
        await db.run(sql`
            UPDATE messages
            SET status = 'read',
                is_read = 1
            WHERE account_id = ${accountId}
              AND contact_jid = ${contactParam}
              AND from_me = 0
              AND is_read = 0
        `);

        await markConversationAsReadOnWhatsApp(accountId, [contactParam]);
    } else {
        const rows = await db.all(sql`
            SELECT DISTINCT contact_jid
            FROM messages
            WHERE account_id = ${accountId}
        `);

        const targetJids = Array.from(new Set(
            (rows as any[])
                .map((r) => String(r.contact_jid || ''))
                .filter((jid) => resolveDirectConversationNumber(accountId, jid) === contactNumber)
        ));

        for (const jid of targetJids) {
            await db.run(sql`
                UPDATE messages
                SET status = 'read',
                    is_read = 1
                WHERE account_id = ${accountId}
                  AND contact_jid = ${jid}
                  AND from_me = 0
                  AND is_read = 0
            `);
        }

        await markConversationAsReadOnWhatsApp(accountId, targetJids);
    }

    const allMsgs = await db.all(sql`
        SELECT
            m.id,
            m.account_id AS accountId,
            m.contact_jid AS contactJid,
            m.sender_jid AS senderJid,
            m.sender_name AS senderName,
            m.from_me AS fromMe,
            m.body,
            m.media_type AS mediaType,
            m.quoted_msg_id AS quotedMsgId,
            m.quoted_msg_body AS quotedMsgBody,
            qm.media_type AS quotedMediaType,
            qm.body AS quotedSourceBody,
            m.reaction,
            m.edited_at AS editedAt,
            m.timestamp,
            m.status
        FROM messages m
        LEFT JOIN messages qm ON qm.account_id = m.account_id AND qm.id = m.quoted_msg_id
        WHERE m.account_id = ${accountId}
        ORDER BY m.timestamp DESC
        LIMIT 2000
    `);

    const msgs = (allMsgs as any[])
        .filter((m) => {
            const rowJid = String(m.contactJid || '');
            if (isGroupChat) return rowJid === contactParam;
            return resolveDirectConversationNumber(accountId, rowJid) === contactNumber;
        })
        .filter((m) => {
            const body = String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            const isGhostRow = !m.mediaType && !body && m.status !== 'deleted_me' && m.status !== 'deleted_everyone';
            return !isGhostRow;
        })
        .map((m) => ({
            ...m,
            // Some historical group rows were stored with wrong fromMe=false for own participant.
            // Derive a stable view-time flag so own messages render on the right.
            fromMe: Boolean(m.fromMe) || (
                isGroupChat &&
                (
                    (selfDigits.length > 0 &&
                        String(m.senderJid || '').split('@')[0].split(':')[0].replace(/\D/g, '') === selfDigits) ||
                    (selfNameSet.size > 0 && selfNameSet.has(normalizeName(m.senderName)))
                )
            ),
            body: String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim(),
            quotedMsgBody: String(m.quotedMsgBody || m.quotedSourceBody || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim() || null,
            senderName: isGroupChat
                ? (String(m.senderName || '').trim() || (m.senderJid ? getContactName(accountId, String(m.senderJid)) : null))
                : null
        }))
        .slice(0, 500)
        .reverse();

    return json({
        messages: msgs,
        contactName: getContactName(accountId, isGroupChat ? contactParam : `${contactNumber}@s.whatsapp.net`),
        contactNumber: isGroupChat ? contactParam.split('@')[0] : contactNumber
    });
};

// POST /api/messages/[jid] → send a message to this contact
export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { accountId, message, media, replyTo } = await request.json();
    const text = String(message || '').trim();
    const hasMedia = Boolean(media?.data && media?.mimetype && media?.filename);
    if (!accountId || (!text && !hasMedia)) throw error(400, 'accountId ve message veya media gerekli');

    const contactJid = decodeURIComponent(params.jid);

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const target = contactJid.endsWith('@g.us')
        ? contactJid
        : contactJid.split('@')[0].replace(/\D/g, '');
    const result = await sendWhatsAppMessage(accountId, target, text, hasMedia ? media : undefined, undefined, replyTo);

    if (!result.success) throw error(400, result.error || 'Mesaj gönderilemedi');

    return json({ success: true, remainingCredits: result.remainingCredits });
};

// DELETE /api/messages/[jid] → delete all messages for a conversation
export const DELETE: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = resolveDirectConversationNumber(accountId, contactParam);

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
            .filter((jid) => resolveDirectConversationNumber(accountId, jid) === contactNumber)
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

// PATCH /api/messages/[jid]?accountId=xxx → delete or edit single message
export const PATCH: RequestHandler = async ({ params, url, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const payload = await request.json();
    const messageId = String(payload?.messageId || '').trim();
    const deleteMode = payload?.deleteMode as 'me' | 'everyone' | undefined;
    const editMode = Boolean(payload?.editMode);
    const editedBody = String(payload?.editedBody || '').trim();

    if (!messageId) {
        throw error(400, 'messageId gerekli');
    }
    if (!editMode && !deleteMode) {
        throw error(400, 'deleteMode veya editMode gerekli');
    }
    if (deleteMode && !['me', 'everyone'].includes(deleteMode)) {
        throw error(400, 'geçerli deleteMode gerekli');
    }

    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = resolveDirectConversationNumber(accountId, contactParam);

    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

        const rows = await db.all(sql`
                                SELECT id, contact_jid, from_me, timestamp, media_type, status
        FROM messages
        WHERE account_id = ${accountId}
          AND id = ${String(messageId)}
        LIMIT 1
    `);
    const target = (rows as any[])[0];
    if (!target) throw error(404, 'Mesaj bulunamadı');

    const targetNumber = resolveDirectConversationNumber(accountId, String(target.contact_jid || ''));
    if (targetNumber !== contactNumber) throw error(400, 'Mesaj bu konuşmaya ait değil');

    if (editMode) {
        if (!Boolean(target.from_me)) {
            throw error(400, 'Sadece kendi gönderdiğiniz mesajı düzenleyebilirsiniz');
        }
        if (!editedBody) {
            throw error(400, 'Yeni mesaj metni boş olamaz');
        }
        if (String(target.status || '').startsWith('deleted')) {
            throw error(400, 'Silinen mesaj düzenlenemez');
        }

        const rawTs = target.timestamp;
        const msgTs = typeof rawTs === 'number'
            ? (rawTs < 1e12 ? rawTs * 1000 : rawTs)
            : new Date(rawTs).getTime();
        const ageMs = Date.now() - msgTs;
        const within15Minutes = ageMs >= 0 && ageMs <= 15 * 60 * 1000;
        if (!within15Minutes) {
            throw error(400, 'Mesaj sadece ilk 15 dakika içinde düzenlenebilir');
        }

        const prefix = `${accountId}:`;
        const rawMessageId = String(messageId).startsWith(prefix)
            ? String(messageId).slice(prefix.length)
            : String(messageId);
        const remoteJid = contactParam.endsWith('@g.us')
            ? contactParam
            : `${targetNumber}@s.whatsapp.net`;

        const editResult = await editWhatsAppMessage(accountId, remoteJid, rawMessageId, editedBody);
        if (!editResult.success) {
            throw error(400, editResult.error || 'Mesaj düzenlenemedi');
        }

        try {
            await db.run(sql`
                UPDATE messages
                SET body = ${editedBody},
                    edited_at = ${new Date()}
                WHERE account_id = ${accountId}
                  AND id = ${String(messageId)}
            `);
        } catch {
            // Fallback for older DB instances where edited_at is not yet present.
            await db.run(sql`
                UPDATE messages
                SET body = ${editedBody}
                WHERE account_id = ${accountId}
                  AND id = ${String(messageId)}
            `);
        }

        return json({ success: true, editedAt: Date.now() });
    }

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
