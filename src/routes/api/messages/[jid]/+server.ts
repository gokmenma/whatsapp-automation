import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getCanonicalContactNumber, getContactName, getAccountStatus, normalizeDigits, getJidForLid, getLidForJid, getJidForNumber } from '$lib/whatsapp';
import { markConversationAsReadOnWhatsApp } from '$lib/whatsapp';

// Moved normalizeDigits to lib/whatsapp.ts

// GET /api/messages/[jid]?accountId=xxx → messages for a conversation
export const GET: RequestHandler = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    const contactParam = decodeURIComponent(params.jid);
    const isGroupChat = contactParam.endsWith('@g.us');
    const contactNumber = isGroupChat ? '' : normalizeDigits(contactParam);

    const statusUser: any = getAccountStatus(accountId)?.user || {};
    const selfDigits = normalizeDigits(statusUser?.id || '');
    
    const normalizeNameForMatch = (value: unknown) => String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
        
    const selfNameSet = new Set(
        [statusUser?.name, statusUser?.verifiedName, statusUser?.notify]
            .map((value) => normalizeNameForMatch(value))
            .filter(Boolean)
    );

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account?.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account?.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

    // Build the list of JIDs that belong to this conversation
    let targetJidList: string[] = [contactParam];
    if (!isGroupChat && contactNumber) {
        // Use fast in-memory helpers instead of slow DB queries
        const phoneJid = `${contactNumber}@s.whatsapp.net`;
        if (phoneJid !== contactParam) targetJidList.push(phoneJid);
        
        // Try to find LID for this phone/contact
        const lid = getLidForJid(accountId, contactParam) || getLidForJid(accountId, phoneJid);
        if (lid && lid !== contactParam) targetJidList.push(lid);
        
        // Final fallback: check the number mapping specifically
        const resolvedNumberJid = getJidForNumber(accountId, contactNumber);
        if (resolvedNumberJid && !targetJidList.includes(resolvedNumberJid)) targetJidList.push(resolvedNumberJid);
    }

    // Ensure uniqueness
    targetJidList = Array.from(new Set(targetJidList));

    // Fetch messages
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const before = url.searchParams.get('before');
    const beforeDate = before ? new Date(Number(before) * 1000) : null;

    let queryFilter = sql`m.account_id = ${accountId} AND m.contact_jid IN (${sql.join(targetJidList, sql`, `)})`;
    if (beforeDate) {
        queryFilter = sql`${queryFilter} AND m.timestamp < ${beforeDate}`;
    }

    console.log(`[API] Fetching messages for account=${accountId}, contact=${contactParam}, targetJids=${targetJidList.join(', ')}`);

    const t0 = Date.now();
    const [queryResult] = await db.execute(sql`
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
            m.quoted_msg_sender_name AS quotedMsgSenderName, 
            m.reaction, 
            m.edited_at AS editedAt, 
            m.timestamp, 
            m.status, 
            m.is_read AS isRead
        FROM messages m
        WHERE ${queryFilter}
        ORDER BY m.timestamp DESC
        LIMIT ${limit + 1}
    `);
    const t1 = Date.now();
    console.log(`[API] Query took ${t1 - t0}ms for ${contactParam}`);

    // Offload background tasks (marking read) to avoid blocking the UI response
    void (async () => {
        try {
            // Mark as read in local DB
            await db.execute(sql`
                UPDATE messages
                SET status = 'read',
                    is_read = 1
                WHERE account_id = ${accountId}
                  AND contact_jid IN (${sql.join(targetJidList, sql`, `)})
                  AND from_me = 0
                  AND is_read = 0
            `);
            // Mark as read on WhatsApp
            await markConversationAsReadOnWhatsApp(accountId, targetJidList);
        } catch (e: any) {
            console.error(`[API] Background sync error for ${contactParam}:`, e?.message || e);
        }
    })();

    const rawMsgs = (queryResult as any) || [];
    const hasMore = rawMsgs.length > limit;
    const items = hasMore ? rawMsgs.slice(0, limit) : rawMsgs;

    const msgs = items
        .filter((m) => {
            const body = String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            const isGhostRow = !m.mediaType && !body && m.status !== 'deleted_me' && m.status !== 'deleted_everyone';
            return !isGhostRow;
        })
        .map((m) => {
            const date = new Date(m.timestamp);
            const timestamp = m.timestamp ? Math.floor(date.getTime() / 1000) : Math.floor(Date.now() / 1000);
            
            return {
                ...m,
                timestamp,
                fromMe: Boolean(m.fromMe) || (
                    isGroupChat &&
                    (
                        (selfDigits.length > 0 && normalizeDigits(m.senderJid) === selfDigits) ||
                        (selfNameSet.size > 0 && selfNameSet.has(normalizeNameForMatch(m.senderName)))
                    )
                ),
                body: String(m.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim(),
                quotedMsgBody: String(m.quotedMsgBody || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim() || null,
                quotedMsgSenderName: String(m.quotedMsgSenderName || '').trim() || null,
                senderName: isGroupChat
                    ? (String(m.senderName || '').trim() || (m.senderJid ? getContactName(accountId, String(m.senderJid)) : null))
                    : null
            };
        });

    console.log(`[API] Returning ${msgs.length} messages for ${contactParam}`);

    const contactName = isGroupChat ? contactParam : (contactNumber + '@s.whatsapp.net');

    return json({
        messages: msgs,
        hasMore,
        contactName: getContactName(accountId, contactName) || contactNumber,
        contactNumber: isGroupChat ? contactParam.split('@')[0] : contactNumber
    });
};

// POST ... (same as before)
export const POST = async ({ params, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const { accountId, message, media, replyTo } = await request.json();
    const text = String(message || '').trim();
    const hasMedia = Boolean(media?.data && media?.mimetype && media?.filename);
    if (!accountId || (!text && !hasMedia)) throw error(400, 'accountId ve message veya media gerekli');
    const contactJid = decodeURIComponent(params.jid);
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);
    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');
    const { sendWhatsAppMessage } = await import('$lib/whatsapp');
    const target = contactJid.endsWith('@g.us') ? contactJid : contactJid.split('@')[0].replace(/\D/g, '');
    const result = await sendWhatsAppMessage(accountId, target, text, hasMedia ? media : undefined, undefined, replyTo);
    if (!result.success) throw error(400, result.error || 'Mesaj gönderilemedi');
    return json({ success: true, remainingCredits: result.remainingCredits });
};

// DELETE ... (skip for brevity, unchanged)
export const DELETE = async ({ params, url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');
    const contactParam = decodeURIComponent(params.jid);
    const contactNumber = normalizeDigits(contactParam);
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);
    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');
    const jidRows = await db.execute(sql`SELECT DISTINCT contact_jid FROM messages WHERE account_id = ${accountId}`);
    const targetJids = (jidRows as any[]).map(r => String(r.contact_jid)).filter(jid => normalizeDigits(jid) === contactNumber);
    for (const jid of targetJids) { await db.execute(sql`DELETE FROM messages WHERE account_id = ${accountId} AND contact_jid = ${jid}`); }
    return json({ success: true });
};

// PATCH ... (skip for brevity, unchanged)
export const PATCH = async ({ params, url, request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');
    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');
    const payload = await request.json();
    const messageId = String(payload?.messageId || '').trim();
    const deleteMode = payload?.deleteMode as 'me' | 'everyone' | undefined;
    const editMode = Boolean(payload?.editMode);
    const editedBody = String(payload?.editedBody || '').trim();
    if (!messageId) throw error(400, 'messageId gerekli');
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);
    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');
    const [rows]: any = await db.execute(sql`SELECT * FROM messages WHERE account_id = ${accountId} AND id = ${String(messageId)} LIMIT 1`);
    const target = (rows as any[])[0];
    if (!target) throw error(404, 'Mesaj bulunamadı');
    const { editWhatsAppMessage, deleteWhatsAppMessageForEveryone } = await import('$lib/whatsapp');
    const contactParam = decodeURIComponent(params.jid);
    const remoteJid = contactParam.endsWith('@g.us') ? contactParam : `${normalizeDigits(contactParam)}@s.whatsapp.net`;
    if (editMode) {
        const result = await editWhatsAppMessage(accountId, remoteJid, messageId.split(':').pop()!, editedBody);
        if (!result.success) throw error(400, result.error || 'Düzenleme başarısız');
        await db.execute(sql`UPDATE messages SET body = ${editedBody}, edited_at = ${new Date()} WHERE account_id = ${accountId} AND id = ${messageId}`);
        return json({ success: true });
    }
    if (deleteMode === 'everyone') {
        const result = await deleteWhatsAppMessageForEveryone(accountId, remoteJid, messageId.split(':').pop()!);
        if (!result.success) throw error(400, result.error || 'Silme başarısız');
    }
    const nextStatus = deleteMode === 'everyone' ? 'deleted_everyone' : 'deleted_me';
    await db.execute(sql`UPDATE messages SET body = 'Bu mesaj silindi', media_type = NULL, status = ${nextStatus} WHERE account_id = ${accountId} AND id = ${messageId}`);
    return json({ success: true });
};
