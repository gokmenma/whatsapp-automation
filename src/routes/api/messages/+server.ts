import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName } from '$lib/whatsapp';

function getConversationKey(accountId: string, jidOrNumber: string) {
    const raw = String(jidOrNumber || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@g.us')) return raw;
    return getCanonicalContactNumber(accountId, raw);
}

// GET /api/messages?accountId=xxx  → list of conversations with latest message
export const GET: RequestHandler = async ({ url, locals }) => {
    if (!locals.user) throw error(401, 'Unauthorized');

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

    const rows = await db.all(sql`
        SELECT
            m.contact_jid,
            m.sender_name,
            m.body,
            m.from_me,
            m.media_type,
            m.timestamp,
            m.status
        FROM messages m
        WHERE m.account_id = ${accountId}
        ORDER BY m.timestamp DESC
        LIMIT 2000
    `);

    const byCanonical = new Map<string, any>();
    const unreadByConversation = new Map<string, number>();
    const unreadPreviewByConversation = new Map<string, any>();

    function buildPreviewText(row: any, isGroup: boolean) {
        const body = String(row.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (!body) return '';

        if (isGroup && !Boolean(row.from_me)) {
            const sender = String(row.sender_name || '').trim();
            if (sender) return `${sender}: ${body}`;
        }

        return body;
    }

    for (const row of rows as any[]) {
        const jid = String(row.contact_jid || '');
        const isGroup = jid.endsWith('@g.us');
        const number = isGroup ? jid.split('@')[0] : getCanonicalContactNumber(accountId, jid);
        if (!number) continue;
        if (!isGroup && selfNumber && number === selfNumber) continue;
        const rowBody = String(row.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        const isGhostRow = !row.media_type && !rowBody && row.status !== 'deleted_me' && row.status !== 'deleted_everyone';
        if (isGhostRow) continue;
        const conversationKey = isGroup ? jid : number;

        const isUnread =
            !Boolean(row.from_me) &&
            row.status !== 'read' &&
            row.status !== 'played' &&
            row.status !== 'deleted_me' &&
            row.status !== 'deleted_everyone';
        if (isUnread) {
            unreadByConversation.set(conversationKey, (unreadByConversation.get(conversationKey) || 0) + 1);
            if (!unreadPreviewByConversation.has(conversationKey)) {
                unreadPreviewByConversation.set(conversationKey, {
                    body: buildPreviewText(row, isGroup),
                    fromMe: Boolean(row.from_me),
                    status: String(row.status || ''),
                    mediaType: row.media_type,
                    timestamp: row.timestamp
                });
            }
        }

        if (byCanonical.has(conversationKey)) continue; // already have latest due to DESC order

        const prefs = preferenceMap.get(conversationKey);
        const resolvedName = isGroup
            ? getContactName(accountId, jid)
            : (getContactName(accountId, jid) || getContactName(accountId, `${number}@s.whatsapp.net`));
        const unreadPreview = unreadPreviewByConversation.get(conversationKey);
        const basePreviewText = buildPreviewText(row, isGroup);

        byCanonical.set(conversationKey, {
            contactJid: isGroup ? jid : `${number}@s.whatsapp.net`,
            name: resolvedName,
            number,
            lastMessage: unreadPreview?.body || basePreviewText || rowBody,
            lastMessageFromMe: unreadPreview ? Boolean(unreadPreview.fromMe) : Boolean(row.from_me),
            lastMessageStatus: unreadPreview ? String(unreadPreview.status || '') : String(row.status || ''),
            lastMessageMediaType: unreadPreview ? unreadPreview.mediaType : row.media_type,
            lastMessageAt: unreadPreview ? unreadPreview.timestamp : row.timestamp,
            unreadCount: unreadByConversation.get(conversationKey) || 0,
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
