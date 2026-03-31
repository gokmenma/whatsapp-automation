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

// Cache to prevent repeated failing metadata calls
if (!globalRef.metadataFetchCache) globalRef.metadataFetchCache = new Map<string, number>();
const metadataFetchCache: Map<string, number> = globalRef.metadataFetchCache;

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

    // Handle protocol events (Revoke / Edit) in messages.update
    sock.ev.on('messages.update', async (updates) => {
        for (const u of updates || []) {
            const nested =
                (u as any)?.update?.message?.ephemeralMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessage?.message ||
                (u as any)?.update?.message?.viewOnceMessageV2?.message ||
                (u as any)?.update?.message ||
                (u as any)?.update;

            const protocolMessage = (nested as any)?.protocolMessage;
            if (!protocolMessage) continue;

            const targetId = protocolMessage?.key?.id as string | undefined;
            const type = protocolMessage?.type;
            const hasEdit = Boolean(protocolMessage.editedMessage);

            if (targetId) {
                // Prioritize Edit check as it's more specific
                if (type === 14 || type === 'MESSAGE_EDIT' || hasEdit) {
                    const msgObj = protocolMessage.editedMessage;
                    const newBody = msgObj?.conversation ||
                                   msgObj?.extendedTextMessage?.text ||
                                   msgObj?.imageMessage?.caption ||
                                   '';
                    if (newBody) {
                        try {
                            const { db: dbInst } = await import('./server/db');
                            const { messages: messagesTable } = await import('./server/db/schema');
                            const { eq, and } = await import('drizzle-orm');
                            await dbInst.update(messagesTable)
                                .set({ body: newBody.trim() })
                                .where(and(
                                    eq(messagesTable.accountId, accountId),
                                    eq(messagesTable.id, `${accountId}:${targetId}`)
                                ));
                            console.log(`[${accountId}] Edit applied (messages.update) targetId=${targetId} hasEdit=${hasEdit} type=${type}`);
                        } catch (e: any) {
                            console.error(`[${accountId}] Edit update error:`, e.message);
                        }
                    }
                } else if (type === 0 || type === 'REVOKE') {
                    await markMessageAsDeleted(targetId, 'messages.update', (u as any)?.key?.remoteJid);
                }
            }
        }
    });

    // Messaging Upsert - Auto Reply Logic + Contact Harvesting + Message Persistence
    sock.ev.on('messages.upsert', async (m) => {
        const isNotify = m.type === 'notify';

        for (const msg of m.messages) {
            // Harvesting contact info from pushnames (very useful for newcomers)
            const pJid = msg.key.participant || (msg as any).participant || (msg.key.fromMe ? (status?.user?.id || sock.user?.id) : null);
            if (pJid && msg.pushName) {
                const existing = store!.contacts.get(pJid);
                if (!existing || (!existing.name && !existing.pushName)) {
                    console.log(`[${accountId}] Harvesting/Updating contact from message participant: ${msg.pushName} (${pJid})`);
                    store!.contacts.set(pJid, { 
                        ...(existing || {}),
                        id: pJid, 
                        name: msg.pushName, 
                        pushName: msg.pushName 
                    });
                }
            } else if (msg.key.remoteJid && msg.pushName) {
                const rJid = msg.key.remoteJid;
                const existing = store!.contacts.get(rJid);
                if (!existing || (!existing.name && !existing.pushName)) {
                    console.log(`[${accountId}] Harvesting/Updating contact from message: ${msg.pushName} (${rJid})`);
                    store!.contacts.set(rJid, { 
                        ...(existing || {}),
                        id: rJid, 
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

            if (jidForSave && content) {
                try {
                    const { db: dbInst } = await import('./server/db');
                    const { messages: messagesTable } = await import('./server/db/schema');

                    // Handle protocol messages (Revoke / Edit)
                    const protocolMessage = (content as any)?.protocolMessage;
                    if (protocolMessage) {
                        const targetId = protocolMessage?.key?.id as string | undefined;
                        const type = protocolMessage?.type;
                        const hasEdit = Boolean(protocolMessage.editedMessage);

                        if (targetId) {
                            // Check for edit FIRST because it is safer. An edit MUST have editedMessage.
                            if (type === 14 || type === 'MESSAGE_EDIT' || hasEdit) {
                                // Edit
                                const msgObj = protocolMessage.editedMessage;
                                const newBody = msgObj?.conversation ||
                                               msgObj?.extendedTextMessage?.text ||
                                               msgObj?.imageMessage?.caption ||
                                               '';
                                if (newBody) {
                                    try {
                                        const { db: dbInst } = await import('./server/db');
                                        const { messages: messagesTable } = await import('./server/db/schema');
                                        const { eq, and } = await import('drizzle-orm');
                                        await dbInst.update(messagesTable)
                                            .set({ body: newBody.trim() })
                                            .where(and(
                                                eq(messagesTable.accountId, accountId),
                                                eq(messagesTable.id, `${accountId}:${targetId}`)
                                            ));
                                        console.log(`[${accountId}] Edit applied (messages.upsert) targetId=${targetId} hasEdit=${hasEdit} type=${type}`);
                                    } catch (e: any) {
                                        console.error(`[${accountId}] Edit update error:`, e.message);
                                    }
                                    continue;
                                }
                            } else if (type === 0 || type === 'REVOKE') {
                                // Revoke (Delete)
                                await markMessageAsDeleted(targetId, 'messages.upsert', jidForSave || undefined);
                                continue;
                            } else {
                                // Unknown protocol type, log it to help debug
                                console.warn(`[${accountId}] Unknown protocol message type: ${type} for targetId: ${targetId}`, JSON.stringify(protocolMessage));
                            }
                        }
                        // If we reached here, it's a protocol message we are skipping
                        continue;
                    }

                    // Handle reactions
                    const isReaction = Boolean((content as any)?.reactionMessage);
                    if (isReaction) {
                        const reactionMsg = (content as any).reactionMessage;
                        const targetId = reactionMsg.key?.id;
                        const emoji = reactionMsg.text;
                        if (targetId) {
                            try {
                                const { db: dbInst } = await import('./server/db');
                                const { messages: messagesTable } = await import('./server/db/schema');
                                const { eq, and } = await import('drizzle-orm');
                                await dbInst.update(messagesTable)
                                    .set({ reaction: emoji })
                                    .where(and(
                                        eq(messagesTable.accountId, accountId),
                                        eq(messagesTable.id, `${accountId}:${targetId}`)
                                    ));
                                console.log(`[${accountId}] Reaction updated: ${targetId} -> ${emoji || 'removed'}`);
                            } catch (e: any) {
                                console.error(`[${accountId}] Reaction error:`, e.message);
                            }
                        }
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

                    let mediaType = (content as any)?.imageMessage ? 'image' :
                        (content as any)?.videoMessage ? 'video' :
                        (content as any)?.audioMessage ? 'audio' :
                        (content as any)?.documentMessage ? 'document' : null;

                    // If it's a document but has an image/video mimetype, treat it as such for preview purposes
                    if (mediaType === 'document') {
                        const mimetype = (content as any)?.documentMessage?.mimetype || '';
                        if (mimetype.startsWith('image/')) mediaType = 'image';
                        else if (mimetype.startsWith('video/')) mediaType = 'video';
                        else if (mimetype.startsWith('audio/')) mediaType = 'audio';
                    }

                    // Ignore protocol/system messages (e.g. revoke/delete notifications)
                    // and skip empty payloads that would render as blank bubbles.
                    const isProtocolMessage = Boolean((content as any)?.protocolMessage);
                    if (isProtocolMessage || (!body && !mediaType)) {
                        continue;
                    }

                    const messageId = msg.key.id
                        ? `${accountId}:${msg.key.id}`
                        : `${accountId}:fallback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

                    // Normalize JID: preserve group JIDs, but trim device suffixes from individual JIDs
                    const normalizedJid = jidForSave.includes('@g.us') 
                        ? jidForSave.split(':')[0].split('@')[0] + '@g.us'
                        : jidForSave.split('@')[0].split(':')[0].replace(/\D/g, '') + '@s.whatsapp.net';

                    // Ignore self-thread writes
                    const selfNumber = String(status?.user?.id || sock.user?.id || '')
                        .split('@')[0].split(':')[0].replace(/\D/g, '');
                    if (selfNumber && normalizedJid === `${selfNumber}@s.whatsapp.net`) {
                        continue;
                    }

                    // Robust identify if from me
                    const myJid = (status?.user?.id || sock.user?.id || '').split(':')[0].split('@')[0];
                    const sender = (msg.key.participant || msg.key.remoteJid || '').split(':')[0].split('@')[0];
                    const actualFromMe = msg.key.fromMe || (sender === myJid && !!myJid);

                    // Extract context info / quoted message
                    const msgContent = content as any;
                    const contextInfo = msgContent?.extendedTextMessage?.contextInfo || 
                                      msgContent?.imageMessage?.contextInfo || 
                                      msgContent?.videoMessage?.contextInfo || 
                                      msgContent?.documentMessage?.contextInfo || 
                                      msgContent?.contextInfo;

                    const quotedMsgId = contextInfo?.stanzaId;
                    const quotedMsg = contextInfo?.quotedMessage;
                    let quotedMsgBody = null;
                    if (quotedMsg) {
                        quotedMsgBody = quotedMsg.conversation || 
                                        quotedMsg.extendedTextMessage?.text || 
                                        (quotedMsg.imageMessage ? '[Fotoğraf]' : '') ||
                                        (quotedMsg.videoMessage ? '[Video]' : '') ||
                                        (quotedMsg.audioMessage ? '[Ses]' : '') ||
                                        (quotedMsg.documentMessage ? '[Belge]' : '') ||
                                        '[Mesaj]';
                    }

                    // Identify sender JID more aggressively
                    const participant = msg.key.participant || (msg as any).participant || (actualFromMe ? myJid : null);
                    const finalSenderJid = participant || msg.key.remoteJid;

                    await dbInst.insert(messagesTable).values({
                        id: messageId,
                        accountId,
                        contactJid: normalizedJid,
                        fromMe: actualFromMe,
                        body,
                        mediaType,
                        timestamp: safeTimestamp,
                        status: actualFromMe ? 'sent' : 'received',
                        senderJid: finalSenderJid,
                        quotedMsgId,
                        quotedMsgBody
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
    let validationPassed = jid.includes('@g.us'); // Groups don't need onWhatsApp check

    // Verify number exists on WhatsApp (Fast & Precise Check) - ONLY for individual chat
    if (!validationPassed) {
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
                    validationPassed = true;
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
                    return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: (result[0] as any).updatedCredits + 1 };
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
                return { success: false, error: 'Bu numara WhatsApp kullanmıyor.', remainingCredits: (result[0] as any).updatedCredits + 1 };
            }
        } catch (verifyErr: any) {
            // On technical errors (timeout, connection issue), log warning but attempt to send anyway
            console.warn(`[${accountId}] ⚠️ WhatsApp verification failed for ${to} (technical error), attempting delivery anyway:`, verifyErr.message || verifyErr);
            // Keep the default jid and attempt to send - don't block valid numbers due to API hiccups
        }
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
                
                const normalizedJid = jid.includes('@g.us') 
                    ? jid.split(':')[0].split('@')[0] + '@g.us'
                    : jid.split('@')[0].split(':')[0].replace(/\D/g, '') + '@s.whatsapp.net';

                // Save media to disk for previews
                if (media) {
                    try {
                        const mediaDir = path.resolve(process.env.USER_DATA_PATH || '.', 'media', accountId);
                        if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
                        
                        const extPart = media.mimetype.split('/')[1]?.split(';')[0]?.split('+')[0] || 'bin';
                        const ext = extPart === 'jpeg' ? 'jpg' : extPart;
                        const filePath = path.join(mediaDir, `${sentMsg.key.id}.${ext}`);
                        
                        const mediaBuffer = Buffer.from(media.data.split(",")[1] || media.data, 'base64');
                        fs.writeFileSync(filePath, mediaBuffer);
                        console.log(`[${accountId}] Sent media saved to disk: ${filePath}`);
                    } catch (diskErr: any) {
                        console.error(`[${accountId}] Failed to save sent media to disk:`, diskErr.message);
                    }
                }
                
                const myJid = (status?.user?.id || client?.user?.id || '').split(':')[0] + '@s.whatsapp.net';
                await db.insert(messagesTable).values({
                    id: `${accountId}:${sentMsg.key.id}`,
                    accountId,
                    contactJid: normalizedJid,
                    senderJid: myJid,
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
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.message || 'Mesaj düzenleme başarısız' };
    }
}

export async function getWhatsAppContacts(accountId: string) {
    const storePath = getStorePath(accountId);
    console.log(`[Backend-API] getWhatsAppContacts called for ID: ${accountId}. Reading from: ${storePath}`);
    const store = stores.get(accountId);
    if (!store) {
        console.log(`[${accountId}] getWhatsAppContacts: Store not found in memory.`);
        return [];
    }
    
    console.log(`[${accountId}] Contact list size: ${store.contacts.size}, Chat list size: ${store.chats.size}`);
    
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
        .filter((c: any) => {
            const jid = String(c?.id || '');
            return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us') || jid.endsWith('@g.us');
        })
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
        if (contact && (contact.name || contact.verifiedName || contact.pushName)) {
             return contact.name || contact.verifiedName || contact.pushName || jid.split('@')[0];
        }

        const chat = store.chats.get(jid);
        // Groups in Baileys stores often use 'subject' rather than 'name'
        if (chat && (chat.name || (chat as any).subject)) {
            return chat.name || (chat as any).subject;
        }

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

export async function getContactNameAsync(accountId: string, jid: string): Promise<{ name: string, participants?: string }> {
    const local = getContactName(accountId, jid);
    const isGeneric = local === jid.split('@')[0];
    
    let participants: string | undefined;

    // If it's a group, try to fetch/get participants regardless of if we have a name
    if (jid.endsWith('@g.us')) {
        const client = clients.get(accountId);
        if (client) {
            // Check if we recently tried and failed to fetch metadata for this group
            const cacheKey = `${accountId}:${jid}`;
            const lastAttempt = metadataFetchCache.get(cacheKey) || 0;
            const now = Date.now();
            
            // If we have a local name and we tried recently (last 1 min), skip fetch
            // But if it's a generic name (just JID), we want to try more aggressively (every 10s)
            const retryDelay = isGeneric ? 10 * 1000 : 60 * 1000;
            if (!isGeneric && (now - lastAttempt < retryDelay)) {
                return { name: local, participants };
            }
            if (isGeneric && (now - lastAttempt < retryDelay)) {
                return { name: local, participants };
            }

            try {
                // Timeout wrapper for metadata fetch
                const meta = await Promise.race([
                    client.groupMetadata(jid),
                    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timed Out')), 12000))
                ]);
                
                if (meta) {
                    if (meta.subject) {
                        const store = stores.get(accountId);
                        if (store) {
                            const existing = store.chats.get(jid) || {};
                            store.chats.set(jid, { ...existing, id: jid, name: meta.subject, subject: meta.subject });
                            saveStore(accountId);
                        }
                    }
                    
                    // Resolve participant names
                    if (meta.participants) {
                        const accountStatus = statuses.get(accountId);
                        const selfIdPart = accountStatus?.user?.id?.split('@')[0].split(':')[0];
                        
                        const names = meta.participants.slice(0, 5).map((p: any) => {
                            const pIdPart = p.id.split('@')[0].split(':')[0];
                            if (selfIdPart && pIdPart === selfIdPart) return 'Siz';
                            return getContactName(accountId, p.id);
                        });
                        participants = names.join(', ') + (meta.participants.length > 5 ? '...' : '');
                    }

                    // Success: Clear cache attempt time or set to very old
                    metadataFetchCache.delete(cacheKey);

                    return { 
                        name: meta.subject || local, 
                        participants 
                    };
                }
            } catch (e: any) {
                // Record failed attempt to avoid hammering
                metadataFetchCache.set(cacheKey, now);
                if (e.message === 'Timed Out') {
                    console.warn(`[${accountId}] Group metadata fetch timed out for ${jid}. Using local cache.`);
                } else {
                    console.warn(`[${accountId}] Failed to fetch group metadata for ${jid}:`, e.message);
                }
            }
        }
    }
    
    const { db } = await import('./server/db');
    const { chats: chatsTable } = await import('./server/db/schema');
    const { eq, and } = await import('drizzle-orm');

    const chatMeta = await db.select().from(chatsTable)
        .where(and(eq(chatsTable.accountId, accountId), eq(chatsTable.contactJid, jid)))
        .get();

    return { name: local, participants, isMuted: chatMeta?.isMuted || false };
}

export async function markWhatsAppRead(accountId: string, jid: string) {
    const client = clients.get(accountId);
    if (!client) return;
    
    try {
        const { db } = await import('./server/db');
        const { messages } = await import('./server/db/schema');
        const { eq, and, desc } = await import('drizzle-orm');
        
        const lastMsg = await db.select()
            .from(messages)
            .where(and(
                eq(messages.accountId, accountId),
                eq(messages.contactJid, jid),
                eq(messages.fromMe, false)
            ))
            .orderBy(desc(messages.timestamp))
            .limit(1)
            .get();
            
        if (lastMsg) {
            const rawId = lastMsg.id.includes(':') ? lastMsg.id.split(':').pop() : lastMsg.id;
            await client.readMessages([{ remoteJid: jid, id: rawId, fromMe: false }]);
            console.log(`[${accountId}] Marked as read: ${jid} (msg: ${rawId})`);
        }
    } catch (e: any) {
        console.error(`[${accountId}] Error marking read for ${jid}:`, e.message);
    }
}

export function toJid(number: string) {
    let clean = number.split('@')[0].split(':')[0].replace(/\D/g, '');
    // Groups often have hyphens in their JID (before @) or are very long (14+ digits)
    if (clean.length > 13 || number.split('@')[0].includes('-')) return `${clean}@g.us`;
    if (number.includes('@')) return number;
    return `${clean}@s.whatsapp.net`;
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

    // If it's just plain digits without domain
    if (!input.includes('@')) {
        const digits = input.replace(/\D/g, '');
        // Long digits or hyphenated without domain are usually groups (old style)
        if (digits.length > 13 || input.includes('-')) return `${digits}@g.us`;
        const resolved = resolveViaStore(digits);
        return resolved || digits;
    }

    const [user, domain] = input.split('@');
    if (!user) return '';
    const userDigits = normalizeUser(user);

    // If domain is explicitly provided, respect it.
    if (domain === 'g.us') return `${userDigits}@g.us`;
    if (domain === 's.whatsapp.net' || domain === 'c.us' || domain === 'lid') {
        const resolved = resolveViaStore(userDigits);
        return resolved || userDigits;
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
