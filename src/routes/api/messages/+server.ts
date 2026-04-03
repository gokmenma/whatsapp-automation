import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName } from '$lib/whatsapp';

let messagesConversationIndexEnsured = false;

async function ensureMessagesConversationIndex() {
    if (messagesConversationIndexEnsured) return;

    await db.run(sql`
        CREATE INDEX IF NOT EXISTS messages_account_timestamp_idx
        ON messages (account_id, timestamp DESC)
    `);

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

    const [, domain = ''] = raw.split('@');
    const digits = normalizeDirectKey(raw);

    // Keep plain phone JIDs strict to avoid accidental merges.
    if ((domain === 's.whatsapp.net' || domain === 'c.us') && digits) {
        return digits;
    }

    // Fallback to store-aware mapping only for lid-like or non-digit identities.
    return getCanonicalContactNumber(accountId, raw) || digits;
}

function getConversationKey(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@g.us')) return raw;
    const directDigits = normalizeDirectKey(raw);
    if (directDigits) return directDigits;
    return getCanonicalContactNumber(accountId, raw);
}

// GET /api/messages?accountId=xxx  → list of conversations with latest message
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

    await ensureMessagesConversationIndex();

    const accountId = url.searchParams.get('accountId');
    if (!accountId) throw error(400, 'accountId gerekli');

    // Verify account belongs to user
    const account = await db.select().from(accounts)
        .where(eq(accounts.id, accountId))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const preferenceRows = await db.all(sql`
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
    // Much faster than fetching raw message rows and aggregating in JS.
    const rows = await db.all(sql`
        WITH base AS (
            SELECT
                contact_jid,
                sender_name,
                body,
                from_me,
                media_type,
                timestamp,
                status,
                ROW_NUMBER() OVER (PARTITION BY contact_jid ORDER BY timestamp DESC) AS rn
            FROM messages
            WHERE account_id = ${accountId}
              AND contact_jid NOT LIKE '%@newsletter'
              AND contact_jid NOT LIKE '%@broadcast'
              AND contact_jid NOT LIKE '120363%@s.whatsapp.net'
              AND (
                  (body IS NOT NULL AND body != '')
                  OR media_type IS NOT NULL
                  OR status IN ('deleted_me', 'deleted_everyone')
              )
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
              AND contact_jid NOT LIKE '120363%@s.whatsapp.net'
              AND status NOT IN ('read', 'played', 'deleted_me', 'deleted_everyone')
              AND (
                  (body IS NOT NULL AND body != '')
                  OR media_type IS NOT NULL
              )
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
    `);

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
        const resolved = resolveDirectConversationNumber(accountId, jid);
        directNumberCache.set(jid, resolved);
        return resolved;
    }

    function resolveConversationName(jid: string, isGroup: boolean, number: string) {
        const key = isGroup ? `group:${jid}` : `direct:${number}`;
        const cached = conversationNameCache.get(key);
        if (cached !== undefined) return cached;
        const resolved = isGroup
            ? getContactName(accountId, jid)
            : (getContactName(accountId, jid) || getContactName(accountId, `${number}@s.whatsapp.net`));
        conversationNameCache.set(key, resolved);
        return resolved;
    }

    // Each row is already the latest message for its conversation — O(conversations) not O(messages)
    for (const row of rows as any[]) {
        const jid = String(row.contact_jid || '');
        const isGroup = jid.endsWith('@g.us');
        const number = resolveNumberForJid(jid, isGroup);
        if (!number) continue;
        if (!isGroup && selfNumber && number === selfNumber) continue;

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

        byCanonical.set(conversationKey, {
            contactJid: isGroup ? jid : `${number}@s.whatsapp.net`,
            name: resolvedName,
            number,
            lastMessage: lastMessage || rowBody,
            lastMessageFromMe: Boolean(row.from_me),
            lastMessageStatus: String(row.status || ''),
            lastMessageMediaType: row.media_type,
            lastMessageAt: row.timestamp,
            unreadPreview: unreadPreviewText,
            unreadPreviewFromMe: false,
            unreadPreviewStatus: String(row.up_status || ''),
            unreadPreviewMediaType: row.up_media_type || null,
            unreadPreviewAt: row.up_timestamp || null,
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

    const account = await db.select().from(accounts)
        .where(eq(accounts.id, String(accountId)))
        .get();
    if (!account || account.userId !== locals.user.id) throw error(403, 'Erişim reddedildi');

    const contactKey = getConversationKey(String(accountId), String(contactJid));
    if (!contactKey) throw error(400, 'Konuşma anahtarı çözümlenemedi');

    const existingRows = await db.all(sql`
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
        await db.run(sql`
            UPDATE conversation_preferences
            SET muted = ${nextMuted ? 1 : 0},
                archived = ${nextArchived ? 1 : 0},
                updated_at = ${now}
            WHERE id = ${Number(existing.id)}
        `);
    } else {
        await db.run(sql`
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
                ${now},
                ${now}
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
