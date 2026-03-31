import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName, getContactNameAsync } from '$lib/whatsapp';

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

    const selfNumber = String(getAccountStatus(accountId)?.user?.id || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

    const isFast = url.searchParams.get('fast') === 'true';

    const now = Date.now();

    if (isFast) {
        // Fast path for polling: just return the latest inbound message timestamp + mute status
        const latest = await db.all(sql`
            SELECT 
                m.timestamp, 
                m.from_me as fromMe,
                m.contact_jid as contactJid,
                CASE WHEN (c.is_muted = 1 AND (c.mute_until > ${now} OR c.mute_until IS NULL)) THEN 1 ELSE 0 END as isMuted
            FROM messages m
            LEFT JOIN chats c ON c.account_id = m.account_id AND c.contact_jid = m.contact_jid
            WHERE m.account_id = ${accountId} AND m.from_me = 0
            ORDER BY m.timestamp DESC
            LIMIT 1
        `);
        
        return json({ 
            latest: latest[0] ? {
                timestamp: (latest[0] as any).timestamp,
                fromMe: (latest[0] as any).fromMe,
                isMuted: Boolean((latest[0] as any).isMuted)
            } : null 
        });
    }

    const rows = await db.all(sql`
        SELECT
            m.contact_jid,
            m.body,
            m.from_me,
            m.media_type,
            m.timestamp,
            CASE WHEN (c.is_muted = 1 AND (c.mute_until > ${now} OR c.mute_until IS NULL)) THEN 1 ELSE 0 END as is_muted
        FROM messages m
        LEFT JOIN chats c ON c.account_id = m.account_id AND c.contact_jid = m.contact_jid
        WHERE m.account_id = ${accountId}
        ORDER BY m.timestamp DESC
        LIMIT 2000
    `);

    const byCanonical = new Map<string, any>();
    for (const row of rows as any[]) {
        const jid = String(row.contact_jid || '');
        const number = getCanonicalContactNumber(accountId, jid);
        if (!number) continue;
        if (selfNumber && number === selfNumber) continue;
        const rowBody = String(row.body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        const isGhostRow = !row.media_type && !rowBody && row.status !== 'deleted_me' && row.status !== 'deleted_everyone';
        if (isGhostRow) continue;
        if (byCanonical.has(number)) continue; // already have latest due to DESC order

        // Ensure group JIDs are correctly reconstructed even if stored incorrectly
        let resolvedJid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        if (number.length > 13 || number.includes('-')) {
            resolvedJid = number.includes('@') ? number : `${number}@g.us`;
        }
        byCanonical.set(number, {
            contactJid: resolvedJid,
            name: number, // placeholder, resolved below
            number: number.includes('@') ? number.split('@')[0] : number,
            lastMessage: rowBody,
            lastMessageFromMe: Boolean(row.from_me),
            lastMessageMediaType: row.media_type,
            lastMessageAt: row.timestamp,
            isMuted: Boolean(row.is_muted)
        });
    }

    const conversations = Array.from(byCanonical.values());
    
    // Resolve names asynchronously in parallel
    await Promise.all(conversations.map(async (c) => {
        const res = await getContactNameAsync(accountId, c.contactJid);
        c.name = res.name;
        c.participants = res.participants;
    }));

    conversations.sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0));

    return json({ conversations });
};
