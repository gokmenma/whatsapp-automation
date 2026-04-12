import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName } from '$lib/whatsapp';

let messagesConversationIndexEnsured = false;

async function ensureMessagesConversationIndex() {
    if (messagesConversationIndexEnsured) return;

    try {
        await db.execute(sql`
            CREATE INDEX messages_account_timestamp_idx
            ON messages (account_id, timestamp DESC)
        `);
    } catch (e) {
        // Index might already exist
    }

    messagesConversationIndexEnsured = true;
}

function normalizeDirectKey(value: string) {
    return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function resolveDirectConversationNumber(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';

    if (!raw.includes('@')) {
        return normalizeDirectKey(raw);
    }

    // Always prefer canonical normalization to handle LID <-> Phone mapping
    return getCanonicalContactNumber(accountId, raw) || normalizeDirectKey(raw);
}

function getConversationKey(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@g.us')) return raw;
    
    // Priority 1: Use canonical resolution (Phone <-> LID mapping)
    const resolved = getCanonicalContactNumber(accountId, raw);
    if (resolved && !resolved.startsWith('lid_')) return resolved;

    // Priority 2: Standard phone digits
    const directDigits = normalizeDirectKey(raw);
    if (directDigits) return directDigits;

    // Priority 3: Final fallback
    return resolved || raw;
}

// GET /api/messages?accountId=xxx  → list of conversations with latest message
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    await ensureMessagesConversationIndex();

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');
    const resolvedAccountId = accountId;

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const account = accountResult[0];

    // Verify account belongs to user (Admins/Superadmins can see all non-private accounts)
    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

    const [preferenceRows]: any = await db.execute(sql`
        SELECT
            contact_key,
            muted,
            archived
        FROM conversation_preferences
        WHERE account_id = ${accountId}
    `);
    const preferenceMap = new Map(
        (preferenceRows as any[]).map((row) => [
            String(row.contact_key || ''),
            {
                muted: Boolean(row.muted),
                archived: Boolean(row.archived)
            }
        ])
    );

    const selfNumber = String(getAccountStatus(accountId)?.user?.id || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

    // One CTE query: returns 1 row per conversation with unread counts & preview.
    // Much faster than fetching raw message rows and aggregating in 
    const [rows]: any = await db.execute(sql`
        WITH base AS (
            SELECT
                id,
                contact_jid,
                from_me,
                body,
                media_type,
                timestamp,
                status,
                sender_jid,
                quoted_msg_id,
                quoted_msg_body,
                reaction,
                sender_name,
                edited_at,
                is_read,
                ROW_NUMBER() OVER (PARTITION BY contact_jid ORDER BY timestamp DESC) as rn
            FROM messages
            WHERE account_id = ${accountId}
              AND contact_jid NOT LIKE '%@newsletter'
              AND contact_jid NOT LIKE '%@broadcast'
        ),
        unread AS (
            SELECT
                contact_jid,
                body,
                sender_name,
                media_type,
                timestamp,
                status,
                ROW_NUMBER() OVER (PARTITION BY contact_jid ORDER BY timestamp DESC) AS rn
            FROM messages
            WHERE account_id = ${accountId}
              AND from_me = 0
              AND contact_jid NOT LIKE '%@newsletter'
              AND contact_jid NOT LIKE '%@broadcast'
              AND status NOT IN ('read', 'played', 'deleted_me', 'deleted_everyone')
        )
        SELECT
            b.contact_jid,
            b.sender_name,
            b.body,
            b.from_me,
            b.media_type,
            b.timestamp,
            b.status,
            COALESCE(uc.cnt, 0)  AS unread_count,
            lu.body              AS up_body,
            lu.sender_name       AS up_sender,
            lu.status            AS up_status,
            lu.media_type        AS up_media_type,
            lu.timestamp         AS up_timestamp
        FROM (SELECT * FROM base WHERE rn = 1) b
        LEFT JOIN (
            SELECT contact_jid, COUNT(*) AS cnt FROM unread GROUP BY contact_jid
        ) uc ON b.contact_jid = uc.contact_jid
        LEFT JOIN (SELECT * FROM unread WHERE rn = 1) lu ON b.contact_jid = lu.contact_jid
        ORDER BY b.timestamp DESC
        LIMIT 300
    `);

    // console.log(`[MessagesAPI] Found ${rows.length} base conversations for account ${accountId}`);
    // if (rows.length === 0) {
    //     console.warn(`[MessagesAPI] No conversations found in DB for accountId=${accountId}`);
    // }

    const byCanonical = new Map<string, any>();
    const directNumberCache = new Map<string, string>();
    const conversationNameCache = new Map<string, string>();

    function buildPreviewText(body: string, senderName: string, isGroup: boolean, fromMe: boolean) {
        const cleaned = body.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (!cleaned) return '';
        if (isGroup && !fromMe) {
            const sender = senderName.trim();
            if (sender) return `${sender}: ${cleaned}`;
        }
        return cleaned;
    }

    function resolveNumberForJid(jid: string, isGroup: boolean) {
        if (isGroup) return jid.split('@')[0];
        const cached = directNumberCache.get(jid);
        if (cached !== undefined) return cached;
        const resolved = resolveDirectConversationNumber(resolvedAccountId, jid) || '';
        directNumberCache.set(jid, resolved);
        return resolved;
    }

    function resolveConversationName(jid: string, isGroup: boolean, number: string) {
        const key = isGroup ? `group:${jid}` : `direct:${number}`;
        const cached = conversationNameCache.get(key);
        if (cached !== undefined) return cached;
        const resolved = isGroup
            ? (getContactName(resolvedAccountId, jid) || '')
            : (getContactName(resolvedAccountId, jid) || getContactName(resolvedAccountId, `${number}@s.whatsapp.net`) || '');
        conversationNameCache.set(key, resolved);
        return resolved;
    }

    // Each row is already the latest message for its conversation — O(conversations) not O(messages)
    for (const row of rows as any[]) {
        const jid = String(row.contact_jid || '');
        if (!jid) continue;

        const isGroup = jid.endsWith('@g.us');
        const number = resolveNumberForJid(jid, isGroup);
        if (!number) {
            console.warn(`[MessagesAPI] Could not resolve number for JID: ${jid}`);
            continue;
        }

        const rowBody = String(row.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        // Catch zero-width-space ghost rows that SQL couldn't filter
        const isGhostRow = !row.media_type && !rowBody && row.status !== 'deleted_me' && row.status !== 'deleted_everyone';
        if (isGhostRow) continue;

        const conversationKey = isGroup ? jid : number;
        if (byCanonical.has(conversationKey)) continue; // deduplicate same-number different-JID variants

        const prefs = preferenceMap.get(conversationKey);
        const resolvedName = resolveConversationName(jid, isGroup, number);

        const lastMessage = buildPreviewText(rowBody, String(row.sender_name || ''), isGroup, Boolean(row.from_me));

        const upBody = String(row.up_body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        const unreadPreviewText = buildPreviewText(upBody, String(row.up_sender || ''), isGroup, false);

        const rawTs = row.timestamp;
        let lastMessageAt: number;
        if (rawTs instanceof Date) {
            lastMessageAt = Math.floor(rawTs.getTime() / 1000);
        } else if (typeof rawTs === 'number') {
            lastMessageAt = rawTs > 1e12 ? Math.floor(rawTs / 1000) : rawTs;
        } else if (rawTs && !isNaN(Date.parse(String(rawTs)))) {
            lastMessageAt = Math.floor(new Date(String(rawTs)).getTime() / 1000);
        } else {
            lastMessageAt = Math.floor(Date.now() / 1000);
        }

        const upRawTs = row.up_timestamp;
        let unreadPreviewAt: number;
        if (upRawTs instanceof Date) {
            unreadPreviewAt = Math.floor(upRawTs.getTime() / 1000);
        } else if (typeof upRawTs === 'number') {
            unreadPreviewAt = upRawTs > 1e12 ? Math.floor(upRawTs / 1000) : (Number(upRawTs) || 0);
        } else if (upRawTs && !isNaN(Date.parse(String(upRawTs)))) {
            unreadPreviewAt = Math.floor(new Date(String(upRawTs)).getTime() / 1000);
        } else {
            unreadPreviewAt = 0;
        }

        byCanonical.set(conversationKey, {
            contactJid: jid,
            name: resolvedName,
            number,
            lastMessage: lastMessage || rowBody,
            lastMessageFromMe: Boolean(row.from_me),
            lastMessageStatus: String(row.status || ''),
            lastMessageMediaType: row.media_type,
            lastMessageAt,
            unreadPreview: unreadPreviewText,
            unreadPreviewFromMe: false,
            unreadPreviewStatus: String(row.up_status || ''),
            unreadPreviewMediaType: row.up_media_type || null,
            unreadPreviewAt,
            unreadCount: Number(row.unread_count || 0),
            muted: Boolean(prefs?.muted),
            archived: Boolean(prefs?.archived)
        });
    }

    const conversations = Array.from(byCanonical.values())
        .sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0));

    return json({ conversations });
};

// PATCH /api/messages → update per-conversation preferences such as mute/archive
export const PATCH: RequestHandler = async ({ request, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { accountId, contactJid, muted, archived } = await request.json();
    if (!accountId || !contactJid) throw error(400, 'accountId ve contactJid gerekli');
    if (muted === undefined && archived === undefined) throw error(400, 'Güncellenecek en az bir tercih gerekli');

    // Fetch account details
    const accountResult = await db.select().from(accounts).where(eq(accounts.id, String(accountId))).limit(1);
    const account = accountResult[0];

    const isAdminOrSuper = locals.user.role === 'superadmin' || locals.user.role === 'admin';
    const isOwner = String(account?.userId) === String(locals.user.id);
    const canAccess = isOwner || (isAdminOrSuper && !account?.isPrivate);

    if (!account || !canAccess) throw error(403, 'Erişim reddedildi');

    const contactKey = getConversationKey(String(accountId), String(contactJid));
    if (!contactKey) throw error(400, 'Konuşma anahtarı çözümlenemedi');

    const [existingRows]: any = await db.execute(sql`
        SELECT
            id,
            muted,
            archived
        FROM conversation_preferences
        WHERE account_id = ${String(accountId)}
          AND contact_key = ${contactKey}
        LIMIT 1
    `);

    const existing = (existingRows as any[])[0];
    const nextMuted = muted === undefined ? Boolean(existing?.muted) : Boolean(muted);
    const nextArchived = archived === undefined ? Boolean(existing?.archived) : Boolean(archived);
    const now = Math.floor(Date.now() / 1000);

    if (existing) {
        await db.execute(sql`
            UPDATE conversation_preferences
            SET muted = ${nextMuted ? 1 : 0},
                archived = ${nextArchived ? 1 : 0},
                updated_at = FROM_UNIXTIME(${now})
            WHERE id = ${Number(existing.id)}
        `);
    } else {
        await db.execute(sql`
            INSERT INTO conversation_preferences (
                account_id,
                contact_key,
                muted,
                archived,
                created_at,
                updated_at
            )
            VALUES (
                ${String(accountId)},
                ${contactKey},
                ${nextMuted ? 1 : 0},
                ${nextArchived ? 1 : 0},
                FROM_UNIXTIME(${now}),
                FROM_UNIXTIME(${now})
            )
        `);
    }

    return json({
        success: true,
        preferences: {
            muted: nextMuted,
            archived: nextArchived
        }
    });
};
