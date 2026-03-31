import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getAccountStatus, getCanonicalContactNumber, getContactName } from '$lib/whatsapp';

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

    const rows = await db.all(sql`
        SELECT
            m.contact_jid,
            m.body,
            m.from_me,
            m.media_type,
            m.timestamp
        FROM messages m
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

        byCanonical.set(number, {
            contactJid: `${number}@s.whatsapp.net`,
            name: getContactName(accountId, `${number}@s.whatsapp.net`) || getContactName(accountId, jid),
            number,
            lastMessage: rowBody,
            lastMessageFromMe: Boolean(row.from_me),
            lastMessageMediaType: row.media_type,
            lastMessageAt: row.timestamp,
        });
    }

    const conversations = Array.from(byCanonical.values())
        .sort((a, b) => Number(b.lastMessageAt || 0) - Number(a.lastMessageAt || 0));

    return json({ conversations });
};
