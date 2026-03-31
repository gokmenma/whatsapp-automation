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

interface AccountStatus {
    id: string;
    status: "disconnected" | "connecting" | "ready" | "loading";
    qr: string | null;
    qrRaw?: string | null;
    user?: any;
}

const clients: Map<string, any> = globalRef.baileysClients;
const statuses: Map<string, AccountStatus> = globalRef.baileysStatuses;

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

export async function initializeWhatsApp(accountId: string) {
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
            await dbInst.run(sql`
                UPDATE messages
                SET body = 'Bu mesaj silindi',
                    media_type = NULL,
                    status = 'deleted_everyone'
                WHERE account_id = ${accountId}
                  AND (
                    id = ${prefixedId}
                    OR id = ${targetId}
                    OR id LIKE ${`%:${targetId}`}
                  )
            `);
            const changesRow = await dbInst.get(sql`SELECT changes() as n`);
            const changed = Number((changesRow as any)?.n || 0);
            if (changed > 0) {
                console.log(`[${accountId}] Revoke applied (${source}) targetId=${targetId} remoteJid=${remoteJid || '-'} rows=${changed}`);
            } else {
                console.warn(`[${accountId}] Revoke no-match (${source}) targetId=${targetId} remoteJid=${remoteJid || '-'} prefixed=${prefixedId}`);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Revoke update error:`, e.message);
        }
    }

    // Some devices send revoke events via messages.update (not messages.upsert)
    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates || []) {
            const nested =
                (u as any)?.update?.message?.ephemeralMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessageV2?.message ||
                (u as any)?.update?.message ||
                (u as any)?.update;

            const protocolMessage = (nested as any)?.protocolMessage;
            const revokedKeyId = protocolMessage?.key?.id as string | undefined;
            if (protocolMessage && revokedKeyId) {
                await markMessageAsDeleted(revokedKeyId, 'messages.update', (u as any)?.key?.remoteJid);
            } else if (protocolMessage) {
                console.warn(`[${accountId}] Revoke event without key.id (messages.update) remoteJid=${(u as any)?.key?.remoteJid || '-'}`);
            }
        }
    });

    // Messaging Upsert - Auto Reply Logic + Contact Harvesting + Message Persistence
    sock.ev.on('messages.upsert', async (m) => {
        const isNotify = m.type === 'notify';

        for (const msg of m.messages) {
            // Harvesting contact info from pushnames (very useful for newcomers)
            if (msg.key.remoteJid && msg.pushName) {
                const jid = msg.key.remoteJid;
                if (!store!.contacts.has(jid)) {
                    console.log(`[${accountId}] Harvesting contact from message: ${msg.pushName} (${jid})`);
                    store!.contacts.set(jid, { 
                        id: jid, 
                        name: msg.pushName, 
                        pushName: msg.pushName 
                    });
                }
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

            if (jidForSave && !jidForSave.includes('@g.us') && content) {
                try {
                    const { db: dbInst } = await import('./server/db');
                    const { messages: messagesTable } = await import('./server/db/schema');

                    // Handle revoke events: update existing message as deleted instead of inserting a new one.
                    const protocolMessage = (content as any)?.protocolMessage;
                    const revokedKeyId = protocolMessage?.key?.id as string | undefined;
                    if (revokedKeyId) {
                        await markMessageAsDeleted(revokedKeyId, 'messages.upsert', jidForSave || undefined);
                        continue;
                    } else if (protocolMessage) {
                        console.warn(`[${accountId}] Revoke event without key.id (messages.upsert) remoteJid=${jidForSave || '-'}`);
                        continue;
                    }

                    let body = (content as any)?.conversation ||
                        (content as any)?.extendedTextMessage?.text ||
                        (content as any)?.imageMessage?.caption ||
                        (content as any)?.videoMessage?.caption ||
                        (content as any)?.documentMessage?.caption || '';
                    // Remove zero-width characters produced by protocol events.
                    body = String(body).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
                    if (!body && (content as any)?.audioMessage) body = '[Ses mesajı]';
                    if (!body && (content as any)?.stickerMessage) body = '[Çıkartma]';
                    if (!body && (content as any)?.reactionMessage) body = '[Tepki]';

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

                    // Normalize JID to digits-only base number (removes device suffixes like :12)
                    const phoneNumber = jidForSave.split('@')[0].replace(/\D/g, '');
                    const selfNumber = String(status?.user?.id || sock.user?.id || '')
                        .split('@')[0]
                        .split(':')[0]
                        .replace(/\D/g, '');

                    // Ignore self-thread writes to prevent creating a fake conversation under account name.
                    if (selfNumber && phoneNumber === selfNumber) {
                        continue;
                    }

                    const normalizedJid = `${phoneNumber}@s.whatsapp.net`;

                    await dbInst.insert(messagesTable).values({
                        id: messageId,
                        accountId,
                        contactJid: normalizedJid,
                        fromMe: msg.key.fromMe ?? false,
                        body,
                        mediaType,
                        timestamp: safeTimestamp,
                        status: msg.key.fromMe ? 'sent' : 'received'
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
                                const buffer = await downloadMediaMessage(msg, 'buffer', {});
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

export async function sendWhatsAppMessage(accountId: string, to: string, message: string, media?: { data: string, mimetype: string, filename: string }, batchId?: string) {
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

    let jid = toJid(to);
    let verificationPassed = false;
    
    // Verify number exists on WhatsApp (Fast & Precise Check)
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
                verificationPassed = true;
                console.log(`[${accountId}] ✅ Number verified: ${cleanNumber} -> ${jid}`);
            } else {
                // Number is definitely NOT on WhatsApp - refund credit and stop
                console.log(`[${accountId}] ❌ Number NOT on WhatsApp: ${cleanNumber}`);
                await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
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
                return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: result[0].updatedCredits + 1 };
            }
        } else {
            // Empty result - number likely not on WhatsApp, refund and stop
            console.log(`[${accountId}] ❌ No onWhatsApp result for: ${cleanNumber}`);
            await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
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
            return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: result[0].updatedCredits + 1 };
        }
    } catch (verifyErr: any) {
        // On technical errors (timeout, connection issue), log warning but attempt to send anyway
        console.warn(`[${accountId}] ⚠️ WhatsApp verification failed for ${to} (technical error), attempting delivery anyway:`, verifyErr.message || verifyErr);
        // Keep the default jid and attempt to send - don't block valid numbers due to API hiccups
    }
    
    try {
        let sentMsg;
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

            sentMsg = await client.sendMessage(jid, messageObj);
        } else {
            sentMsg = await client.sendMessage(jid, { text: message });
        }

        await db.insert(logs).values({
            id: Math.random().toString(36).substr(2, 9),
            batchId,
            accountId,
            timestamp: new Date(),
            recipient: to,
            status: "success",
            message: message.substring(0, 100)
        });

        // Save to messages table for chat history
        if (sentMsg?.key?.id) {
            const { messages: messagesTable } = await import('./server/db/schema');
            const mediaType = media ? (
                media.mimetype.startsWith('image/') ? 'image' :
                media.mimetype.startsWith('video/') ? 'video' :
                media.mimetype.startsWith('audio/') ? 'audio' : 'document'
            ) : null;
            
            // Normalize JID to digits-only base number (removes device suffixes like :12)
            const phoneNumber = jid.split('@')[0].replace(/\D/g, '');
            const normalizedJid = `${phoneNumber}@s.whatsapp.net`;
            
            await db.insert(messagesTable).values({
                id: `${accountId}:${sentMsg.key.id}`,
                accountId,
                contactJid: normalizedJid,
                fromMe: true,
                body: message,
                mediaType,
                timestamp: new Date(),
                status: 'sent'
            }).onConflictDoNothing();
        }

        return { success: true, messageId: sentMsg.key.id, remainingCredits: result[0].updatedCredits };
    } catch (e: any) {
        await db.update(users).set({ credits: sql`${users.credits} + 1` }).where(eq(users.id, account.userId));
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

    const normalizeDigits = (value: string | undefined) =>
        String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');

    const byIdDigits = new Map<string, any>();
    const byLidDigits = new Map<string, any>();
    for (const c of combined.values()) {
        const idDigits = normalizeDigits(c?.id);
        const lidDigits = normalizeDigits(c?.lid);
        if (idDigits && !byIdDigits.has(idDigits)) byIdDigits.set(idDigits, c);
        if (lidDigits && !byLidDigits.has(lidDigits)) byLidDigits.set(lidDigits, c);
    }

    const pickBestName = (c: any) =>
        c?.name || c?.verifiedName || c?.notify || c?.pushName || '';

    const contactsArray = Array.from(combined.values())
        .filter((c: any) => String(c?.id || '').endsWith('@s.whatsapp.net'))
        .map((c: any) => {
            const number = normalizeDigits(c.id);

            // If this phone contact has no visible name, try related lid record.
            const maybeViaLid = byLidDigits.get(number);
            const maybeViaId = byIdDigits.get(number);
            const resolvedName =
                pickBestName(c) ||
                pickBestName(maybeViaLid) ||
                pickBestName(maybeViaId) ||
                number;

            return {
                id: c.id,
                name: resolvedName,
                number,
                isMyContact: Boolean(c?.name)
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
            const contact = store.contacts.get(c.id);
            const name = contact?.name || contact?.verifiedName || contact?.pushName || c.name || c.id.split('@')[0];
            return {
                id: c.id,
                name: name,
                number: c.id.split('@')[0],
                isMyContact: !!contact?.name
            };
        })
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
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
    const { desc, eq } = await import('drizzle-orm');
    
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
        .orderBy(desc(logs.timestamp))
        .limit(100);
    } catch (e) {
        return [];
    }
}

export function getContactName(accountId: string, jid: string): string {
    const store = stores.get(accountId);
    if (store) {
        const contact = store.contacts.get(jid);
        if (contact) return contact.name || contact.verifiedName || contact.pushName || jid.split('@')[0];

        // Resolve LID identity back to a phone contact if available.
        if (jid.endsWith('@lid')) {
            for (const c of store.contacts.values()) {
                if ((c as any)?.lid === jid && (c as any)?.id) {
                    const resolvedJid = (c as any).id as string;
                    return (c as any).name || (c as any).verifiedName || (c as any).pushName || resolvedJid.split('@')[0];
                }
            }
        }
    }
    return jid.split('@')[0];
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
