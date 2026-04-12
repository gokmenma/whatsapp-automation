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

    // Always prefer canonical normalization to handle LID <-> Phone mapping
    return getCanonicalContactNumber(accountId, raw) || normalizeDirectDigits(raw);
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

    // Parallelize account fetch and JID listing
    const [accountResult, jidRows] = await Promise.all([
        db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1),
        isGroupChat ? Promise.resolve([]) : db.execute(sql`SELECT DISTINCT contact_jid FROM messages WHERE account_id = ${accountId}`)
    ]);
    
    const account = accountResult[0];
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account?.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account?.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

    // To efficiently fetch only relevant messages in SQL, we collect all JIDs first
    const targetJidList: string[] = [];
    if (isGroupChat) {
        targetJidList.push(contactParam);
    } else {
        (jidRows as any[]).forEach(r => {
            const jid = String(r.contact_jid || '');
            if (resolveDirectConversationNumber(accountId, jid) === contactNumber) {
                targetJidList.push(jid);
            }
        });
    }

    if (targetJidList.length === 0) {
        return json({ messages: [], hasMore: false });
    }

    // Mark as read and fetch messages in parallel
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const before = url.searchParams.get('before');
    const beforeDate = before ? new Date(Number(before) * 1000) : null;

    let queryFilter = sql`m.account_id = ${accountId} AND m.contact_jid IN (${sql.join(targetJidList, sql`, `)})`;
    if (beforeDate) {
        queryFilter = sql`${queryFilter} AND m.timestamp < ${beforeDate}`;
    }

    const [allMsgs] = await Promise.all([
        db.execute(sql`
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
            WHERE ${queryFilter}
            ORDER BY m.timestamp DESC
            LIMIT ${limit + 1}
        `),
        // Mark as read in local DB
        db.execute(sql`
            UPDATE messages
            SET status = 'read',
                is_read = 1
            WHERE account_id = ${accountId}
              AND contact_jid IN (${sql.join(targetJidList, sql`, `)})
              AND from_me = 0
              AND is_read = 0
        `),
        // Mark as read on WhatsApp (async, don't strictly need to wait but we do for consistency)
        markConversationAsReadOnWhatsApp(accountId, targetJidList)
    ]);

    const rawMsgs = (allMsgs as any[]) || [];
    const hasMore = rawMsgs.length > limit;
    const items = hasMore ? rawMsgs.slice(0, limit) : rawMsgs;

    const msgs = items
        .filter((m) => {
            const body = String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            const isGhostRow = !m.mediaType && !body && m.status !== 'deleted_me' && m.status !== 'deleted_everyone';
            return !isGhostRow;
        })
        .map((m) => {
            const rawTs = m.timestamp;
            let timestamp: number;
            
            if (rawTs instanceof Date) {
                timestamp = Math.floor(rawTs.getTime() / 1000);
            } else if (typeof rawTs === 'number') {
                timestamp = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
            } else if (rawTs && !isNaN(Date.parse(String(rawTs)))) {
                timestamp = Math.floor(new Date(String(rawTs)).getTime() / 1000);
            } else {
                timestamp = Math.floor(Date.now() / 1000);
            }
            
            return {
                ...m,
                timestamp,
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
            };
        });

    return json({
        messages: msgs,
        hasMore,
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

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];

    // Verify account belongs to user (Admins/Superadmins can see all non-private accounts)
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

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

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];

    // Verify account belongs to user (Admins/Superadmins can see all non-private accounts)
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

    const [rows]: any = await db.execute(sql`
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
        await db.execute(sql`
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

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];

    // Verify account belongs to user (Admins/Superadmins can see all non-private accounts)
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

        const [rows]: any = await db.execute(sql`
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
            await db.execute(sql`
                UPDATE messages
                SET body = ${editedBody},
                    edited_at = ${new Date()}
                WHERE account_id = ${accountId}
                  AND id = ${String(messageId)}
            `);
        } catch {
            // Fallback for older DB instances where edited_at is not yet present.
            await db.execute(sql`
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
    await db.execute(sql`
        UPDATE messages
        SET body = 'Bu mesaj silindi',
            media_type = NULL,
            status = ${nextStatus}
        WHERE account_id = ${accountId}
          AND id = ${String(messageId)}
    `);

    return json({ success: true });
};
