import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName, normalizeDigits, getContactStatus } from '$lib/whatsapp';

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

// Used library normalizeDigits

function resolveDirectConversationNumber(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';

    if (!raw.includes('@')) {
        return normalizeDigits(raw);
    }

    // Always prefer canonical normalization to handle LID <-> Phone mapping
    return getCanonicalContactNumber(accountId, raw) || normalizeDigits(raw);
}

function getConversationKey(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@g.us')) return raw;
    
    // Priority 1: Use canonical resolution (Phone <-> LID mapping)
    const resolved = getCanonicalContactNumber(accountId, raw);
    if (resolved && !resolved.startsWith('lid_')) return resolved;

    // Priority 2: Standard phone digits
    const directDigits = normalizeDigits(raw);
    if (directDigits) return directDigits;

    // Priority 3: Final fallback
    return resolved || raw;
}

// GET /api/messages?accountId=xxx  → list of conversations with latest message
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    await ensureMessagesConversationIndex();

    const accountId = url.searchParams.get('accountId');
    console.log(`[API] GET /api/messages accountId=${accountId}`);
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

    // Fetch conversations with latest message and unread counts in one optimized query
    let rows: any[] = [];
    try {
        const [queryResult]: any = await db.execute(sql`
            SELECT 
                m.contact_jid,
                m.id as lastMessageId,
                m.body as lastMessageBody,
                m.media_type as mediaType,
                m.timestamp as lastMessageTimestamp,
                m.from_me as fromMe,
                m.status as status,
                m.sender_name as senderName,
                m.sender_jid as senderJid,
                COALESCE(u.cnt, 0) as unreadCount
            FROM messages m
            INNER JOIN (
                SELECT contact_jid, MAX(timestamp) as max_ts
                FROM messages
                WHERE account_id = ${accountId}
                  AND contact_jid NOT LIKE '%@newsletter'
                  AND contact_jid NOT LIKE '%@broadcast'
                GROUP BY contact_jid
            ) m2 ON m.contact_jid = m2.contact_jid AND m.timestamp = m2.max_ts
            LEFT JOIN (
                SELECT contact_jid, COUNT(*) as cnt
                FROM messages
                WHERE account_id = ${accountId} AND from_me = 0 AND is_read = 0
                GROUP BY contact_jid
            ) u ON m.contact_jid = u.contact_jid
            WHERE m.account_id = ${accountId}
            GROUP BY m.contact_jid
            ORDER BY m.timestamp DESC
            LIMIT 300
        `);
        rows = (queryResult as any) || [];
    } catch (err: any) {
        console.error(`[API] Database error fetching conversations for ${accountId}:`, err.message || err);
        throw error(500, 'Veritabanı hatası: ' + (err.message || 'Bilinmeyen hata'));
    }

    const conversations: any[] = [];
    for (const row of (rows as any[]) || []) {
        const jid = String(row.contact_jid || row.contactJid || '').trim();
        if (!jid || jid === 'undefined') continue;
        
        const isGroup = jid.endsWith('@g.us');
        const number = isGroup ? jid.split('@')[0] : (getCanonicalContactNumber(accountId, jid) || normalizeDigits(jid));
        
        const prefs = preferenceMap.get(isGroup ? jid : number);
        
        const date = new Date(row.lastMessageTimestamp);
        date.setHours(date.getHours() + 3);

        const contactName = isGroup ? jid : (number + '@s.whatsapp.net');

        conversations.push({
            id: jid,
            contactJid: jid,
            name: getContactName(accountId, contactName) || jid.split('@')[0],
            number: number,
            description: isGroup ? (getContactStatus(accountId, jid) || '') : '',
            lastMessage: String(row.lastMessageBody || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim(),
            lastMessageAt: Math.floor(date.getTime() / 1000),
            lastMessageFromMe: Boolean(row.fromMe),
            lastMessageStatus: row.status,
            lastMessageMediaType: row.mediaType,
            senderName: row.senderName,
            unreadCount: Number(row.unreadCount),
            muted: Boolean(prefs?.muted),
            archived: Boolean(prefs?.archived)
        });
    }

    console.log(`[API] Returning ${conversations.length} conversations for accountId=${accountId}`);
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
