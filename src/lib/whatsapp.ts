import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    Browsers,
    type AnyMessageContent,
    type proto,
    WAMessageStubType,
    delay,
    jidDecode
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

    // Messaging Upsert - Auto Reply Logic + Contact Harvesting
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
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

export async function getWhatsAppContacts(accountId: string) {
    const storePath = getStorePath(accountId);
    console.log(`[Backend-API] getWhatsAppContacts called for ID: ${accountId}. Reading from: ${storePath}`);
    const store = stores.get(accountId);
    if (!store) {
        console.log(`[${accountId}] getWhatsAppContacts: Store not found.`);
        return [];
    }
    
    // Merge contacts and people from chats for a better list
    const combined = new Map(store.contacts);
    store.chats.forEach((chat, jid) => {
        if (jid.endsWith('@s.whatsapp.net') && !combined.has(jid)) {
            combined.set(jid, { 
                id: jid, 
                name: chat.name || jid.split('@')[0] 
            });
        }
    });

    const contactsArray = Array.from(combined.values());
    console.log(`[${accountId}] getWhatsAppContacts: Returning ${contactsArray.length} contacts.`);
    
    return contactsArray
        .filter((c: any) => c.id.endsWith('@s.whatsapp.net'))
        .map((c: any) => ({
            id: c.id,
            name: c.name || c.verifiedName || c.pushName || c.id.split('@')[0],
            number: c.id.split('@')[0],
            isMyContact: !!c.name
        }))
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
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

export async function initAllAccounts() {
    if (globalRef.baileysInitialized) return;
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
