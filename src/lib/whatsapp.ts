import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    Browsers,
    type AnyMessageContent,
    proto,
    WAMessageStubType,
    delay,
    jidDecode,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';
import { building } from '$app/environment';

const logger = pino({ level: 'silent' });
const USER_DATA_PATH = process.env.USER_DATA_PATH;
const ACCOUNTS_FILE = USER_DATA_PATH ? path.join(USER_DATA_PATH, 'accounts.json') : './accounts.json';
const AUTH_PATH = USER_DATA_PATH ? path.join(USER_DATA_PATH, '.baileys_auth') : '.baileys_auth';
const MEDIA_PATH = USER_DATA_PATH ? path.join(USER_DATA_PATH, 'media') : './media';

// Ensure the auth path exists
if (!fs.existsSync(AUTH_PATH)) {
    fs.mkdirSync(AUTH_PATH, { recursive: true });
}

// Global refs to persist across SvelteKit HMR
const globalRef = globalThis as any;
if (!globalRef.baileysClients) globalRef.baileysClients = new Map<string, any>();
if (!globalRef.baileysStatuses) globalRef.baileysStatuses = new Map<string, AccountStatus>();
if (!globalRef.baileysSessionLocks) globalRef.baileysSessionLocks = new Set<string>();
if (!globalRef.baileysSessionLockHandlersRegistered) globalRef.baileysSessionLockHandlersRegistered = false;
if (!globalRef.baileysPendingMessageStatuses) globalRef.baileysPendingMessageStatuses = new Map<string, Map<string, string>>();
if (!globalRef.baileysAvatarCache) globalRef.baileysAvatarCache = new Map<string, { url: string | null; expiresAt: number }>();

interface AccountStatus {
    id: string;
    status: "disconnected" | "connecting" | "ready" | "loading";
    qr: string | null;
    qrRaw?: string | null;
    user?: any;
}

const clients: Map<string, any> = globalRef.baileysClients;
const statuses: Map<string, AccountStatus> = globalRef.baileysStatuses;
const heldSessionLocks: Set<string> = globalRef.baileysSessionLocks;
const pendingMessageStatuses: Map<string, Map<string, string>> = globalRef.baileysPendingMessageStatuses;
const avatarCache: Map<string, { url: string | null; expiresAt: number }> = globalRef.baileysAvatarCache;

function getSessionLockPath(accountId: string) {
    const lockDir = path.join(AUTH_PATH, 'locks');
    if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
    return path.join(lockDir, `session-${accountId}.lock`);
}

function isPidAlive(pid: number) {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function acquireSessionLock(accountId: string) {
    const lockPath = getSessionLockPath(accountId);
    if (heldSessionLocks.has(lockPath)) return true;

    try {
        if (fs.existsSync(lockPath)) {
            const existingPid = Number(fs.readFileSync(lockPath, 'utf-8').trim());
            if (existingPid && existingPid !== process.pid && isPidAlive(existingPid)) {
                console.warn(`[${accountId}] Session lock is held by PID ${existingPid}. Skipping duplicate connection.`);
                return false;
            }
            try { fs.unlinkSync(lockPath); } catch {}
        }

        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
        heldSessionLocks.add(lockPath);
        return true;
    } catch (e: any) {
        if (e?.code === 'EEXIST') {
            console.warn(`[${accountId}] Session lock already exists. Skipping duplicate connection.`);
            return false;
        }
        console.error(`[${accountId}] Failed to acquire session lock:`, e);
        return false;
    }
}

function releaseSessionLock(accountId: string) {
    const lockPath = getSessionLockPath(accountId);
    if (!heldSessionLocks.has(lockPath)) return;

    heldSessionLocks.delete(lockPath);
    try {
        if (fs.existsSync(lockPath)) {
            const existingPid = Number(fs.readFileSync(lockPath, 'utf-8').trim());
            if (!existingPid || existingPid === process.pid) {
                fs.unlinkSync(lockPath);
            }
        }
    } catch (e) {
        console.error(`[${accountId}] Failed to release session lock:`, e);
    }
}

function registerSessionLockCleanupHandlers() {
    if (globalRef.baileysSessionLockHandlersRegistered) return;
    globalRef.baileysSessionLockHandlersRegistered = true;

    const cleanupAllLocks = () => {
        for (const lockPath of Array.from(heldSessionLocks)) {
            try {
                if (fs.existsSync(lockPath)) {
                    const existingPid = Number(fs.readFileSync(lockPath, 'utf-8').trim());
                    if (!existingPid || existingPid === process.pid) fs.unlinkSync(lockPath);
                }
            } catch {}
            heldSessionLocks.delete(lockPath);
        }
    };

    process.on('exit', cleanupAllLocks);
    process.on('SIGINT', () => {
        cleanupAllLocks();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        cleanupAllLocks();
        process.exit(0);
    });
}

registerSessionLockCleanupHandlers();

// A simple in-memory store with persistence
interface SimpleStore {
    contacts: Map<string, any>;
    chats: Map<string, any>;
}
if (!globalRef.baileysStores) globalRef.baileysStores = new Map<string, SimpleStore>();
const stores: Map<string, SimpleStore> = globalRef.baileysStores;

function getStorePath(accountId: string) {
    return path.join(AUTH_PATH, `store-${accountId}.json`);
}

function saveStore(accountId: string) {
    const store = stores.get(accountId);
    if (!store) return;
    try {
        const data = {
            contacts: Array.from(store.contacts.entries()),
            chats: Array.from(store.chats.entries())
        };
        fs.writeFileSync(getStorePath(accountId), JSON.stringify(data));
    } catch (e) {
        console.error(`[${accountId}] Store save error:`, e);
    }
}

function loadStore(accountId: string): SimpleStore {
    const storePath = getStorePath(accountId);
    if (fs.existsSync(storePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
            console.log(`[${accountId}] Loading store from file: ${data.contacts?.length || 0} contacts.`);
            return {
                contacts: new Map(data.contacts || []),
                chats: new Map(data.chats || [])
            };
        } catch (e) {
            console.error(`[${accountId}] Store load error:`, e);
        }
    }
    return { contacts: new Map(), chats: new Map() };
}

// HELPER: Normalize phone numbers to Baileys JID (12345@s.whatsapp.net)
function toJid(number: string) {
    if (number.includes('@')) return number;
    // Basic clean to handle + prefix
    const cleanNumber = number.replace(/\D/g, '');
    return `${cleanNumber}@s.whatsapp.net`;
}

function extractRawMessageId(messageId?: string) {
    if (!messageId) return '';
    const idx = messageId.lastIndexOf(':');
    return idx >= 0 ? messageId.slice(idx + 1) : messageId;
}

function consumePendingStatus(accountId: string, messageId: string) {
    const rawId = extractRawMessageId(messageId);
    if (!rawId) return null;

    const bucket = pendingMessageStatuses.get(accountId);
    if (!bucket) return null;

    const status = bucket.get(rawId) || null;
    if (status) bucket.delete(rawId);
    if (bucket.size === 0) pendingMessageStatuses.delete(accountId);
    return status;
}

function normalizeNameValue(value: string | undefined | null) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizeDigits(value: string | undefined | null) {
    return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function extractMessageText(content: any) {
    let body = content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption || '';

    body = String(body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!body && content?.documentMessage?.fileName) body = String(content.documentMessage.fileName).trim();
    if (!body && content?.audioMessage) body = '[Ses mesaji]';
    if (!body && content?.stickerMessage) body = '[Cikartma]';
    if (!body && (content?.imageMessage || content?.videoMessage)) body = '[Medya]';
    return body;
}

function extractContextInfo(content: any) {
    return content?.extendedTextMessage?.contextInfo ||
        content?.imageMessage?.contextInfo ||
        content?.videoMessage?.contextInfo ||
        content?.audioMessage?.contextInfo ||
        content?.documentMessage?.contextInfo ||
        null;
}

function isUsableAvatarUrl(value: string | undefined | null) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

export async function initializeWhatsApp(accountId: string) {
    if (!acquireSessionLock(accountId)) {
        const existing = statuses.get(accountId) || { id: accountId, status: 'disconnected', qr: null };
        existing.status = 'disconnected';
        existing.qr = null;
        existing.qrRaw = null;
        statuses.set(accountId, existing);
        return;
    }

    if (clients.has(accountId)) {
        console.log(`[${accountId}] Client already exists. Checking status...`);
        const currentStatus = statuses.get(accountId);
        if (currentStatus?.status === "ready" || currentStatus?.status === "loading" || currentStatus?.status === "connecting") {
            return;
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState(path.join(AUTH_PATH, `session-${accountId}`));
    // Cache Baileys version to avoid multiple network calls
    if (!globalRef.baileysVersion) {
        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            globalRef.baileysVersion = version;
            console.log(`[${accountId}] Fetched Baileys version: ${version.join('.')} (Latest: ${isLatest})`);
        } catch (e) {
            console.error(`[${accountId}] Failed to fetch Baileys version, using default:`, e);
            globalRef.baileysVersion = [2, 3000, 1015901307]; // Fallback version
        }
    }
    const version = globalRef.baileysVersion;

    const status: AccountStatus = {
        id: accountId,
        status: "loading",
        qr: null
    };
    statuses.set(accountId, status);

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        logger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: true, // Crucial for getting all contacts
        shouldSyncHistoryMessage: () => true, // Force history sync
        getMessage: async (key) => {
            return undefined; // We can add local message retrieval later if needed
        },
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        markOnlineOnConnect: true
    });

    // Track contacts/chats with persistence
    let store = stores.get(accountId);
    if (!store) {
        store = loadStore(accountId);
        stores.set(accountId, store);
    }
    
    // Auto-save interval (per account) - ensure we don't leak intervals
    const intervalKey = `interval-${accountId}`;
    if (globalRef[intervalKey]) clearInterval(globalRef[intervalKey]);
    globalRef[intervalKey] = setInterval(() => saveStore(accountId), 10000);

    // Bind events to populate the simple store
    (sock.ev as any).on('contacts.set', (data: any) => {
        const list = Array.isArray(data) ? data : data.contacts || [];
        console.log(`[${accountId}] contacts.set received ${list.length} contacts.`);
        list.forEach((c: any) => {
            if (c.id) store!.contacts.set(c.id, { ...(store!.contacts.get(c.id) || {}), ...c });
        });
        saveStore(accountId);
    });

    sock.ev.on('contacts.upsert', (newContacts: any[]) => {
        newContacts.forEach(c => {
            const existing = store!.contacts.get(c.id) || {};
            store!.contacts.set(c.id, { ...existing, ...c });
        });
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
        updates.forEach(u => {
            const existing = store!.contacts.get(u.id);
            if (existing) store!.contacts.set(u.id, { ...existing, ...u });
        });
    });

    (sock.ev as any).on('chats.set', (data: any) => {
        const list = Array.isArray(data) ? data : data.chats || [];
        console.log(`[${accountId}] chats.set received ${list.length} chats.`);
        list.forEach((c: any) => {
            if (c.id) store!.chats.set(c.id, { ...(store!.chats.get(c.id) || {}), ...c });
        });
        saveStore(accountId);
    });

    sock.ev.on('chats.upsert', (newChats: any[]) => {
        newChats.forEach(c => {
            if (c.id) {
                const existing = store!.chats.get(c.id) || {};
                store!.chats.set(c.id, { ...existing, ...c });
            }
        });
    });

    sock.ev.on('chats.update', (updates: any[]) => {
        updates.forEach(u => {
            if (u.id) {
                const existing = store!.chats.get(u.id);
                if (existing) store!.chats.set(u.id, { ...existing, ...u });
            }
        });
    });

    // Robust listener for history/contacts (handling all possible event names)
    const historyHandler = (data: any) => {
        const { contacts, chats } = data;
        console.log(`[${accountId}] History Sync Event: ${contacts?.length || 0} contacts, ${chats?.length || 0} chats.`);
        if (contacts) contacts.forEach((c: any) => store!.contacts.set(c.id, c));
        if (chats) chats.forEach((c: any) => store!.chats.set(c.id, c));
        saveStore(accountId);
    };

    (sock.ev as any).on('messaging-history-set', historyHandler);
    (sock.ev as any).on('messaging-history.set', historyHandler);
    (sock.ev as any).on('history-sync.set', historyHandler);

    clients.set(accountId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[${accountId}] QR RECEIVED! Please scan to connect.`);
            status.qr = await qrcode.toDataURL(qr);
            status.qrRaw = qr;
            status.status = "connecting";
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${accountId}] Connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);
            
            status.status = "disconnected";
            status.qr = null;
            status.qrRaw = null;
            
            if (shouldReconnect) {
                // Short delay to avoid infinite retry loops on network issues
                setTimeout(() => initializeWhatsApp(accountId).catch(e => console.error(`[${accountId}] Reconnect error:`, e)), 3000);
            } else {
                console.log(`[${accountId}] Connection closed. Device logged out.`);
                clients.delete(accountId);
                stores.delete(accountId);
                releaseSessionLock(accountId);
                // Remove session folder on logout
                try {
                    fs.rmSync(path.join(AUTH_PATH, `session-${accountId}`), { recursive: true, force: true });
                } catch (e) {}
            }
        } else if (connection === 'open') {
            console.log(`[${accountId}] SUCCESS: WHATSAPP READY (BAILEYS)!`);
            status.status = "ready";
            status.qr = null;
            status.qrRaw = null;
            status.user = sock.user;
        }
    });

    async function markMessageAsDeleted(targetId?: string, source: string = 'unknown', remoteJid?: string) {
        if (!targetId) {
            console.warn(`[${accountId}] Revoke ignored: missing targetId (source=${source})`);
            return;
        }
        try {
            const { db: dbInst } = await import('./server/db');
            const { sql } = await import('drizzle-orm');
            const prefixedId = `${accountId}:${targetId}`;
            const rows = await dbInst.all(sql`
                SELECT id, from_me, edited_at
                FROM messages
                WHERE account_id = ${accountId}
                  AND (
                    id = ${prefixedId}
                    OR id = ${targetId}
                    OR id LIKE ${`%:${targetId}`}
                  )
            `);

            let changed = 0;
            for (const row of (rows as any[])) {
                const isFromMe = Boolean(row?.from_me);
                const wasEdited = Boolean(row?.edited_at);

                // Defensive rule: protocol revoke events must never overwrite our own messages.
                // Own-message delete is handled explicitly by API PATCH delete flow.
                if (isFromMe) {
                    console.warn(`[${accountId}] Revoke skipped for own message (${source}) id=${String(row?.id || '')} edited=${wasEdited}`);
                    continue;
                }

                // Also skip messages that have already been edited:
                // Baileys sometimes fires a stray revoke event alongside an edit event,
                // which would falsely overwrite the edited content on the receiver's side.
                if (wasEdited) {
                    console.warn(`[${accountId}] Revoke skipped for already-edited message (${source}) id=${String(row?.id || '')}`);
                    continue;
                }

                await dbInst.run(sql`
                    UPDATE messages
                    SET body = 'Bu mesaj silindi',
                        media_type = NULL,
                        status = 'deleted_everyone'
                    WHERE account_id = ${accountId}
                      AND id = ${String(row?.id || '')}
                `);
                changed += 1;
            }

            if (changed > 0) {
                console.log(`[${accountId}] Revoke applied (${source}) targetId=${targetId} remoteJid=${remoteJid || '-'} rows=${changed}`);
            } else {
                console.warn(`[${accountId}] Revoke no-match (${source}) targetId=${targetId} remoteJid=${remoteJid || '-'} prefixed=${prefixedId}`);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Revoke update error:`, e.message);
        }
    }

    async function markMessageAsEdited(targetId?: string, newBody?: string, source: string = 'unknown', remoteJid?: string) {
        if (!targetId) {
            console.warn(`[${accountId}] Edit ignored: missing targetId (source=${source})`);
            return;
        }

        const body = String(newBody || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

        try {
            const { db: dbInst } = await import('./server/db');
            const { sql } = await import('drizzle-orm');
            const prefixedId = `${accountId}:${targetId}`;
            if (body) {
                await dbInst.run(sql`
                    UPDATE messages
                    SET body = ${body},
                        edited_at = ${new Date()}
                    WHERE account_id = ${accountId}
                      AND (
                        id = ${prefixedId}
                        OR id = ${targetId}
                        OR id LIKE ${`%:${targetId}`}
                      )
                `);
            } else {
                await dbInst.run(sql`
                    UPDATE messages
                    SET edited_at = ${new Date()}
                    WHERE account_id = ${accountId}
                      AND (
                        id = ${prefixedId}
                        OR id = ${targetId}
                        OR id LIKE ${`%:${targetId}`}
                      )
                `);
            }
            const changesRow = await dbInst.get(sql`SELECT changes() as n`);
            const changed = Number((changesRow as any)?.n || 0);
            if (changed > 0) {
                console.log(`[${accountId}] Edit applied (${source}) targetId=${targetId} remoteJid=${remoteJid || '-'} rows=${changed}`);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Edit update error:`, e.message);
        }
    }

    function extractEditedBodyFromProtocol(protocolMessage: any) {
        // Try multiple known locations for the edited message content.
        // editedMessage can be a WebMessageInfo (has .message property) or a raw proto.Message.
        const payload =
            protocolMessage?.editedMessage?.message ||
            protocolMessage?.editedMessage ||
            protocolMessage?.message ||
            null;

        const nested =
            (payload as any)?.ephemeralMessage?.message ||
            (payload as any)?.viewOnceMessage?.message ||
            (payload as any)?.viewOnceMessageV2?.message ||
            payload;

        const text = extractMessageText(nested);
        if (text) return text;

        // Last resort: deep-search for any text field in the editedMessage subtree.
        try {
            const em = protocolMessage?.editedMessage;
            if (em) {
                const deep = em?.message?.extendedTextMessage?.text ||
                    em?.message?.conversation ||
                    em?.extendedTextMessage?.text ||
                    em?.conversation ||
                    em?.message?.imageMessage?.caption ||
                    em?.message?.videoMessage?.caption ||
                    em?.message?.documentMessage?.caption || '';
                return String(deep || '').trim();
            }
        } catch { /* ignore */ }

        return '';
    }

    function hasEditedSignal(protocolMessage: any) {
        if (!protocolMessage || typeof protocolMessage !== 'object') return false;
        if ((protocolMessage as any).editedMessage) return true;

        const typeRaw = (protocolMessage as any).type;
        const typeNum = Number(typeRaw);
        const typeStr = String(typeRaw ?? '').toLowerCase();

        if (Number.isFinite(typeNum) && typeNum === 14) return true;
        if (typeStr.includes('edit')) return true;

        return false;
    }

    type StoredReaction = {
        emoji: string;
        senderJid: string;
        senderName?: string;
    };

    async function updateMessageReaction(targetId?: string, emoji?: string | null, senderJid?: string | null, senderName?: string | null) {
        if (!targetId || !senderJid) return;

        try {
            const { db: dbInst } = await import('./server/db');
            const { sql } = await import('drizzle-orm');
            const prefixedId = `${accountId}:${targetId}`;
            const rows = await dbInst.all(sql`
                SELECT id, reaction
                FROM messages
                WHERE account_id = ${accountId}
                  AND (
                    id = ${prefixedId}
                    OR id = ${targetId}
                    OR id LIKE ${`%:${targetId}`}
                  )
            `);

            for (const row of rows as any[]) {
                let reactions: StoredReaction[] = [];
                try {
                    reactions = JSON.parse(String(row?.reaction || '[]'));
                    if (!Array.isArray(reactions)) reactions = [];
                } catch {
                    reactions = [];
                }

                reactions = reactions.filter((entry) => entry && entry.senderJid !== senderJid);
                if (emoji) {
                    reactions.push({ emoji, senderJid, senderName: senderName || undefined });
                }

                await dbInst.run(sql`
                    UPDATE messages
                    SET reaction = ${JSON.stringify(reactions)}
                    WHERE account_id = ${accountId}
                      AND id = ${String(row.id)}
                `);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Reaction update error:`, e.message);
        }
    }

    function normalizeMessageStatus(input: any): 'failed' | 'sent' | 'delivered' | 'read' | 'played' | null {
        if (input === undefined || input === null) return null;

        if (typeof input === 'number') {
            if (input <= 0) return 'failed';
            if (input <= 2) return 'sent';
            if (input === 3) return 'delivered';
            if (input === 4) return 'read';
            if (input >= 5) return 'played';
        }

        const raw = String(input).toLowerCase();
        if (raw.includes('error') || raw.includes('fail')) return 'failed';
        if (raw.includes('played')) return 'played';
        if (raw.includes('read')) return 'read';
        if (raw.includes('delivery') || raw.includes('delivered')) return 'delivered';
        if (raw.includes('server_ack') || raw.includes('sent') || raw.includes('pending') || raw.includes('ack')) return 'sent';

        return null;
    }

    function statusRank(statusValue: string | undefined) {
        switch (statusValue) {
            case 'failed': return -1;
            case 'sent': return 1;
            case 'delivered': return 2;
            case 'read': return 3;
            case 'played': return 4;
            default: return 0;
        }
    }

    function getPendingStatusBucket(accountId: string) {
        let bucket = pendingMessageStatuses.get(accountId);
        if (!bucket) {
            bucket = new Map<string, string>();
            pendingMessageStatuses.set(accountId, bucket);
        }
        return bucket;
    }

    function extractRawMessageId(messageId?: string) {
        if (!messageId) return '';
        const idx = messageId.lastIndexOf(':');
        return idx >= 0 ? messageId.slice(idx + 1) : messageId;
    }

    function rememberPendingStatus(accountId: string, messageId: string, status: string) {
        const rawId = extractRawMessageId(messageId);
        if (!rawId) return;

        const bucket = getPendingStatusBucket(accountId);
        const existing = bucket.get(rawId);
        if (!existing || statusRank(status) > statusRank(existing)) {
            bucket.set(rawId, status);
        }
    }

    function consumePendingStatus(accountId: string, messageId: string) {
        const rawId = extractRawMessageId(messageId);
        if (!rawId) return null;

        const bucket = pendingMessageStatuses.get(accountId);
        if (!bucket) return null;

        const status = bucket.get(rawId) || null;
        if (status) bucket.delete(rawId);
        if (bucket.size === 0) pendingMessageStatuses.delete(accountId);
        return status;
    }

    async function updateMessageDeliveryStatus(targetId?: string, nextStatus?: string | null, source: string = 'unknown', remoteJid?: string) {
        if (!targetId || !nextStatus) return;

        try {
            const { db: dbInst } = await import('./server/db');
            const { sql } = await import('drizzle-orm');
            const prefixedId = `${accountId}:${targetId}`;
            const rows = await dbInst.all(sql`
                SELECT id, status
                FROM messages
                WHERE account_id = ${accountId}
                  AND from_me = 1
                  AND (
                    id = ${prefixedId}
                    OR id = ${targetId}
                    OR id LIKE ${`%:${targetId}`}
                  )
            `);

                        if (!rows || (rows as any[]).length === 0) {
                                // Status events can arrive before the outgoing message row is inserted.
                                rememberPendingStatus(accountId, targetId, nextStatus);
                                return;
                        }

            let updated = 0;
            for (const row of rows as any[]) {
                const currentStatus = String(row?.status || 'sent');
                if (currentStatus === 'deleted_me' || currentStatus === 'deleted_everyone') continue;

                if (statusRank(nextStatus) >= statusRank(currentStatus) && currentStatus !== nextStatus) {
                    await dbInst.run(sql`
                        UPDATE messages
                        SET status = ${nextStatus}
                        WHERE account_id = ${accountId}
                          AND id = ${String(row.id)}
                    `);
                    updated++;
                }
            }

            if (updated > 0) {
                console.log(`[${accountId}] Status updated (${source}) targetId=${targetId} -> ${nextStatus} remoteJid=${remoteJid || '-'} rows=${updated}`);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Status update error:`, e.message);
        }
    }

    // Some devices send revoke events via messages.update (not messages.upsert)
    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates || []) {
            const updateStatus = normalizeMessageStatus((u as any)?.update?.status ?? (u as any)?.status);
            const statusKeyId = (u as any)?.key?.id as string | undefined;
            if (statusKeyId && updateStatus) {
                await updateMessageDeliveryStatus(statusKeyId, updateStatus, 'messages.update', (u as any)?.key?.remoteJid);
            }

            // Dump raw update structure to diagnose unexpected edit event shapes
            const updateKeys = Object.keys((u as any)?.update || {});
            if (updateKeys.length > 0 && !updateKeys.every(k => k === 'status')) {
                console.log(`[${accountId}] messages.update RAW keys=${JSON.stringify(updateKeys)} updateMsg=${JSON.stringify((u as any)?.update?.message || null)}`);
            }

            const nested =
                (u as any)?.update?.message?.ephemeralMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessageV2?.message ||
                (u as any)?.update?.message ||
                (u as any)?.update;

            const protocolMessage = (nested as any)?.protocolMessage;
            const revokedKeyId = protocolMessage?.key?.id as string | undefined;
            const protocolType = Number((protocolMessage as any)?.type);
            const editedBody = extractEditedBodyFromProtocol(protocolMessage);
            const isEditProtocol = hasEditedSignal(protocolMessage) || Boolean(editedBody);
            const isRevokeProtocol = protocolType === 0 && !isEditProtocol;

            if (protocolMessage) {
                console.log(`[${accountId}] messages.update proto: type=${protocolType} revokedKeyId=${revokedKeyId || '-'} isEdit=${isEditProtocol} isRevoke=${isRevokeProtocol} editedBody="${editedBody || ''}" keys=${Object.keys(protocolMessage).join(',')}`);
                if ((protocolMessage as any).editedMessage) {
                    console.log(`[${accountId}] messages.update editedMessage keys=${Object.keys((protocolMessage as any).editedMessage).join(',')}`);
                }
            }

            if (protocolMessage && revokedKeyId && isEditProtocol) {
                await markMessageAsEdited(revokedKeyId, editedBody, 'messages.update', (u as any)?.key?.remoteJid);
            } else if (protocolMessage && revokedKeyId && isRevokeProtocol) {
                await markMessageAsDeleted(revokedKeyId, 'messages.update', (u as any)?.key?.remoteJid);
            } else if (protocolMessage) {
                console.log(`[${accountId}] Ignored protocol message type=${Number.isFinite(protocolType) ? protocolType : 'unknown'} remoteJid=${(u as any)?.key?.remoteJid || '-'}`);
            }
        }
    });

    sock.ev.on('message-receipt.update', async (updates: any[]) => {
        for (const item of updates || []) {
            const keyId = item?.key?.id as string | undefined;
            // Baileys can emit a single receipt object OR an array of receipts.
            const receipts: any[] = Array.isArray(item?.receipt)
                ? item.receipt
                : (item?.receipt ? [item.receipt] : []);

            // Prefer the strongest state seen in this receipt batch.
            let best: 'failed' | 'sent' | 'delivered' | 'read' | 'played' | null = null;
            for (const r of receipts) {
                const explicit = normalizeMessageStatus(r?.status);
                const byTimestamp = r?.readTimestamp ? 'read' : (r?.receiptTimestamp ? 'delivered' : null);
                const candidate = explicit || byTimestamp;
                if (!candidate) continue;
                if (!best || statusRank(candidate) > statusRank(best)) best = candidate;
            }

            if (keyId && best) {
                await updateMessageDeliveryStatus(keyId, best, 'message-receipt.update', item?.key?.remoteJid);
            }
        }
    });

    // Messaging Upsert - Auto Reply Logic + Contact Harvesting + Message Persistence
    sock.ev.on('messages.upsert', async (m) => {
        const isNotify = m.type === 'notify';

        for (const msg of m.messages) {
            // Harvest/update contact names from incoming message metadata.
            if (msg.pushName) {
                const upsertName = (jid?: string | null) => {
                    if (!jid) return;
                    const existing = store!.contacts.get(jid) || { id: jid };
                    const existingName = String(existing.name || existing.verifiedName || existing.pushName || '').trim();
                    const incomingName = String(msg.pushName || '').trim();
                    if (!incomingName) return;

                    // Prefer any non-empty incoming name over empty/placeholder data.
                    const shouldUpdate =
                        !existingName ||
                        existingName === jid.split('@')[0] ||
                        existingName.length < incomingName.length;

                    if (shouldUpdate) {
                        store!.contacts.set(jid, {
                            ...existing,
                            id: jid,
                            name: incomingName,
                            pushName: incomingName
                        });
                    }
                };

                upsertName(msg.key.remoteJid);
                upsertName((msg.key as any)?.participant);
            }

            // Save all messages (incoming + outgoing) to DB for chat history
            const jidForSave = msg.key.remoteJid;
            const content =
                msg.message?.ephemeralMessage?.message ||
                msg.message?.viewOnceMessage?.message ||
                (msg.message as any)?.viewOnceMessageV2?.message ||
                msg.message;

            const rawTs: any = msg.messageTimestamp;
            const tsValue =
                typeof rawTs === 'number'
                    ? rawTs
                    : typeof rawTs === 'string'
                        ? Number(rawTs)
                        : typeof rawTs?.toNumber === 'function'
                            ? rawTs.toNumber()
                            : Number(rawTs);
            const safeTimestamp = Number.isFinite(tsValue)
                ? new Date(tsValue < 1e12 ? tsValue * 1000 : tsValue)
                : new Date();

            if (jidForSave && content) {
                try {
                    const { db: dbInst } = await import('./server/db');
                    const { messages: messagesTable } = await import('./server/db/schema');

                    // Handle protocol events (edit/revoke) by updating existing message rows.
                    const protocolMessage = (content as any)?.protocolMessage;

                    // Also check if the message itself is an editedMessage at root level (some Baileys versions)
                    const rootEditedMessage = (content as any)?.editedMessage || (msg.message as any)?.editedMessage;
                    if (!protocolMessage && rootEditedMessage) {
                        console.log(`[${accountId}] messages.upsert ROOT editedMessage found! keys=${Object.keys(rootEditedMessage).join(',')}`);
                        const targetId = (msg.key as any)?.id as string | undefined;
                        const newBody = extractEditedBodyFromProtocol({ editedMessage: rootEditedMessage });
                        if (targetId && newBody) {
                            await markMessageAsEdited(targetId, newBody, 'messages.upsert-root', jidForSave || undefined);
                        }
                        continue;
                    }

                    const revokedKeyId = protocolMessage?.key?.id as string | undefined;
                    const protocolType = Number((protocolMessage as any)?.type);
                    const editedBody = extractEditedBodyFromProtocol(protocolMessage);
                    const isEditProtocol = hasEditedSignal(protocolMessage) || Boolean(editedBody);
                    const isRevokeProtocol = protocolType === 0 && !isEditProtocol;

                    if (protocolMessage) {
                        console.log(`[${accountId}] messages.upsert proto: type=${protocolType} revokedKeyId=${revokedKeyId || '-'} isEdit=${isEditProtocol} isRevoke=${isRevokeProtocol} editedBody="${editedBody || ''}" keys=${Object.keys(protocolMessage).join(',')}`);
                        if ((protocolMessage as any).editedMessage) {
                            console.log(`[${accountId}] messages.upsert editedMessage keys=${Object.keys((protocolMessage as any).editedMessage).join(',')}`);
                        }
                    }

                    // Dump any upsert message that has no body and no media for diagnosis
                    const bodyRaw = extractMessageText(content as any);
                    const mediaTypeRaw = (content as any)?.imageMessage ? 'image' : (content as any)?.videoMessage ? 'video' : (content as any)?.audioMessage ? 'audio' : (content as any)?.documentMessage ? 'document' : null;
                    if (!protocolMessage && !bodyRaw && !mediaTypeRaw) {
                        const topKeys = Object.keys(content || {});
                        console.log(`[${accountId}] messages.upsert UNKNOWN empty msg keys=${JSON.stringify(topKeys)} fromMe=${msg.key.fromMe}`);
                    }

                    if (revokedKeyId && isEditProtocol) {
                        await markMessageAsEdited(revokedKeyId, editedBody, 'messages.upsert', jidForSave || undefined);
                        continue;
                    } else if (revokedKeyId && isRevokeProtocol) {
                        await markMessageAsDeleted(revokedKeyId, 'messages.upsert', jidForSave || undefined);
                        continue;
                    } else if (protocolMessage) {
                        console.log(`[${accountId}] Ignored protocol message type=${Number.isFinite(protocolType) ? protocolType : 'unknown'} remoteJid=${jidForSave || '-'}`);
                        continue;
                    }

                    const reactionMessage = (content as any)?.reactionMessage;
                    if (reactionMessage?.key?.id) {
                        const reactionActorJid = String((msg.key as any)?.participant || msg.key.remoteJid || '').trim();
                        await updateMessageReaction(
                            reactionMessage.key.id,
                            String(reactionMessage.text || '').trim() || null,
                            reactionActorJid || null,
                            String(msg.pushName || '').trim() || null
                        );
                        continue;
                    }

                    const body = extractMessageText(content as any);
                    const contextInfo = extractContextInfo(content as any);
                    const quotedMsgId = String(contextInfo?.stanzaId || '').trim();
                    const quotedMsgBody = extractMessageText(contextInfo?.quotedMessage || null);

                    const mediaType = (content as any)?.imageMessage ? 'image' :
                        (content as any)?.videoMessage ? 'video' :
                        (content as any)?.audioMessage ? 'audio' :
                        (content as any)?.documentMessage ? 'document' : null;

                    // Ignore protocol/system messages (e.g. revoke/delete notifications)
                    // and skip empty payloads that would render as blank bubbles.
                    const isProtocolMessage = Boolean((content as any)?.protocolMessage);
                    if (isProtocolMessage || (!body && !mediaType)) {
                        continue;
                    }

                    const messageId = msg.key.id
                        ? `${accountId}:${msg.key.id}`
                        : `${accountId}:fallback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

                    const isGroupJid = jidForSave.endsWith('@g.us');
                    const participantJid = String((msg.key as any)?.participant || (msg as any)?.participant || '').trim();
                    const selfJids = [String(status?.user?.id || '').trim(), String(sock.user?.id || '').trim()].filter(Boolean);
                    const selfUsers = new Set(
                        selfJids
                            .map((jid) => String(jidDecode(jid)?.user || jid.split('@')[0].split(':')[0] || '').trim().toLowerCase())
                            .filter(Boolean)
                    );
                    const selfDigits = new Set(selfJids.map((jid) => normalizeDigits(jid)).filter(Boolean));
                    const participantUser = String(jidDecode(participantJid)?.user || participantJid.split('@')[0].split(':')[0] || '').trim().toLowerCase();
                    const participantDigits = normalizeDigits(participantJid);
                    const selfNameSet = new Set(
                        [
                            normalizeNameValue((status as any)?.user?.name),
                            normalizeNameValue((sock.user as any)?.name),
                            normalizeNameValue((status as any)?.user?.verifiedName),
                            normalizeNameValue((status as any)?.user?.notify)
                        ].filter(Boolean)
                    );
                    const senderPushName = normalizeNameValue(String(msg.pushName || '').trim());
                    const participantIsSelf = Boolean(
                        (participantUser && selfUsers.has(participantUser)) ||
                        (participantDigits && selfDigits.has(participantDigits))
                    );
                    const senderNameLooksSelf = Boolean(senderPushName && selfNameSet.has(senderPushName));
                    const isFromMe = Boolean(msg.key.fromMe) || (isGroupJid && (participantIsSelf || senderNameLooksSelf));

                    const senderJid = !isFromMe && isGroupJid
                        ? participantJid || null
                        : null;
                    const senderName = !isFromMe && isGroupJid
                        ? String(msg.pushName || (senderJid ? getContactName(accountId, senderJid) : '') || '').trim() || null
                        : null;
                    // Normalize direct chat JID through canonical resolver to collapse lid/device variants.
                    const fallbackDigits = jidForSave.split('@')[0].split(':')[0].replace(/\D/g, '');
                    const canonicalDirectNumber = getCanonicalContactNumber(accountId, jidForSave) || fallbackDigits;
                    const selfNumber = String(status?.user?.id || sock.user?.id || '')
                        .split('@')[0]
                        .split(':')[0]
                        .replace(/\D/g, '');

                    // Ignore self-thread writes to prevent creating a fake conversation under account name.
                    if (!isGroupJid && selfNumber && canonicalDirectNumber === selfNumber) {
                        continue;
                    }

                    const normalizedJid = isGroupJid
                        ? jidForSave
                        : `${canonicalDirectNumber}@s.whatsapp.net`;

                    if (!isGroupJid && !canonicalDirectNumber) {
                        continue;
                    }

                    await dbInst.insert(messagesTable).values({
                        id: messageId,
                        accountId,
                        contactJid: normalizedJid,
                        senderJid,
                        senderName,
                        fromMe: isFromMe,
                        body,
                        mediaType,
                        quotedMsgId: quotedMsgId ? `${accountId}:${quotedMsgId}` : null,
                        quotedMsgBody: quotedMsgBody || null,
                        reaction: null,
                        timestamp: safeTimestamp,
                        status: isFromMe ? (consumePendingStatus(accountId, msg.key.id || '') || 'sent') : 'received'
                    }).onConflictDoNothing();

                    // Save raw proto bytes so we can lazy-download later
                    if (mediaType && msg.key.id) {
                        try {
                            const rawMsgId = msg.key.id;
                            const rawDir = path.join(MEDIA_PATH, accountId, 'raw');
                            if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
                            const rawPath = path.join(rawDir, `${rawMsgId}.bin`);
                            if (!fs.existsSync(rawPath)) {
                                const bytes = proto.WebMessageInfo.encode(msg as any).finish();
                                fs.writeFileSync(rawPath, Buffer.from(bytes));
                            }
                        } catch (protoErr: any) {
                            console.error(`[${accountId}] Proto save error:`, protoErr.message);
                        }
                    }

                    // Download and save media file immediately
                    if (mediaType && (content as any)?.[`${mediaType}Message`]) {
                        try {
                            const rawMsgId = msg.key.id!;
                            const mediaDir = path.join(MEDIA_PATH, accountId);
                            if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

                            const mimetype: string =
                                (content as any)?.imageMessage?.mimetype ||
                                (content as any)?.videoMessage?.mimetype ||
                                (content as any)?.audioMessage?.mimetype ||
                                (content as any)?.documentMessage?.mimetype || 'application/octet-stream';
                            const extPart = mimetype.split('/')[1]?.split(';')[0]?.split('+')[0] || 'bin';
                            const ext = extPart === 'jpeg' ? 'jpg' : extPart;
                            const filePath = path.join(mediaDir, `${rawMsgId}.${ext}`);

                            if (!fs.existsSync(filePath)) {
                                const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
                                    reuploadRequest: sock.updateMediaMessage
                                });
                                fs.writeFileSync(filePath, buffer as Buffer);
                            }
                        } catch (dlErr: any) {
                            console.error(`[${accountId}] Media download error:`, dlErr.message);
                        }
                    }
                } catch (e: any) {
                    console.error(`[${accountId}] Message save error:`, e.message);
                }
            }

            if (!isNotify) continue; // Auto-reply only for real-time notifications

            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            if (!from || from.includes('@g.us')) continue; // Ignore groups

            try {
                const { db } = await import('./server/db');
                const { accounts, users, userSettings, autoReplyHistory } = await import('./server/db/schema');
                const { eq, sql, and } = await import('drizzle-orm');

                const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
                if (!account || !account.autoReply || !account.autoReplyMessage) continue;

                const contactNumber = from.split('@')[0];

                const alreadyReplied = await db.select()
                    .from(autoReplyHistory)
                    .where(and(
                        eq(autoReplyHistory.accountId, accountId),
                        eq(autoReplyHistory.contactNumber, contactNumber)
                    )).get();
                
                if (alreadyReplied) continue;

                const user = await db.select().from(users).where(eq(users.id, account.userId)).get();
                if (!user || user.credits <= 0) continue;

                const settings = await db.select().from(userSettings).where(eq(userSettings.userId, account.userId)).get();
                if (settings && settings.readReceipt) {
                    await sock.readMessages([msg.key]);
                }

                // Natural delay
                await delay(2000);

                const res = await db.update(users)
                    .set({ credits: sql`${users.credits} - 1` })
                    .where(and(eq(users.id, account.userId), sql`${users.credits} > 0`))
                    .returning();
                
                if (res.length > 0) {
                    await sock.sendMessage(from, { text: account.autoReplyMessage });
                    await db.insert(autoReplyHistory).values({
                        accountId: accountId,
                        contactNumber: contactNumber,
                        sentAt: new Date()
                    });
                    console.log(`[${accountId}] Auto-replied to ${from} (First time)`);
                }
            } catch (e: any) {
                console.error(`[${accountId}] Auto-reply error:`, e.message);
            }
        }
    });
}

export function getAccountStatus(accountId: string) {
    return statuses.get(accountId) || { id: accountId, status: "disconnected", qr: null };
}

export function getAllAccounts(storedAccounts: any[]) {
    return storedAccounts.map(acc => {
        const liveStatus = statuses.get(acc.id);
        return {
            id: acc.id,
            name: acc.name,
            autoReply: !!acc.autoReply,
            isDefault: !!acc.isDefault,
            autoReplyMessage: acc.autoReplyMessage,
            status: liveStatus?.status || "disconnected",
            qr: liveStatus?.qr || null,
            qrRaw: liveStatus?.qrRaw || null,
            user: liveStatus?.user
        };
    });
}

export async function sendWhatsAppMessage(
    accountId: string,
    to: string,
    message: string,
    media?: { data: string, mimetype: string, filename: string },
    batchId?: string,
    replyTo?: { id?: string; body?: string; fromMe?: boolean; senderJid?: string | null; senderName?: string | null; mediaType?: string | null }
) {
    const { db } = await import('./server/db');
    const { accounts, users, logs } = await import('./server/db/schema');
    const { eq, sql, and } = await import('drizzle-orm');

    const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (!account) throw new Error('Account not found');

    const result = await db.update(users)
        .set({ credits: sql`${users.credits} - 1` })
        .where(and(eq(users.id, account.userId), sql`${users.credits} > 0`))
        .returning({ updatedCredits: users.credits });

    if (!result || result.length === 0) throw new Error('Yetersiz kredi.');

    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
        throw new Error(`Account ${accountId} is not ready`);
    }

    const shouldPersistLog = Boolean(batchId);

    let jid = toJid(to);
    const isGroupTarget = jid.endsWith('@g.us');
    
    // Verify direct numbers only; group JIDs must be sent as-is.
    if (!isGroupTarget) {
        try {
            const cleanNumber = to.replace(/\D/g, '');
            console.log(`[${accountId}] Checking onWhatsApp for: ${cleanNumber}`);
            const results = await client.onWhatsApp(cleanNumber);
        
            console.log(`[${accountId}] onWhatsApp result for ${cleanNumber}:`, JSON.stringify(results));
        
            if (results && results.length > 0) {
                const onWa = results[0];
                if (onWa.exists) {
                    // IMPORTANT: Always use the JID provided by the server to avoid ghosting
                    jid = onWa.jid;
                    console.log(`[${accountId}] ✅ Number verified: ${cleanNumber} -> ${jid}`);
                } else {
                    // Number is definitely NOT on WhatsApp - refund credit and stop
                    console.log(`[${accountId}] ❌ Number NOT on WhatsApp: ${cleanNumber}`);
                    await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
                    if (shouldPersistLog) {
                        await db.insert(logs).values({
                            id: Math.random().toString(36).substr(2, 9),
                            batchId,
                            accountId,
                            timestamp: new Date(),
                            recipient: to,
                            status: "error",
                            message: message.substring(0, 100),
                            error: 'Bu numara WhatsApp kullanmıyor.'
                        });
                    }
                    return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: result[0].updatedCredits + 1 };
                }
            } else {
                // Empty result - number likely not on WhatsApp, refund and stop
                console.log(`[${accountId}] ❌ No onWhatsApp result for: ${cleanNumber}`);
                await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
                if (shouldPersistLog) {
                    await db.insert(logs).values({
                        id: Math.random().toString(36).substr(2, 9),
                        batchId,
                        accountId,
                        timestamp: new Date(),
                        recipient: to,
                        status: "error",
                        message: message.substring(0, 100),
                        error: 'Bu numara WhatsApp kullanmıyor.'
                    });
                }
                return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: result[0].updatedCredits + 1 };
            }
        } catch (verifyErr: any) {
            // On technical errors (timeout, connection issue), log warning but attempt to send anyway
            console.warn(`[${accountId}] ⚠️ WhatsApp verification failed for ${to} (technical error), attempting delivery anyway:`, verifyErr.message || verifyErr);
            // Keep the default jid and attempt to send - don't block valid numbers due to API hiccups
        }
    }
    
    try {
        let sentMsg;
        const quotedBody = String(replyTo?.body || '').trim() || (replyTo?.mediaType ? '[Medya]' : '');
        const rawQuotedId = extractRawMessageId(replyTo?.id);
        const quotedMessage = rawQuotedId
            ? {
                key: {
                    remoteJid: jid,
                    fromMe: Boolean(replyTo?.fromMe),
                    id: rawQuotedId,
                    ...(jid.endsWith('@g.us') && !replyTo?.fromMe && replyTo?.senderJid ? { participant: String(replyTo.senderJid) } : {})
                },
                message: {
                    conversation: quotedBody || 'Mesaj'
                },
                pushName: String(replyTo?.senderName || '').trim() || undefined
            }
            : undefined;

        if (media) {
            // Baileys media sending (Accepts Buffers or URLs)
            const mediaBuffer = Buffer.from(media.data.split(",")[1] || media.data, 'base64');
            const isImage = media.mimetype.startsWith('image/');
            const isVideo = media.mimetype.startsWith('video/');
            const isAudio = media.mimetype.startsWith('audio/');
            
            const messageObj: any = {
                caption: message
            };

            if (isImage) messageObj.image = mediaBuffer;
            else if (isVideo) messageObj.video = mediaBuffer;
            else if (isAudio) messageObj.audio = mediaBuffer;
            else {
                messageObj.document = mediaBuffer;
                messageObj.mimetype = media.mimetype;
                messageObj.fileName = media.filename;
            }

            sentMsg = await client.sendMessage(jid, messageObj, quotedMessage ? { quoted: quotedMessage as any } : undefined);
        } else {
            sentMsg = await client.sendMessage(jid, { text: message }, quotedMessage ? { quoted: quotedMessage as any } : undefined);
        }

        if (shouldPersistLog) {
            await db.insert(logs).values({
                id: Math.random().toString(36).substr(2, 9),
                batchId,
                accountId,
                timestamp: new Date(),
                recipient: to,
                status: "success",
                message: message.substring(0, 100)
            });
        }

        // Save to messages table for chat history
        if (sentMsg?.key?.id) {
            const { messages: messagesTable } = await import('./server/db/schema');
            const mediaType = media ? (
                media.mimetype.startsWith('image/') ? 'image' :
                media.mimetype.startsWith('video/') ? 'video' :
                media.mimetype.startsWith('audio/') ? 'audio' : 'document'
            ) : null;
            
            // Preserve group JIDs; normalize only direct chat JIDs.
            const normalizedJid = jid.endsWith('@g.us')
                ? jid
                : `${jid.split('@')[0].replace(/\D/g, '')}@s.whatsapp.net`;
            
            await db.insert(messagesTable).values({
                id: `${accountId}:${sentMsg.key.id}`,
                accountId,
                contactJid: normalizedJid,
                senderJid: null,
                fromMe: true,
                body: message,
                mediaType,
                quotedMsgId: rawQuotedId ? `${accountId}:${rawQuotedId}` : null,
                quotedMsgBody: quotedBody || null,
                timestamp: new Date(),
                status: consumePendingStatus(accountId, sentMsg.key.id) || 'sent'
            }).onConflictDoNothing();
        }

        return { success: true, messageId: sentMsg.key.id, remainingCredits: result[0].updatedCredits };
    } catch (e: any) {
        await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
        if (shouldPersistLog) {
            await db.insert(logs).values({
                id: Math.random().toString(36).substr(2, 9),
                batchId,
                accountId,
                timestamp: new Date(),
                recipient: to,
                status: "error",
                message: message.substring(0, 100),
                error: e.message || 'Unknown error'
            });
        }
        return { success: false, error: e.message || 'WhatsApp gönderim hatası', remainingCredits: result[0].updatedCredits + 1 };
    }
}

export async function deleteWhatsAppMessageForEveryone(accountId: string, remoteJid: string, rawMessageId: string) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== 'ready') {
        return { success: false, error: 'Hesap bağlı değil' };
    }

    try {
        await client.sendMessage(remoteJid, {
            delete: {
                remoteJid,
                fromMe: true,
                id: rawMessageId
            }
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Herkesten silme başarısız' };
    }
}

export async function editWhatsAppMessage(accountId: string, remoteJid: string, rawMessageId: string, newText: string) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== 'ready') {
        return { success: false, error: 'Hesap bağlı değil' };
    }

    try {
        await client.sendMessage(remoteJid, {
            text: newText,
            edit: {
                remoteJid,
                fromMe: true,
                id: rawMessageId
            }
        } as any);

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Mesaj düzenlenemedi' };
    }
}

export async function getWhatsAppContacts(accountId: string) {
    const storePath = getStorePath(accountId);
    console.log(`[Backend-API] getWhatsAppContacts called for ID: ${accountId}. Reading from: ${storePath}`);
    const store = stores.get(accountId);
    if (!store) {
        console.log(`[${accountId}] getWhatsAppContacts: Store not found.`);
        return [];
    }
    
    // Merge contacts and chats for richer labels, including lid<->phone mapping.
    const combined = new Map<string, any>(store.contacts as Map<string, any>);
    store.chats.forEach((chat, jid) => {
        if (!combined.has(jid)) {
            combined.set(jid, {
                id: jid,
                name: chat.name,
                pushName: chat.pushName,
                notify: chat.notify
            });
        }
    });

    const contactsArray = Array.from(combined.values())
        .filter((c: any) => {
            const jid = String(c?.id || '');
            return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us');
        })
        .map((c: any) => {
            const jid = String(c?.id || '');
            const isGroup = jid.endsWith('@g.us');
            const number = isGroup ? jid.split('@')[0] : normalizeDigits(jid);

            return {
                id: jid,
                name: getContactName(accountId, jid),
                number,
                isMyContact: Boolean(c?.name),
                isGroup
            };
        });

    console.log(`[${accountId}] getWhatsAppContacts: Returning ${contactsArray.length} contacts.`);

    return contactsArray.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
}

export async function getWhatsAppConversations(accountId: string) {
    const store = stores.get(accountId);
    if (!store) return [];

    const chatsArray = Array.from(store.chats.values());
    
    return chatsArray
        .filter((c: any) => c.id.endsWith('@s.whatsapp.net'))
        .map((c: any) => {
            return {
                id: c.id,
                name: getContactName(accountId, c.id),
                number: c.id.split('@')[0],
                isMyContact: !!store.contacts.get(c.id)?.name
            };
        })
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
}

export async function resyncWhatsAppAccount(accountId: string) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);
    const store = stores.get(accountId);
    let refreshedGroupCount = 0;

    // Best-effort group metadata refresh before restart
    if (client && status?.status === 'ready' && store) {
        try {
            const groups = await client.groupFetchAllParticipating?.();
            if (groups && typeof groups === 'object') {
                for (const [groupJid, meta] of Object.entries(groups as Record<string, any>)) {
                    const subject = String((meta as any)?.subject || '').trim();
                    if (!groupJid.endsWith('@g.us')) continue;

                    store.chats.set(groupJid, {
                        ...(store.chats.get(groupJid) || {}),
                        id: groupJid,
                        name: subject || (store.chats.get(groupJid)?.name || ''),
                        subject
                    });

                    store.contacts.set(groupJid, {
                        ...(store.contacts.get(groupJid) || {}),
                        id: groupJid,
                        name: subject || (store.contacts.get(groupJid)?.name || ''),
                        notify: subject || (store.contacts.get(groupJid)?.notify || ''),
                        pushName: subject || (store.contacts.get(groupJid)?.pushName || '')
                    });

                    refreshedGroupCount++;
                }
                saveStore(accountId);
            }
        } catch (e: any) {
            console.warn(`[${accountId}] groupFetchAllParticipating failed during resync:`, e?.message || e);
        }
    }

    // Restart connection to force history synchronization pass again
    await stopWhatsApp(accountId);
    await delay(1000);
    await initializeWhatsApp(accountId);

    return { success: true, refreshedGroupCount };
}

export async function stopWhatsApp(accountId: string) {
    const client = clients.get(accountId);
    if (client) {
        try {
            console.log(`[${accountId}] Closing Baileys connection...`);
            client.end();
        } catch (e) {}
        clients.delete(accountId);
        stores.delete(accountId);
    }

    const intervalKey = `interval-${accountId}`;
    if (globalRef[intervalKey]) {
        clearInterval(globalRef[intervalKey]);
        delete globalRef[intervalKey];
    }

    const status = statuses.get(accountId);
    if (status) {
        status.status = "disconnected";
        status.qr = null;
        status.qrRaw = null;
    }
}

export async function removeAccount(accountId: string) {
    const client = clients.get(accountId);
    if (client) {
        try {
            console.log(`[${accountId}] Logging out (Baileys)...`);
            await client.logout();
        } catch (e) {}
    }
    await stopWhatsApp(accountId);
    statuses.delete(accountId);
    
    // Remove session directory
    try {
        const sessionPath = path.resolve(AUTH_PATH, `session-${accountId}`);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
    } catch (e) {}
}

export async function getLogs() {
    const { db } = await import('./server/db');
    const { logs, accounts } = await import('./server/db/schema');
    const { desc, eq, sql } = await import('drizzle-orm');
    
    try {
        return await db.select({
            id: logs.id,
            batchId: logs.batchId,
            accountId: logs.accountId,
            accountName: accounts.name,
            timestamp: logs.timestamp,
            recipient: logs.recipient,
            status: logs.status,
            message: logs.message,
            error: logs.error
        })
        .from(logs)
        .leftJoin(accounts, eq(logs.accountId, accounts.id))
        .where(sql`${logs.batchId} is not null`)
        .orderBy(desc(logs.timestamp))
        .limit(100);
    } catch (e) {
        return [];
    }
}

export function getContactName(accountId: string, jid: string): string {
    const normalizeJid = (value: string | undefined | null) => String(value || '').trim().toLowerCase();
    const fallbackName = jid.split('@')[0];
    const isGroupJid = normalizeJid(jid).endsWith('@g.us');
    const selfNames = new Set<string>();
    const liveUser = statuses.get(accountId)?.user;
    [liveUser?.name, liveUser?.verifiedName, liveUser?.notify, liveUser?.pushName]
        .map((value) => normalizeNameValue(value))
        .filter(Boolean)
        .forEach((value) => selfNames.add(value));

    const chooseCandidate = (candidates: Array<string | undefined | null>, fallbackToFirst = true) => {
        const cleaned = candidates
            .map((value) => String(value || '').trim())
            .filter(Boolean);
        if (cleaned.length === 0) return '';

        const nonSelf = cleaned.find((value) => !selfNames.has(normalizeNameValue(value)));
        if (nonSelf) return nonSelf;
        return fallbackToFirst ? cleaned[0] : '';
    };

    const targetDigits = normalizeDigits(jid);
    const currentStore = stores.get(accountId);
    const normalizedQueryJid = normalizeJid(jid);
    const directContact = currentStore?.contacts.get(normalizedQueryJid) || currentStore?.contacts.get(jid);
    const directChat = currentStore?.chats.get(normalizedQueryJid) || currentStore?.chats.get(jid);

    if (isGroupJid) {
        const groupResolved = chooseCandidate([
            directChat?.subject,
            directChat?.name,
            directContact?.name,
            directChat?.notify,
            directContact?.notify,
            directContact?.verifiedName,
            directContact?.pushName
        ]);
        return groupResolved || fallbackName;
    }

    let linkedLidContact: any = null;
    let sameNumberChat: any = null;
    if (currentStore && targetDigits) {
        for (const contact of currentStore.contacts.values()) {
            const idDigits = normalizeDigits((contact as any)?.id);
            if (idDigits === targetDigits && String((contact as any)?.id || '').endsWith('@lid')) {
                linkedLidContact = contact;
                break;
            }
            if (normalizeJid((contact as any)?.lid) === normalizeJid(jid)) {
                linkedLidContact = contact;
                break;
            }
        }

        for (const chat of currentStore.chats.values()) {
            if (normalizeDigits((chat as any)?.id) === targetDigits) {
                sameNumberChat = chat;
                break;
            }
        }
    }

    let crossStoreName = '';
    if (targetDigits) {
        for (const [storeAccountId, store] of stores.entries()) {
            if (storeAccountId === accountId) continue;

            for (const contact of store.contacts.values()) {
                if (normalizeDigits((contact as any)?.id) !== targetDigits) continue;
                const candidate = chooseCandidate([
                    (contact as any)?.name,
                    (contact as any)?.verifiedName,
                    (contact as any)?.notify,
                    (contact as any)?.pushName
                ], false);
                if (candidate) {
                    crossStoreName = candidate;
                    break;
                }
            }

            if (crossStoreName) break;
        }
    }

    const localResolved = chooseCandidate([
        directContact?.name,
        linkedLidContact?.name,
        linkedLidContact?.notify,
        directContact?.notify,
        directChat?.name,
        directChat?.subject,
        directChat?.notify,
        sameNumberChat?.name,
        sameNumberChat?.subject,
        sameNumberChat?.notify,
        directContact?.verifiedName,
        directContact?.pushName,
        linkedLidContact?.pushName,
        linkedLidContact?.verifiedName
    ], false);
    if (localResolved) return localResolved;

    const resolved = chooseCandidate([
        crossStoreName,
        directContact?.name,
        directContact?.notify,
        directChat?.name,
        directChat?.subject
    ]);

    return resolved || fallbackName;
}

export function getWhatsAppClient(accountId: string) {
    return clients.get(accountId);
}

export async function getWhatsAppAvatarUrl(accountId: string, jid: string) {
    const normalizedJid = String(jid || '').trim();
    if (!normalizedJid) return null;

    const cacheKey = `${accountId}:${normalizedJid}`;
    const cached = avatarCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
    }

    const store = stores.get(accountId);
    const cachedStoreUrl = [
        store?.contacts.get(normalizedJid)?.imgUrl,
        store?.chats.get(normalizedJid)?.imgUrl
    ].find((value) => isUsableAvatarUrl(value));

    if (cachedStoreUrl) {
        avatarCache.set(cacheKey, { url: cachedStoreUrl, expiresAt: Date.now() + 10 * 60 * 1000 });
        return cachedStoreUrl;
    }

    const client = clients.get(accountId);
    const status = statuses.get(accountId);
    if (!client || status?.status !== 'ready') {
        avatarCache.set(cacheKey, { url: null, expiresAt: Date.now() + 3 * 60 * 1000 });
        return null;
    }

    try {
        const avatarUrl = await client.profilePictureUrl(normalizedJid, 'image');
        const url = isUsableAvatarUrl(avatarUrl) ? avatarUrl : null;
        avatarCache.set(cacheKey, { url, expiresAt: Date.now() + 10 * 60 * 1000 });
        return url;
    } catch {
        avatarCache.set(cacheKey, { url: null, expiresAt: Date.now() + 3 * 60 * 1000 });
        return null;
    }
}

export function getCanonicalContactNumber(accountId: string, jidOrNumber: string): string {
    const input = (jidOrNumber || '').trim();
    if (!input) return '';

    const normalizeUser = (value: string) => value.split('@')[0].split(':')[0].replace(/\D/g, '');

    const resolveViaStore = (userDigits: string) => {
        const store = stores.get(accountId);
        if (!store || !userDigits) return '';

        // First map via LID alias (covers @lid and lid-style @s.whatsapp.net senders).
        for (const c of store.contacts.values()) {
            const lid = (c as any)?.lid as string | undefined;
            const id = (c as any)?.id as string | undefined;
            if (!id || !lid) continue;
            if (normalizeUser(lid) === userDigits) {
                return normalizeUser(id);
            }
        }

        // Then try direct phone id match (but ignore pure @lid ids here).
        for (const c of store.contacts.values()) {
            const id = (c as any)?.id as string | undefined;
            if (!id || id.endsWith('@lid')) continue;
            if (normalizeUser(id) === userDigits) {
                return normalizeUser(id);
            }
        }

        return '';
    };

    // Already a plain number.
    if (!input.includes('@')) {
        const digits = input.replace(/\D/g, '');
        return resolveViaStore(digits) || digits;
    }

    const [user, domain] = input.split('@');
    if (!user) return '';
    const userDigits = normalizeUser(user);

    const mapped = resolveViaStore(userDigits);
    if (mapped) return mapped;

    // Normal phone JIDs.
    if (domain === 's.whatsapp.net' || domain === 'c.us' || domain === 'g.us') {
        return userDigits;
    }

    // LID identity: map through store.contacts[*].lid -> contacts[*].id phone JID.
    if (domain === 'lid') {
        return userDigits;
    }

    return userDigits;
}

export async function initAllAccounts() {
    globalRef.baileysInitialized = true;
    
    try {
        const { db } = await import('./server/db');
        const { accounts } = await import('./server/db/schema');
        const storedAccounts = await db.select().from(accounts);
        
        console.log(`Auto-initializing ${storedAccounts.length} accounts with Baileys...`);
        for (const account of storedAccounts) {
            await initializeWhatsApp(account.id);
            await delay(2000); 
        }
    } catch (e) {}
}

if (!building) {
    // Check if we are in dev mode to avoid multiple initializations during HMR
    // SvelteKit re-imports this file often in dev mode
    setTimeout(() => {
        initAllAccounts().catch(e => console.error(e));
    }, 3000); // 3-second delay to let the server start properly
}
