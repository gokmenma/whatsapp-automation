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
import { EventEmitter } from 'node:events';
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
const historyProgress = new Map<string, { count: number }>();

function getHistoryProgressBucket(accountId: string) {
    let bucket = historyProgress.get(accountId);
    if (!bucket) {
        bucket = { count: 0 };
        historyProgress.set(accountId, bucket);
    }
    return bucket;
}
if (!globalRef.baileysAvatarCache) globalRef.baileysAvatarCache = new Map<string, { url: string | null; expiresAt: number }>();
if (!globalRef.baileysLidMasterMap) globalRef.baileysLidMasterMap = new Map<string, string>(); // Global LID -> Phone JID mapping
if (!globalRef.baileysLidMasterMapInitialized) globalRef.baileysLidMasterMapInitialized = false;
if (!globalRef.baileysBadMacHandlerRegistered) globalRef.baileysBadMacHandlerRegistered = false;
if (!globalRef.baileysBadMacRecoveryRunning) globalRef.baileysBadMacRecoveryRunning = false;
if (!globalRef.baileysBadMacRecoveryLastAt) globalRef.baileysBadMacRecoveryLastAt = 0;
if (!globalRef.baileysManualStops) globalRef.baileysManualStops = new Set<string>();
if (!globalRef.baileysReconnectTimers) globalRef.baileysReconnectTimers = new Map<string, NodeJS.Timeout>();
if (!globalRef.messageEventEmitter) globalRef.messageEventEmitter = new EventEmitter();

export const WHATSAPP_LIB_VERSION = "2026-04-10-V3";

export const getMessageEmitter = () => globalRef.messageEventEmitter as EventEmitter;

interface AccountStatus {
    id: string;
    status: "disconnected" | "connecting" | "ready" | "loading";
    qr: string | null;
    qrRaw?: string | null;
    user?: any;
    lastError?: string | null;
    connectionIssue?: "dns" | "offline" | "unknown" | null;
}

function classifyConnectionIssue(reason: unknown): "dns" | "offline" | "unknown" | null {
    const text = String((reason as any)?.message || reason || '').toLowerCase();
    if (!text) return null;
    if (text.includes('enotfound') || text.includes('getaddrinfo')) return 'dns';
    if (
        text.includes('enetunreach') ||
        text.includes('ehostunreach') ||
        text.includes('etimedout') ||
        text.includes('econnreset') ||
        text.includes('network') ||
        text.includes('internet')
    ) {
        return 'offline';
    }
    return 'unknown';
}

async function simulateTypingPresence(client: any, jid: string, text: string, minMs = 700, maxMs = 2200) {
    const targetJid = String(jid || '').trim();
    if (!targetJid || targetJid.endsWith('@g.us')) return;

    const contentLength = Math.max(1, String(text || '').trim().length);
    const estimated = Math.max(minMs, Math.min(maxMs, Math.round(contentLength * 35)));

    try {
        await client.presenceSubscribe(targetJid);
    } catch {
        // Presence subscribe can fail for some contacts; typing hint is optional.
    }

    try {
        await client.sendPresenceUpdate('composing', targetJid);
        await delay(estimated);
    } finally {
        try {
            await client.sendPresenceUpdate('paused', targetJid);
        } catch {
            // Ignore presence errors; sending message should continue.
        }
    }
}

const clients: Map<string, any> = globalRef.baileysClients;
const statuses: Map<string, AccountStatus> = globalRef.baileysStatuses;
const heldSessionLocks: Set<string> = globalRef.baileysSessionLocks;
const pendingMessageStatuses: Map<string, Map<string, string>> = globalRef.baileysPendingMessageStatuses;
const avatarCache: Map<string, { url: string | null; expiresAt: number }> = globalRef.baileysAvatarCache;
const manualStops: Set<string> = globalRef.baileysManualStops;
const reconnectTimers: Map<string, NodeJS.Timeout> = globalRef.baileysReconnectTimers;

export function normalizeDigits(value: string | undefined | null): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // For LID accounts that might contain alphanumeric chars, split domain but don't strip non-digits yet
    const userPart = raw.split('@')[0].split(':')[0];
    // If it looks like a phone number (mostly digits), strip everything else.
    // Otherwise keep it as is (useful for opaque IDs).
    const digitsOnly = userPart.replace(/\D/g, '');
    if (digitsOnly.length > 5 && digitsOnly.length === userPart.length) return digitsOnly;
    return userPart;
}

export function normalizeNameValue(value: string | undefined | null): string {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLowerCase();
}

function isBadMacSignalError(reason: unknown) {
    const errorObj = reason as any;
    const message = String(errorObj?.message || reason || '').toLowerCase();
    const stack = String(errorObj?.stack || '').toLowerCase();
    const combined = `${message}\n${stack}`;
    return combined.includes('bad mac') || combined.includes('session error');
}

async function recoverFromBadMac(reason: unknown) {
    if (globalRef.baileysBadMacRecoveryRunning) return;

    const now = Date.now();
    const lastAt = Number(globalRef.baileysBadMacRecoveryLastAt || 0);
    if (now - lastAt < 15000) return;

    globalRef.baileysBadMacRecoveryRunning = true;
    globalRef.baileysBadMacRecoveryLastAt = now;

    try {
        const accountIds = Array.from(statuses.entries())
            .filter(([, status]) => status?.status === 'ready' || status?.status === 'connecting' || status?.status === 'loading')
            .map(([id]) => id);

        console.warn(`[BadMAC] Signal session error detected. Restarting ${accountIds.length} active account(s).`, reason as any);

        for (const accountId of accountIds) {
            try {
                await stopWhatsApp(accountId);
                await delay(600);
                await initializeWhatsApp(accountId);
            } catch (e) {
                console.error(`[${accountId}] Bad MAC recovery failed:`, e);
            }
        }
    } finally {
        globalRef.baileysBadMacRecoveryRunning = false;
    }
}

function registerBadMacRecoveryHandler() {
    if (globalRef.baileysBadMacHandlerRegistered) return;
    globalRef.baileysBadMacHandlerRegistered = true;

    process.on('unhandledRejection', (reason) => {
        if (!isBadMacSignalError(reason)) return;
        void recoverFromBadMac(reason);
    });
}

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
registerBadMacRecoveryHandler();

// A simple in-memory store with persistence
interface SimpleStore {
    contacts: Map<string, any>;
    chats: Map<string, any>;
    numberToJid: Map<string, string>; // Maps "12345" -> "12345@s.whatsapp.net"
    lidToJid: Map<string, string>;    // Maps "lid_jid@lid" -> "phone_jid@s.whatsapp.net"
    jidToLid: Map<string, string>;    // Maps "phone_jid@s.whatsapp.net" -> "lid_jid@lid"
}
if (!globalRef.baileysStores) globalRef.baileysStores = new Map<string, SimpleStore>();
const stores: Map<string, SimpleStore> = globalRef.baileysStores;

const lidMasterMap: Map<string, string> = globalRef.baileysLidMasterMap;

function getLidKey(lid: string) {
    if (!lid) return '';
    const user = String(lid).split('@')[0].split(':')[0].trim().toLowerCase();
    return user ? `${user}@lid` : '';
}

function updateLidMasterMap(lid: string, jid: string) {
    const key = getLidKey(lid);
    const cleanJid = String(jid || '').trim();
    if (key && cleanJid && cleanJid.endsWith('@s.whatsapp.net')) {
        lidMasterMap.set(key, cleanJid);
    }
}

function initLidMasterMap() {
    if (globalRef.baileysLidMasterMapInitialized) return;
    globalRef.baileysLidMasterMapInitialized = true;

    try {
        if (!fs.existsSync(AUTH_PATH)) return;
        const files = fs.readdirSync(AUTH_PATH).filter(f => f.startsWith('store-') && f.endsWith('.json'));
        console.log(`[LID MASTER] Found ${files.length} store files to scan for LID mappings.`);
        
        for (const f of files) {
            try {
                const filePath = path.join(AUTH_PATH, f);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                const contacts = data.contacts || [];
                for (const [id, c] of contacts) {
                    if (c.lid && id.endsWith('@s.whatsapp.net')) {
                        updateLidMasterMap(c.lid, id);
                    }
                }
            } catch (err) {
                // skip broken files
            }
        }
        console.log(`[LID MASTER] Initialized with ${lidMasterMap.size} unique LID mappings.`);
    } catch (e) {
        console.error('[LID MASTER] Initialization error:', e);
    }
}

// Force re-initialization to pick up new canonical keys
globalRef.baileysLidMasterMapInitialized = false;
initLidMasterMap();

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
            // no need to persist mapping caches, they rebuild on load
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
            const contacts = new Map(data.contacts || []);
            const chats = new Map(data.chats || []);
            
            console.log(`[${accountId}] Rebuilding caches for ${contacts.size} contacts...`);
            
            // Rebuild caches
            const numberToJid = new Map<string, string>();
            const lidToJid = new Map<string, string>();
            const jidToLid = new Map<string, string>();
            
            contacts.forEach((c: any, id: string) => {
                const digits = normalizeDigits(id);
                if (digits && !id.endsWith('@lid')) numberToJid.set(digits, id);
                
                const lidValue = c.lid || (id.endsWith('@lid') ? id : null);
                if (lidValue && id.endsWith('@s.whatsapp.net')) {
                    const lidId = getLidKey(lidValue);
                    if (lidId) {
                        lidToJid.set(lidId, id);
                        jidToLid.set(id, lidId);
                        updateLidMasterMap(lidId, id);
                    }
                }
            });

            return { contacts, chats, numberToJid, lidToJid, jidToLid };
        } catch (e) {
            console.error(`[${accountId}] Store load error:`, e);
        }
    }
    return { contacts: new Map(), chats: new Map(), numberToJid: new Map(), lidToJid: new Map(), jidToLid: new Map() };
}

// Robustly rebuild all in-memory caches to ensure backward compatibility with stores loaded before patches
function rebuildAllStoreCaches() {
    console.log('[STORE CACHE] Rebuilding all in-memory store caches...');
    let rebuildCount = 0;
    
    for (const [accountId, store] of stores.entries()) {
        try {
            if (!store.numberToJid) store.numberToJid = new Map();
            if (!store.lidToJid) store.lidToJid = new Map();
            if (!store.jidToLid) store.jidToLid = new Map();
            
            store.contacts.forEach((c: any, id: string) => {
                const digits = normalizeDigits(id);
                if (digits && !id.endsWith('@lid')) store.numberToJid.set(digits, id);
                
                if (c.lid && id.endsWith('@s.whatsapp.net')) {
                    const lidId = String(c.lid).trim().toLowerCase();
                    store.lidToJid.set(lidId, id);
                    store.jidToLid.set(id, lidId);
                    updateLidMasterMap(lidId, id);
                    
                    // Also robustly add the canonical digits version of LID to the caches
                    const lidKey = getLidKey(lidId);
                    if (lidKey && lidKey !== lidId) {
                        store.lidToJid.set(lidKey, id);
                        updateLidMasterMap(lidKey, id);
                    }
                    rebuildCount++;
                }
            });
        } catch (err) {
            console.error(`[STORE CACHE] Failed to rebuild caches for ${accountId}:`, err);
        }
    }
    console.log(`[STORE CACHE] Rebuilt caches with ${rebuildCount} LID mappings found.`);
}

rebuildAllStoreCaches();

export async function sendWhatsAppReaction(
    accountId: string,
    messageId: string,
    emoji: string | null
) {
    console.log(`[${accountId}] sendWhatsAppReaction called for msg=${messageId} emoji=${emoji}`);
    
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || (status?.status !== "ready" && status?.status !== "loading")) {
        console.error(`[${accountId}] Reaction failed: Client not ready (status=${status?.status})`);
        throw new Error(`Hesap hazır değil (${status?.status || 'disconnected'})`);
    }

    const { db } = await import('./server/db');
    const { messages } = await import('./server/db/schema');
    const { eq, and, or, like } = await import('drizzle-orm');

    // Find the message in DB to get contactJid, fromMe, and senderJid
    // We try multiple ways to find the message because messageId might be prefixed or raw
    const msgRows = await db.select().from(messages).where(
        and(
            eq(messages.accountId, accountId),
            or(
                eq(messages.id, messageId),
                eq(messages.id, `${accountId}:${messageId}`),
                like(messages.id, `%:${messageId}`)
            )
        )
    ).limit(1);

    const msg = msgRows[0];
    if (!msg) {
        console.error(`[${accountId}] Reaction failed: Message lookup returned 0 rows for query: ${messageId}`);
        throw new Error('Mesaj veritabanında bulunamadı');
    }

    const jid = String(msg.contactJid || '').trim();
    const fromMe = Boolean(msg.fromMe);
    const participant = String(msg.senderJid || '').trim() || undefined;
    
    // Baileys uses the raw message ID without account prefix
    // Robust extraction: remove the first part if it matches accountId:
    let rawId = messageId;
    if (messageId.startsWith(`${accountId}:`)) {
        rawId = messageId.substring(accountId.length + 1);
    } else if (messageId.includes(':')) {
        // Fallback for any other prefixed format
        rawId = messageId.split(':').slice(1).join(':');
    }

    if (!jid) {
        console.error(`[${accountId}] Reaction failed: Resolved JID is empty for msg=${msg.id}`);
        throw new Error('Mesajın sahibi (JID) bulunamadı');
    }

    const reactionKey = {
        remoteJid: jid,
        fromMe: fromMe,
        id: rawId,
        participant: jid.endsWith('@g.us') ? participant : undefined
    };

    console.log(`[${accountId}] Sending reaction message... Key:`, JSON.stringify(reactionKey));

    try {
        const result = await client.sendMessage(jid, {
            react: {
                text: emoji || '',
                key: reactionKey
            }
        });
        console.log(`[${accountId}] Reaction sent successfully. ID: ${result?.key?.id}`);
        return result;
    } catch (err: any) {
        console.error(`[${accountId}] client.sendMessage reaction error:`, err.message);
        throw new Error(`WhatsApp gönderim hatası: ${err.message}`);
    }
}


export function normalizePhone(number: string): string {
    let cleanNumber = String(number || '').replace(/\D/g, '');
    if (cleanNumber.length === 10 && cleanNumber.startsWith('5')) {
        cleanNumber = '90' + cleanNumber;
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('05')) {
        cleanNumber = '90' + cleanNumber.substring(1);
    }
    return cleanNumber;
}

// HELPER: Normalize phone numbers to Baileys JID (12345@s.whatsapp.net)
function toJid(number: string) {
    if (number.includes('@')) return number;
    const cleanNumber = normalizePhone(number);
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



function extractMessageText(content: any) {
    let body = content?.conversation ||
        content?.extendedTextMessage?.text ||
        content?.imageMessage?.caption ||
        content?.videoMessage?.caption ||
        content?.documentMessage?.caption || '';

    body = String(body || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!body && content?.documentMessage?.fileName) body = String(content.documentMessage.fileName).trim();
    if (!body && content?.audioMessage) body = '[Ses mesajı]';
    if (!body && content?.stickerMessage) body = '[Çıkartma]';
    if (!body && (content?.imageMessage || content?.videoMessage)) body = '[Medya]';
    if (!body && content?.locationMessage) body = '[Konum]';
    if (!body && (content?.contactMessage || content?.contactsArrayMessage)) body = '[Kişi bilgisi]';
    if (!body && content?.pollCreationMessage) body = '[Anket]';
    if (!body && content?.liveLocationMessage) body = '[Canlı konum]';
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

export async function initializeWhatsApp(accountId: string, syncHistory: boolean = false) {
    console.log(`[${accountId}] initializeWhatsApp called with syncHistory=${syncHistory}`);
    manualStops.delete(accountId);
    const pendingReconnect = reconnectTimers.get(accountId);
    if (pendingReconnect) {
        clearTimeout(pendingReconnect);
        reconnectTimers.delete(accountId);
    }

    if (!acquireSessionLock(accountId)) {
        const existing = statuses.get(accountId) || { id: accountId, status: 'disconnected', qr: null };
        existing.status = 'disconnected';
        existing.qr = null;
        existing.qrRaw = null;
        existing.lastError = null;
        existing.connectionIssue = null;
        statuses.set(accountId, existing);
        return;
    }

    // CRITICAL: Verify if account still exists in Database before connecting
    try {
        const { db: dbInst } = await import('./server/db');
        const { accounts: accountsTable } = await import('./server/db/schema');
        const { eq } = await import('drizzle-orm');
        const rows = await dbInst.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
        if (rows.length === 0) {
            console.warn(`[${accountId}] initializeWhatsApp aborted: Account not found in database (orphan). Cleaning up...`);
            clients.delete(accountId);
            statuses.delete(accountId);
            releaseSessionLock(accountId);
            return;
        }
        
        // If syncHistory was not explicitly passed (e.g. from auto-init), use the one from DB
        const dbAccount = rows[0];
        // Note: We no longer auto-override to DB value here because we want 
        // the function parameter to be the source of truth for the manual call.
    } catch (dbErr) {
        console.error(`[${accountId}] Database check failed during initialization:`, dbErr);
        // We continue anyway to avoid locking out accounts during temporary DB hiccups
    }

    if (clients.has(accountId)) {
        console.log(`[${accountId}] Client already exists. Checking status...`);
        const currentStatus = statuses.get(accountId);
        
        // If they want history sync, we MUST restart to trigger it in Baileys
        if (syncHistory) {
            console.log(`[${accountId}] History sync requested for existing client. Forcing restart...`);
            await stopWhatsApp(accountId);
            manualStops.delete(accountId); // Clear the stop we just did
        } else if (currentStatus?.status === "ready" || currentStatus?.status === "loading" || currentStatus?.status === "connecting") {
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
        qr: null,
        lastError: null,
        connectionIssue: null
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
        syncFullHistory: syncHistory, // User preference
        shouldSyncHistoryMessage: () => syncHistory, // User preference
        getMessage: async (key) => {
            return undefined; // We can add local message retrieval later if needed
        },
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60000,
        markOnlineOnConnect: true
    });
    console.log(`[${accountId}] Baileys socket initialized. syncFullHistory=${syncHistory}`);

    // DEBUG: Catch-all event listener to see what WhatsApp is actually sending
    sock.ev.process(async (events) => {
        for (const [name, data] of Object.entries(events)) {
            if (name === 'messaging-history.set' || name.includes('history')) {
                console.log(`[Debug Event] [${accountId}] Event: ${name} (Data size: ${JSON.stringify(data).length})`);
            }
        }
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
            if (c.id) {
                store!.contacts.set(c.id, { ...(store!.contacts.get(c.id) || {}), ...c });
                
                // Update caches
                const digits = normalizeDigits(c.id);
                if (digits && !c.id.endsWith('@lid')) store!.numberToJid.set(digits, c.id);
                if (c.lid && c.id.endsWith('@s.whatsapp.net')) {
                    const lidId = String(c.lid).trim().toLowerCase();
                    store!.lidToJid.set(lidId, c.id);
                    store!.jidToLid.set(c.id, lidId);
                }
            }
        });
        saveStore(accountId);
    });

    sock.ev.on('contacts.upsert', (newContacts: any[]) => {
        newContacts.forEach(c => {
            const existing = store!.contacts.get(c.id) || {};
            store!.contacts.set(c.id, { ...existing, ...c });
            
            // Update caches
            const digits = normalizeDigits(c.id);
            if (digits && !c.id.endsWith('@lid')) store!.numberToJid.set(digits, c.id);
            if (c.lid && c.id.endsWith('@s.whatsapp.net')) {
                const lidId = String(c.lid).trim().toLowerCase();
                store!.lidToJid.set(lidId, c.id);
                store!.jidToLid.set(c.id, lidId);
            }
        });
    });

    sock.ev.on('contacts.update', (updates: any[]) => {
        updates.forEach(u => {
            const existing = store!.contacts.get(u.id);
            if (existing) {
                store!.contacts.set(u.id, { ...existing, ...u });
                
                // Update caches if lid or id changed (rare)
                const digits = normalizeDigits(u.id);
                if (digits && !u.id.endsWith('@lid')) store!.numberToJid.set(digits, u.id);
                if (u.lid && u.id.endsWith('@s.whatsapp.net')) {
                    const lidId = String(u.lid).trim().toLowerCase();
                    store!.lidToJid.set(lidId, u.id);
                    store!.jidToLid.set(u.id, lidId);
                }
            }
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

                const hasUnreadField =
                    Object.prototype.hasOwnProperty.call(u, 'unreadCount') ||
                    Object.prototype.hasOwnProperty.call(u, 'unread') ||
                    Object.prototype.hasOwnProperty.call(u, 'unreadCounter') ||
                    Object.prototype.hasOwnProperty.call(u, 'unreadMessagesCount');

                if (hasUnreadField) {
                    const nextUnread = Number(
                        (u as any).unreadCount ??
                        (u as any).unread ??
                        (u as any).unreadCounter ??
                        (u as any).unreadMessagesCount ??
                        0
                    );

                    // If WA reports this chat as read on the device, mirror it to local DB.
                    if (Number.isFinite(nextUnread) && nextUnread <= 0) {
                        void markConversationReadInDbFromRemoteJid(String(u.id || ''));
                    }
                }
            }
        });
    });

    // Robust listener for history/contacts (handling all possible event names)
    const historyHandler = async (data: any) => {
        const { contacts, chats, messages } = data;
        console.log(`[${accountId}] History Sync Event: ${contacts?.length || 0} contacts, ${chats?.length || 0} chats, ${messages?.length || 0} messages.`);
        
        if (contacts) contacts.forEach((c: any) => {
            store!.contacts.set(c.id, c);
            const digits = normalizeDigits(c.id);
            if (digits && !c.id.endsWith('@lid')) store!.numberToJid.set(digits, c.id);
            if (c.lid && c.id.endsWith('@s.whatsapp.net')) {
                const lidId = String(c.lid).trim().toLowerCase();
                store!.lidToJid.set(lidId, c.id);
                store!.jidToLid.set(c.id, lidId);
            }
        });

        if (chats) {
            chats.forEach((c: any) => {
                const existing = store!.chats.get(c.id) || {};
                store!.chats.set(c.id, { ...existing, ...c });
            });
        }
        
        // Process historical messages if present
        if (messages && Array.isArray(messages) && messages.length > 0) {
            console.log(`[${accountId}] Processing ${messages.length} historical messages...`);
            
            // Collect unread counts per chat to accurately restore read status
            const unreadCounts = new Map<string, number>();
            if (chats) {
                chats.forEach((c: any) => {
                    if (c.id && typeof c.unreadCount === 'number') {
                        unreadCounts.set(c.id, c.unreadCount);
                    }
                });
            }

            // Sort messages newest-to-oldest to mark the last 'unreadCount' messages correctly
            const sortedMessages = [...messages].sort((a, b) => {
                const tsA = Number(a.messageTimestamp) || 0;
                const tsB = Number(b.messageTimestamp) || 0;
                return tsB - tsA;
            });

            const seenCounts = new Map<string, number>();

            for (const msg of sortedMessages) {
                try {
                    const jid = msg.key?.remoteJid;
                    const fromMe = !!msg.key?.fromMe;
                    let forceUnread = false;

                    // If chat has N unread, only the N most recent incoming messages should be 'unread'
                    if (jid && !fromMe) {
                        const totalUnread = unreadCounts.get(jid) || 0;
                        const seenSoFar = seenCounts.get(jid) || 0;
                        if (seenSoFar < totalUnread) {
                            forceUnread = true;
                            seenCounts.set(jid, seenSoFar + 1);
                        }
                    }

                    await processAndStoreMessage(msg, true, forceUnread);
                } catch (err) {
                    // Silently continue for individual history messages
                }
            }
            console.log(`[${accountId}] Finished processing historical messages.`);
        }

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
            status.lastError = null;
            status.connectionIssue = null;
        }

        if (connection === 'close') {
            const closeReason = (lastDisconnect?.error as any)?.message || String(lastDisconnect?.error || '');
            const connectionIssue = classifyConnectionIssue(closeReason);
            const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
            const wasManuallyStopped = manualStops.has(accountId);
            console.log(`[${accountId}] Connection closed due to ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);
            
            status.status = "disconnected";
            status.qr = null;
            status.qrRaw = null;
            status.lastError = closeReason || null;
            status.connectionIssue = connectionIssue;
            
            if (shouldReconnect && !wasManuallyStopped) {
                // Short delay to avoid infinite retry loops on network issues
                const timer = setTimeout(async () => {
                    reconnectTimers.delete(accountId);
                    
                    // Final safety check before background reconnect: is it still in DB?
                    try {
                        const { db: dbInst } = await import('./server/db');
                        const { accounts: accountsTable } = await import('./server/db/schema');
                        const { eq } = await import('drizzle-orm');
                        const rows = await dbInst.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
                        if (rows.length === 0) {
                            console.warn(`[${accountId}] Reconnect aborted: Account no longer in database.`);
                            clients.delete(accountId);
                            statuses.delete(accountId);
                            releaseSessionLock(accountId);
                            return;
                        }
                    } catch (e) { /* Ignore DB errors here, initializeWhatsApp will catch it again */ }

                    initializeWhatsApp(accountId).catch(e => console.error(`[${accountId}] Reconnect error:`, e));
                }, 3000);
                reconnectTimers.set(accountId, timer);
            } else {
                if (wasManuallyStopped) {
                    console.log(`[${accountId}] Connection closed by manual stop. Auto reconnect disabled until explicit start.`);
                } else {
                    console.log(`[${accountId}] Connection closed. Device logged out.`);
                }
                clients.delete(accountId);
                stores.delete(accountId);
                releaseSessionLock(accountId);
                if (!wasManuallyStopped) {
                    // Remove session folder on logout
                    try {
                        fs.rmSync(path.join(AUTH_PATH, `session-${accountId}`), { recursive: true, force: true });
                    } catch (e) {}
                }
            }
        } else if (connection === 'open') {
            console.log(`[${accountId}] SUCCESS: WHATSAPP READY (BAILEYS)!`);
            status.status = "ready";
            status.qr = null;
            status.qrRaw = null;
            status.user = sock.user;
            status.lastError = null;
            status.connectionIssue = null;

            // Sync account name with device profile name if currently using a placeholder
            if (sock.user?.name) {
                void (async () => {
                    try {
                        const { db } = await import('./server/db');
                        const { accounts } = await import('./server/db/schema');
                        const { eq } = await import('drizzle-orm');
                        const [acc] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
                        
                        // If current name is a phone number or UUID-like, update it with real name
                        const isPlaceholder = !acc.name || 
                                            acc.name.replace(/\D/g, '').length > 8 || 
                                            acc.name.length > 20 && acc.name.includes('-');
                        
                        if (isPlaceholder && sock.user.name) {
                            console.log(`[${accountId}] Syncing account name: ${acc.name} -> ${sock.user.name}`);
                            await db.update(accounts).set({ name: sock.user.name }).where(eq(accounts.id, accountId));
                        }
                    } catch (e) {
                         console.error(`[${accountId}] Failed to sync account name:`, e);
                    }
                })();
            }
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
            const [rows]: any = await dbInst.execute(sql`
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

                await dbInst.execute(sql`
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
                await dbInst.execute(sql`
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
                await dbInst.execute(sql`
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
            // changes() is SQLite specific. For MySQL we can assume success if no error thrown.
            return { changes: 1 };
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
            const cleanTargetId = targetId.includes(':') ? targetId.split(':').pop()! : targetId;
            const prefixedId = `${accountId}:${cleanTargetId}`;
            
            const [rows]: any = await dbInst.execute(sql`
                SELECT id, reaction
                FROM messages
                WHERE account_id = ${accountId}
                  AND (
                    id = ${prefixedId}
                    OR id = ${cleanTargetId}
                    OR id LIKE ${`%:${cleanTargetId}`}
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

                await dbInst.execute(sql`
                    UPDATE messages
                    SET reaction = ${JSON.stringify(reactions)},
                        edited_at = ${new Date()}
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
            const [rows]: any = await dbInst.execute(sql`
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
                    await dbInst.execute(sql`
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

    sock.ev.on('presence.update', (update: any) => {
        try {
            const chatJidRaw = String(update?.id || '').trim();
            if (!chatJidRaw) return;

            const isGroupChat = chatJidRaw.endsWith('@g.us');
            const canonicalChatNumber = getCanonicalContactNumber(accountId, chatJidRaw) || normalizeDigits(chatJidRaw);
            const normalizedChatJid = isGroupChat
                ? chatJidRaw
                : (canonicalChatNumber ? `${canonicalChatNumber}@s.whatsapp.net` : chatJidRaw);

            const selfJids = [String(status?.user?.id || '').trim(), String(sock.user?.id || '').trim()].filter(Boolean);
            const selfUsers = new Set(
                selfJids
                    .map((jid) => String(jidDecode(jid)?.user || jid.split('@')[0].split(':')[0] || '').trim().toLowerCase())
                    .filter(Boolean)
            );

            const presences = update?.presences || {};
            const entries = Object.entries(presences);
            if (entries.length === 0) return;

            const emitter = getMessageEmitter();
            for (const [participantKey, presenceInfo] of entries) {
                const participantJid = String(participantKey || '').trim() || chatJidRaw;
                const participantUser = String(jidDecode(participantJid)?.user || participantJid.split('@')[0].split(':')[0] || '').trim().toLowerCase();
                if (participantUser && selfUsers.has(participantUser)) continue;

                const presenceRaw = String((presenceInfo as any)?.lastKnownPresence || (presenceInfo as any)?.presence || '').trim().toLowerCase();
                if (!presenceRaw) continue;
                if (presenceRaw !== 'composing' && presenceRaw !== 'recording' && presenceRaw !== 'paused') continue;

                emitter.emit('typing', {
                    accountId,
                    chatJid: normalizedChatJid,
                    participantJid: isGroupChat ? participantJid : null,
                    participantName: isGroupChat ? (getContactName(accountId, participantJid) || null) : null,
                    presence: presenceRaw,
                    timestamp: Date.now()
                });
            }
        } catch (presenceErr: any) {
            console.error(`[${accountId}] Presence update parse error:`, presenceErr?.message || presenceErr);
        }
    });

    async function markConversationReadInDbFromRemoteJid(remoteJid: string) {
        const normalizedRemoteJid = String(remoteJid || '').trim();
        if (!normalizedRemoteJid) return;

        try {
            const { db: dbInst } = await import('./server/db');
            const { sql } = await import('drizzle-orm');

            if (normalizedRemoteJid.endsWith('@g.us')) {
                await dbInst.execute(sql`
                    UPDATE messages
                    SET status = CASE WHEN status IN ('received', 'delivered') THEN 'read' ELSE status END,
                        is_read = 1
                    WHERE account_id = ${accountId}
                      AND contact_jid = ${normalizedRemoteJid}
                      AND from_me = 0
                      AND is_read = 0
                `);
                return;
            }

            const remoteNumber = getCanonicalContactNumber(accountId, normalizedRemoteJid) || normalizeDigits(normalizedRemoteJid);
            if (!remoteNumber) return;

            const [rows]: any = await dbInst.execute(sql`
                SELECT DISTINCT contact_jid
                FROM messages
                WHERE account_id = ${accountId}
                  AND from_me = 0
                  AND is_read = 0
            `);

            const targetJids = Array.from(new Set(
                (rows as any[])
                    .map((r) => String(r.contact_jid || '').trim())
                    .filter(Boolean)
                    .filter((jid) => {
                        const jidNumber = getCanonicalContactNumber(accountId, jid) || normalizeDigits(jid);
                        return Boolean(jidNumber) && jidNumber === remoteNumber;
                    })
            ));

            for (const jid of targetJids) {
                await dbInst.execute(sql`
                    UPDATE messages
                    SET status = CASE WHEN status IN ('received', 'delivered') THEN 'read' ELSE status END,
                        is_read = 1
                    WHERE account_id = ${accountId}
                      AND contact_jid = ${jid}
                      AND from_me = 0
                      AND is_read = 0
                `);
            }
        } catch (e: any) {
            console.error(`[${accountId}] Sync incoming read->DB error:`, e?.message || e);
        }
    }


    async function processAndStoreMessage(msg: any, isHistory = false, forceUnread = false) {
        const jidForSave = msg.key.remoteJid;
        if (!jidForSave) return;

        const fromMe = Boolean(msg.key.fromMe);
        const pushName = String(msg.pushName || '').trim();

        // Auto-update contact store if we get a pushName for a LID or unknown JID
        if (pushName && !fromMe && store) {
            const existing = store.contacts.get(jidForSave);
            if (!existing || (!existing.name && !existing.pushName)) {
                sock.ev.emit('contacts.upsert', [{ id: jidForSave, name: pushName, pushName }]);
            }
        }

        if (!msg.message && !msg.stubType) return;

        try {
            const upsertName = (targetJid?: string | null) => {
                if (!targetJid) return;
                if (msg.key.fromMe) return; // Prevent overwriting target's name with our own pushName!
                const existing = store!.contacts.get(targetJid) || { id: targetJid };
                const incomingName = String(msg.pushName || '').trim();
                if (!incomingName) return;

                // Check if we have a real name (not just a JID or empty)
                const currentName = String(existing.name || '').trim();
                const isPlaceholder = !currentName || currentName === targetJid.split('@')[0];
                
                // ONLY update the pushName field to keep directory name ('name') pristine.
                if (!existing.pushName || existing.pushName !== incomingName) {
                    const next = {
                        ...existing,
                        id: targetJid,
                        pushName: incomingName
                    };
                    store!.contacts.set(targetJid, next);

                    // Sync pushName to LID variant if mapped
                    if (targetJid.endsWith('@s.whatsapp.net')) {
                        const lid = (store as any).jidToLid?.get(targetJid);
                        if (lid) {
                            const lidExisting = store!.contacts.get(lid) || { id: lid };
                            if (!lidExisting.pushName) {
                                store!.contacts.set(lid, { ...lidExisting, pushName: next.pushName });
                            }
                        }
                    }
                }
            };

            if (!msg.key.remoteJid?.endsWith('@g.us')) {
                upsertName(msg.key.remoteJid);
            }
            upsertName((msg.key as any)?.participant);
        } catch (e) {
            console.error(`[${accountId}] Contact name harvest error:`, e);
        }

        // Save messages (incoming + outgoing) to DB for chat history
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

        if (content) {
            try {
                const { db: dbInst } = await import('./server/db');
                const { messages: messagesTable } = await import('./server/db/schema');

                // Handle protocol events (edit/revoke) by updating existing message rows.
                const protocolMessage = (content as any)?.protocolMessage;

                // Also check if the message itself is an editedMessage at root level (some Baileys versions)
                const rootEditedMessage = (content as any)?.editedMessage || (msg.message as any)?.editedMessage;
                if (!protocolMessage && rootEditedMessage) {
                    const targetId = (msg.key as any)?.id as string | undefined;
                    const newBody = extractEditedBodyFromProtocol({ editedMessage: rootEditedMessage });
                    if (targetId && newBody) {
                        await markMessageAsEdited(targetId, newBody, isHistory ? 'history-sync' : 'messages.upsert-root', jidForSave || undefined);
                    }
                    return;
                }

                const revokedKeyId = protocolMessage?.key?.id as string | undefined;
                const protocolType = Number((protocolMessage as any)?.type);
                const editedBody = extractEditedBodyFromProtocol(protocolMessage);
                const isEditProtocol = hasEditedSignal(protocolMessage) || Boolean(editedBody);
                const isRevokeProtocol = protocolType === 0 && !isEditProtocol;

                if (revokedKeyId && isEditProtocol) {
                    await markMessageAsEdited(revokedKeyId, editedBody, isHistory ? 'history-sync' : 'messages.upsert', jidForSave || undefined);
                    return;
                } else if (revokedKeyId && isRevokeProtocol) {
                    await markMessageAsDeleted(revokedKeyId, isHistory ? 'history-sync' : 'messages.upsert', jidForSave || undefined);
                    return;
                } else if (protocolMessage) {
                    return;
                }

                const reactionMessage = (content as any)?.reactionMessage;
                if (reactionMessage?.key?.id) {
                    const rawActorJid = String((msg.key as any)?.participant || msg.key.remoteJid || '').trim();
                    const reactionActorJid = rawActorJid.includes('@g.us') 
                        ? rawActorJid 
                        : (rawActorJid.split('@')[0].split(':')[0] + '@s.whatsapp.net');
                    
                    const reactionTargetId = reactionMessage.key.id;
                    const reactionText = String(reactionMessage.text || '').trim() || null;
                    
                    await updateMessageReaction(
                        reactionTargetId,
                        reactionText,
                        reactionActorJid || null,
                        String(msg.pushName || '').trim() || null
                    );

                    if (!isHistory) {
                        const emitter = getMessageEmitter();
                        emitter.emit('upsert', { 
                            accountId, 
                            message: { 
                                ...msg, 
                                reactionUpdate: true, 
                                targetId: reactionTargetId 
                            } 
                        });
                    }

                    return;
                }

                const body = extractMessageText(content as any);
                const contextInfo = extractContextInfo(content as any);
                const quotedMsgId = String(contextInfo?.stanzaId || '').trim();
                const quotedMsgBody = extractMessageText(contextInfo?.quotedMessage || null);

                const mediaType = (content as any)?.imageMessage ? 'image' :
                    (content as any)?.videoMessage ? 'video' :
                    (content as any)?.audioMessage ? 'audio' :
                    (content as any)?.documentMessage ? 'document' : null;

                const isProtocolMessage = Boolean((content as any)?.protocolMessage);
                if (isProtocolMessage || (!body && !mediaType)) {
                    return;
                }

                const messageId = msg.key.id
                    ? `${accountId}:${msg.key.id}`
                    : `${accountId}:fallback:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

                const isGroupJid = jidForSave.endsWith('@g.us');
                const isNewsletter = jidForSave.endsWith('@newsletter');
                const isBroadcast = jidForSave.endsWith('@broadcast');

                if (isNewsletter || isBroadcast) {
                    return;
                }

                const participantJid = String((msg.key as any)?.participant || (msg as any)?.participant || '').trim();
                const myStore = stores.get(accountId);
                
                if (Boolean(msg.key.fromMe) && participantJid && participantJid.endsWith('@lid') && myStore) {
                    const myPrimaryJid = String(status?.user?.id || sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
                    const currentLid = (myStore as any).jidToLid?.get(myPrimaryJid);
                    if (!currentLid || currentLid !== participantJid) {
                        if (!(myStore as any).jidToLid) (myStore as any).jidToLid = new Map();
                        if (!(myStore as any).lidToJid) (myStore as any).lidToJid = new Map();
                        (myStore as any).jidToLid.set(myPrimaryJid, participantJid);
                        (myStore as any).lidToJid.set(participantJid, myPrimaryJid);
                        console.log(`[${accountId}] Self-LID harvested: ${participantJid}`);
                    }
                }

                const jidToLid = (myStore as any)?.jidToLid as Map<string, string> | undefined;
                const myPrimaryJid = String(status?.user?.id || sock.user?.id || '').split(':')[0] + '@s.whatsapp.net';
                const myStoredLid = jidToLid?.get(myPrimaryJid);

                const selfJids = [
                    String(status?.user?.id || '').trim(), 
                    String(sock.user?.id || '').trim(),
                    String((status?.user as any)?.lid || '').trim(),
                    myStoredLid,
                    accountId 
                ].filter(Boolean) as string[];
                
                const selfUsers = new Set(
                    selfJids
                        .map((jid) => String(jidDecode(jid)?.user || jid.split('@')[0].split(':')[0] || '').trim().toLowerCase())
                        .filter(Boolean)
                );
                const selfDigitsList = selfJids.map((jid) => normalizeDigits(jid)).filter(Boolean);
                
                const participantUser = String(jidDecode(participantJid)?.user || jidDecode(participantJid || '')?.user || participantJid.split('@')[0].split(':')[0] || '').trim().toLowerCase();
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
                    (participantDigits && selfDigitsList.some(d => {
                        if (d === participantDigits) return true;
                        if (d.length >= 10 && participantDigits.length >= 10) {
                            return d.slice(-10) === participantDigits.slice(-10);
                        }
                        return false;
                    }))
                );
                
                const senderNameLooksSelf = Boolean(
                    senderPushName && (
                        selfNameSet.has(senderPushName) ||
                        Array.from(selfNameSet).some(name => 
                            name.toLowerCase().includes(senderPushName.toLowerCase()) || 
                            senderPushName.toLowerCase().includes(name.toLowerCase())
                        )
                    )
                );
                
                const isFromMe = Boolean(msg.key.fromMe) || participantIsSelf || (isGroupJid && senderNameLooksSelf);

                const senderJid = !isFromMe && isGroupJid
                    ? participantJid || null
                    : null;
                const senderName = isFromMe 
                    ? 'Siz' 
                    : (isGroupJid ? String(msg.pushName || (senderJid ? getContactName(accountId, senderJid) : '') || '').trim() || null : null);
                    
                const fallbackDigits = jidForSave.split('@')[0].split(':')[0].replace(/\D/g, '');
                let canonicalDirectNumber = getCanonicalContactNumber(accountId, jidForSave) || '';

                const isLidJid = jidForSave.endsWith('@lid');
                const isSuspiciousLength = canonicalDirectNumber.length > 13;
                
                if (!isGroupJid && (!canonicalDirectNumber || isSuspiciousLength || isLidJid)) {
                    try {
                        const lookupResults = await sock.onWhatsApp(jidForSave);
                        if (lookupResults && lookupResults.length > 0 && lookupResults[0].exists) {
                            const resolvedJid = lookupResults[0].jid;
                            const resolvedNumber = normalizeDigits(resolvedJid);
                            if (resolvedNumber && resolvedNumber.length <= 15) {
                                canonicalDirectNumber = resolvedNumber;
                                const lidKey = getLidKey(jidForSave);
                                if (lidKey) {
                                    const storeRef = stores.get(accountId);
                                    if (storeRef) {
                                        (storeRef as any).lidToJid?.set(lidKey, resolvedJid);
                                        (storeRef as any).jidToLid?.set(resolvedJid, lidKey);
                                    }
                                    updateLidMasterMap(lidKey, resolvedJid);
                                }
                            }
                        }
                    } catch (lidLookupErr: any) {}
                }

                if (!isGroupJid && !canonicalDirectNumber && !isLidJid && fallbackDigits.length <= 15) {
                    canonicalDirectNumber = fallbackDigits;
                }

                const selfNumber = String(status?.user?.id || sock.user?.id || '')
                    .split('@')[0]
                    .split(':')[0]
                    .replace(/\D/g, '');

                if (!isGroupJid && selfNumber && canonicalDirectNumber === selfNumber) {
                    return;
                }

                const normalizedJid = isGroupJid
                    ? jidForSave
                    : `${canonicalDirectNumber}@s.whatsapp.net`;

                if (!isGroupJid && !canonicalDirectNumber) {
                    return;
                }

                const msgStatus = normalizeMessageStatus(msg.status);
                let isRead = isFromMe;
                if (!isRead) {
                    if (msgStatus === 'read' || msgStatus === 'played') {
                        isRead = true;
                    } else if (isHistory) {
                        // For history, mark as read unless explicitly identified as one of the N unread messages
                        isRead = !forceUnread;
                    } else {
                        // Real-time messages are unread by default
                        isRead = false;
                    }
                }

                await dbInst.insert(messagesTable).ignore().values({
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
                    status: isFromMe ? (consumePendingStatus(accountId, msg.key.id || '') || 'sent') : (isRead ? 'read' : 'received'),
                    isRead: isRead
                });
                
                if (isHistory) {
                    const bucket = getHistoryProgressBucket(accountId);
                    bucket.count++;
                    if (bucket.count % 100 === 0) {
                        console.log(`[${accountId}] History sync progress: ${bucket.count} messages stored...`);
                    }
                }

                if (!isHistory) {
                    if (!isFromMe) {
                        const emitter = getMessageEmitter();
                        const pushName = msg.pushName || getContactName(accountId, normalizedJid);
                        
                        emitter.emit('new_message', {
                            accountId,
                            id: messageId,
                            jid: normalizedJid,
                            body: body || (mediaType ? `[${mediaType}]` : 'Yeni mesaj'),
                            pushName: pushName,
                            fromMe: isFromMe,
                            timestamp: safeTimestamp.getTime()
                        });
                    }

                    const sseData = {
                        type: 'messages',
                        accountId,
                        jid: normalizedJid,
                        fromMe: isFromMe
                    };
                    
                    const sseMsg = `event: ${sseData.type}\ndata: ${JSON.stringify(sseData)}\n\n`;
                    const emitter = getMessageEmitter();
                    emitter.emit('sse_raw', { accountId, message: sseMsg });

                    if (mediaType && msg.key.id) {
                        try {
                            const rawMsgId = msg.key.id;
                            const thumb =
                                (content as any)?.documentMessage?.jpegThumbnail ||
                                (content as any)?.imageMessage?.jpegThumbnail ||
                                (content as any)?.videoMessage?.jpegThumbnail ||
                                null;
                            if (thumb) {
                                const thumbsDir = path.join(MEDIA_PATH, accountId, 'thumbs');
                                if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });
                                const thumbPath = path.join(thumbsDir, `${rawMsgId}.jpg`);
                                if (!fs.existsSync(thumbPath)) {
                                    const thumbBuffer = Buffer.isBuffer(thumb) ? thumb : Buffer.from(thumb);
                                    fs.writeFileSync(thumbPath, thumbBuffer);
                                }
                            }
                        } catch (thumbErr: any) {}
                    }

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
                        } catch (mediaErr: any) {}
                    }
                }

            } catch (dbErr: any) {
                console.error(`[${accountId}] DB persistence error:`, dbErr.message);
            }
        }
    }

    // Messaging Upsert - Auto Reply Logic + Contact Harvesting + Message Persistence
    sock.ev.on('messages.upsert', async (m) => {
        const isNotify = m.type === 'notify';
        
        for (const msg of m.messages) {
            await processAndStoreMessage(msg, false);

            if (!isNotify) continue; // Auto-reply only for real-time notifications
            if (!msg.message || msg.key.fromMe) continue;
            
            const from = msg.key.remoteJid;
            if (!from || from.includes('@g.us')) continue; // Ignore groups

            try {
                const { db, remoteDb } = await import('./server/db');
                const { accounts: accountsTable, userSettings, autoReplyHistory } = await import('./server/db/schema');
                const { userCredits } = await import('./server/db/remote-schema');
                const { eq, sql, and } = await import('drizzle-orm');

                const accountRows = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
                const account = accountRows[0];
                if (!account || !account.autoReply || !account.autoReplyMessage) continue;

                const rawContactPart = from.split('@')[0];
                const canonicalContact = getCanonicalContactNumber(accountId, from) || rawContactPart;
                if (canonicalContact.length > 15) continue;
                
                const contactNumber = canonicalContact;

                const existingReply = await db.select()
                    .from(autoReplyHistory)
                    .where(and(
                        eq(autoReplyHistory.accountId, accountId),
                        eq(autoReplyHistory.contactNumber, contactNumber)
                    ));
                
                if (existingReply.length > 0) continue;

                const userCredsRes = await remoteDb.select().from(userCredits).where(eq(userCredits.userId, Number(account.userId))).limit(1);
                const userCreds = userCredsRes[0] as any;
                if (!userCreds || (userCreds.balance || 0) <= 0) continue;

                const settings = (await db.select().from(userSettings).where(eq(userSettings.userId, account.userId)))[0];
                if (settings && settings.readReceipt) {
                    await sock.readMessages([msg.key]);
                }

                await delay(2000);

                const updateRes = await remoteDb.update(userCredits)
                    .set({ balance: sql`${userCredits.balance} - 1` })
                    .where(and(eq(userCredits.userId, Number(account.userId)), sql`${userCredits.balance} > 0`));
                
                const affected = (updateRes as any)?.[0]?.affectedRows ?? (updateRes as any)?.affectedRows ?? 0;
                if (affected > 0) {
                    await simulateTypingPresence(sock, from, account.autoReplyMessage, 500, 1500);
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

export async function getAllAccounts(storedAccounts: any[]) {
    if (!storedAccounts || storedAccounts.length === 0) return [];
    
    const { db } = await import('./server/db');
    const { messages } = await import('./server/db/schema');
    const { eq, and, count, notLike, inArray } = await import('drizzle-orm');

    const accountIds = storedAccounts.map(a => a.id);
    
    // Fetch all unread counts in ONE query instead of per-account
    let unreadCountsMap = new Map<string, number>();
    try {
        const countsRes = await db.select({ 
            accountId: messages.accountId, 
            value: count() 
        })
        .from(messages)
        .where(and(
            inArray(messages.accountId, accountIds),
            eq(messages.fromMe, 0),
            eq(messages.isRead, 0),
            notLike(messages.contactJid, '%@newsletter'),
            notLike(messages.contactJid, '%@broadcast'),
            notLike(messages.contactJid, '120363%@s.whatsapp.net')
        ))
        .groupBy(messages.accountId);
        
        countsRes.forEach(r => {
            if (r.accountId) {
                unreadCountsMap.set(r.accountId, Number(r.value || 0));
            }
        });
    } catch (err) {
        console.error('[getAllAccounts] Bulk unread count error:', err);
        // Fallback or just ignore (unread counts will be 0)
    }

    return storedAccounts.map(acc => {
        const liveStatus = statuses.get(acc.id);
        const unreadCount = unreadCountsMap.get(acc.id) || 0;
            
        return {
            ...acc,
            status: liveStatus?.status || "disconnected",
            qr: liveStatus?.qr || null,
            qrRaw: liveStatus?.qrRaw || null,
            user: liveStatus?.user,
            lastError: liveStatus?.lastError || null,
            connectionIssue: liveStatus?.connectionIssue || null,
            unreadCount: unreadCount
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
    const { db, remoteDb } = await import('./server/db');
    const { accounts, logs, userSettings, messages } = await import('./server/db/schema');
    const { userCredits } = await import('./server/db/remote-schema');
    const { eq, sql, and, desc } = await import('drizzle-orm');

    const normalizeRejectText = (value: string) => String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ')
        .trim();

    const parseRejectKeywords = (input: unknown): string[] => {
        return Array.from(new Set(
            String(input || '')
                .split(/\r?\n|,/)
                .map((item) => normalizeRejectText(item))
                .filter((item) => item.length > 0)
        )).slice(0, 100);
    };

    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const hasRejectKeyword = (text: string, keywords: string[]): boolean => {
        const normalizedText = normalizeRejectText(text);
        if (!normalizedText) return false;

        for (const keyword of keywords) {
            if (!keyword) continue;

            if (keyword.includes(' ')) {
                if (normalizedText.includes(keyword)) return true;
                continue;
            }

            const matcher = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword)}([^a-z0-9]|$)`, 'i');
            if (matcher.test(normalizedText)) return true;
        }

        return false;
    };

    const accountRes = await db.select().from(accounts).where(eq(accounts.id, accountId));
    const account = accountRes[0];
    if (!account) throw new Error('Account not found');

    const result = await remoteDb.update(userCredits)
        .set({ balance: sql`${userCredits.balance} - 1` })
        .where(and(eq(userCredits.userId, Number(account.userId)), sql`${userCredits.balance} > 0`));

    const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
    if (affected === 0) throw new Error('Yetersiz kredi.');

    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        await remoteDb.update(userCredits).set({ balance: sql`${userCredits.balance} + 1` }).where(eq(userCredits.userId, Number(account.userId)));
        throw new Error(`Account ${accountId} is not ready`);
    }

    const shouldPersistLog = true; // Always persist logs for debugging

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
                    // Number explicitly reported as NOT on WhatsApp by server - refund credit and stop
                    console.log(`[${accountId}] ❌ Number reported NOT on WhatsApp: ${cleanNumber}`);
                    await remoteDb.update(userCredits).set({ balance: sql`${userCredits.balance} + 1` }).where(eq(userCredits.userId, Number(account.userId)));
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
                    return { success: false, error: 'Bu numara WhatsApp kullanmıyor.' };
                }
            } else {
                // Empty result - Baileys might not have found it yet or it's a new number.
                // We'll proceed with delivery attempt using the formatted JID.
                console.log(`[${accountId}] ⚠️ No onWhatsApp result for: ${cleanNumber}. Attempting delivery anyway.`);
            }
        } catch (verifyErr: any) {
            // On technical errors (timeout, connection issue), log warning but attempt to send anyway
            console.warn(`[${accountId}] ⚠️ WhatsApp verification failed for ${to} (technical error), attempting delivery anyway:`, verifyErr.message || verifyErr);
            // Keep the default jid and attempt to send - don't block valid numbers due to API hiccups
        }
    }

    if (!isGroupTarget) {
        const settingsRes = await db.select().from(userSettings).where(eq(userSettings.userId, account.userId));
        const settings = settingsRes[0];
        const shouldCheckReject = Boolean(settings?.rejectMessageCheckEnabled);

        if (shouldCheckReject) {
            const fallbackKeywords = ['mesaj red', 'red', 'mesaj ret', 'ret', 'mesaj almak istemiyorum'];
            const configuredKeywords = parseRejectKeywords(settings?.rejectKeywords);
            const keywords = configuredKeywords.length > 0 ? configuredKeywords : fallbackKeywords;

            const normalizedDirectJid = `${jid.split('@')[0].replace(/\D/g, '')}@s.whatsapp.net`;
            const incomingRows = await db.select({ body: messages.body })
                .from(messages)
                .where(and(
                    eq(messages.accountId, accountId),
                    eq(messages.contactJid, normalizedDirectJid),
                    eq(messages.fromMe, false)
                ))
                .orderBy(desc(messages.timestamp))
                .limit(5);

            const matched = incomingRows.find((row) => hasRejectKeyword(String(row.body || ''), keywords));
            if (matched) {
                await remoteDb.update(userCredits).set({ balance: sql`${userCredits.balance} + 1` }).where(eq(userCredits.userId, Number(account.userId)));
                if (shouldPersistLog) {
                    await db.insert(logs).values({
                        id: Math.random().toString(36).substr(2, 9),
                        batchId,
                        accountId,
                        timestamp: new Date(),
                        recipient: to,
                        status: 'error',
                        message: message.substring(0, 100),
                        error: 'Mesaj red ifadesi tespit edildi. Gönderim atlandı.'
                    });
                }

                return {
                    success: false,
                    skipped: true,
                    error: 'Mesaj red ifadesi tespit edildi. Gönderim atlandı.'
                };
            }
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

        if (!batchId && !isGroupTarget) {
            await simulateTypingPresence(client, jid, message);
        }

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

        // Save to messages table for chat history (Safe-wrapped so DB failure doesn't mask physical success)
        if (sentMsg?.key?.id) {
            try {
                const { messages: messagesTable } = await import('./server/db/schema');
                const mediaType = media ? (
                    media.mimetype.startsWith('image/') ? 'image' :
                    media.mimetype.startsWith('video/') ? 'video' :
                    media.mimetype.startsWith('audio/') ? 'audio' : 'document'
                ) : null;
                
                const persistedRemoteJid = String(sentMsg?.key?.remoteJid || jid || '').trim();
                const normalizedJid = persistedRemoteJid.endsWith('@g.us')
                    ? persistedRemoteJid
                    : `${(getCanonicalContactNumber(accountId, persistedRemoteJid) || normalizeDigits(persistedRemoteJid))}@s.whatsapp.net`;
                
                await db.insert(messagesTable).ignore().values({
                    id: `${accountId}:${sentMsg.key.id}`,
                    accountId,
                    contactJid: normalizedJid,
                    senderJid: null,
                    fromMe: true,
                    body: message || '', // Ensure not null for MySQL
                    mediaType,
                    quotedMsgId: rawQuotedId ? `${accountId}:${rawQuotedId}` : null,
                    quotedMsgBody: quotedBody || null,
                    timestamp: new Date(),
                    status: consumePendingStatus(accountId, sentMsg.key.id) || 'sent',
                    isRead: true
                });
            } catch (dbErr) {
                console.error(`[${accountId}] History insert error (ignoring):`, dbErr);
            }
        }

        // Fetch final balance to return to UI
        const finalBalanceRes = await remoteDb.select({ balance: userCredits.balance })
            .from(userCredits)
            .where(eq(userCredits.userId, Number(account.userId)))
            .limit(1);
        const remainingCredits = finalBalanceRes[0]?.balance ?? 0;

        return { success: true, messageId: sentMsg.key.id, remainingCredits };
    } catch (e: any) {
        await remoteDb.update(userCredits).set({ balance: sql`${userCredits.balance} + 1` }).where(eq(userCredits.userId, Number(account.userId)));
        console.error(`[${accountId}] WhatsApp send error to ${to}:`, e);
        if (shouldPersistLog) {
            await db.insert(logs).ignore().values({
                id: Math.random().toString(36).substr(2, 9),
                batchId,
                accountId,
                timestamp: new Date(),
                recipient: to,
                status: "error",
                message: message ? message.substring(0, 100) : "",
                error: e.message || 'Unknown error'
            });
        }
        return { success: false, error: e.message || 'WhatsApp gönderim hatası' };
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
    
    let store = stores.get(accountId);
    
    // Retry mechanism: If store is missing (cold start), wait up to 2s for it to initialize
    if (!store) {
        console.log(`[${accountId}] getWhatsAppContacts: Store not found in memory. Retrying...`);
        const accountStatus = getAccountStatus(accountId);
        if (accountStatus.status === 'ready' || accountStatus.status === 'loading' || accountStatus.status === 'connecting') {
            let retryCount = 0;
            while (!store && retryCount < 4) {
                await delay(500); // Wait 500ms instead of 1000ms
                store = stores.get(accountId);
                retryCount++;
            }
        }
    }

    if (!store) {
        console.log(`[${accountId}] getWhatsAppContacts: Store still not found.`);
        return [];
    }
    
    // Merge contacts and chats for richer labels, including lid<->phone mapping.
    const combined = new Map<string, any>((store?.contacts && typeof (store.contacts as any).get === 'function') ? (store.contacts as Map<string, any>) : new Map());
    if (store?.chats && typeof (store.chats as any).forEach === 'function') {
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
    }

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

export async function resyncWhatsAppAccount(accountId: string, syncHistory: boolean = false) {
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

    // Restart connection to force history synchronization pass if requested
    await stopWhatsApp(accountId);
    await delay(1000);
    await initializeWhatsApp(accountId, syncHistory);

    return { success: true, refreshedGroupCount };
}

export async function stopWhatsApp(accountId: string) {
    manualStops.add(accountId);
    const reconnectTimer = reconnectTimers.get(accountId);
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimers.delete(accountId);
    }

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
    let client = clients.get(accountId);
    
    // If client is not active in memory, but we have session files, 
    // try to briefly connect just to logout (send revocation signal)
    if (!client) {
        const sessionPath = path.join(AUTH_PATH, `session-${accountId}`);
        const sessionExists = fs.existsSync(sessionPath) && fs.readdirSync(sessionPath).length > 0;
        
        if (sessionExists) {
            try {
                console.log(`[${accountId}] Account is offline but session files exist. Starting temporary connection for logout...`);
                await initializeWhatsApp(accountId);
                
                // Reduced wait for temporary connection (2 seconds total)
                for (let i = 0; i < 4; i++) {
                    await delay(500);
                    client = clients.get(accountId);
                    const s = statuses.get(accountId);
                    if (s?.status === 'ready') {
                        console.log(`[${accountId}] Temporary connection reached READY state.`);
                        break;
                    }
                    if (s?.status === 'disconnected' && s.lastError?.includes('loggedOut')) {
                        console.log(`[${accountId}] Account is already logged out according to servers.`);
                        break;
                    }
                }
            } catch (e) {
                console.warn(`[${accountId}] Failed to initialize temporary connection for logout:`, e);
            }
        } else {
            console.log(`[${accountId}] No session files found. No remote logout required.`);
        }
    }

    if (client) {
        try {
            const currentStatus = statuses.get(accountId)?.status;
            console.log(`[${accountId}] Starting logout process. Current status: ${currentStatus}`);
            
            // If it's not ready yet but we just started it, wait a bit more for the socket to be stable
            if (currentStatus !== 'ready' && currentStatus !== 'connecting') {
                console.log(`[${accountId}] Waiting for socket to reach a logout-capable state...`);
                for (let i = 0; i < 2; i++) {
                    await delay(1000);
                    const s = statuses.get(accountId)?.status;
                    if (s === 'ready' || s === 'connecting') break;
                }
            }

            console.log(`[${accountId}] Sending logout signal to WhatsApp...`);
            // Increased timeout and added more wait
            await Promise.race([
                client.logout(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timed out')), 5000))
            ]);
            console.log(`[${accountId}] Logout command accepted by WhatsApp servers.`);
            await delay(1000); // Wait for the 'close' event to propagate
        } catch (e: any) {
            console.warn(`[${accountId}] Logout operation failed or was ignored:`, e?.message || e);
            // If logout fails, we still proceed to stop and delete, but the phone link might persist
        }
    }
    
    console.log(`[${accountId}] Stopping WhatsApp instance and clearing status.`);
    await stopWhatsApp(accountId);
    statuses.delete(accountId);
    
    // Release lock before starting deletions
    releaseSessionLock(accountId);
    await delay(100);

    // Run deletions in parallel to maximize speed
    await Promise.all([
        // 1. Database Purge
        (async () => {
            try {
                const { db } = await import('./server/db');
                const { messages, logs, autoReplyHistory, conversationPreferences } = await import('./server/db/schema');
                const { eq } = await import('drizzle-orm');
                console.log(`[${accountId}] Purging database records...`);
                await db.delete(messages).where(eq(messages.accountId, accountId));
                await db.delete(logs).where(eq(logs.accountId, accountId));
                await db.delete(autoReplyHistory).where(eq(autoReplyHistory.accountId, accountId));
                await db.delete(conversationPreferences).where(eq(conversationPreferences.accountId, accountId));
            } catch (e: any) { console.error(`[${accountId}] DB purge error:`, e.message); }
        })(),

        // 2. File Cleanup (Media + Sessions + Store)
        (async () => {
            try {
                const sessionPath = path.resolve(AUTH_PATH, `session-${accountId}`);
                if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
                
                const mediaPath = path.resolve(MEDIA_PATH, accountId);
                if (fs.existsSync(mediaPath)) fs.rmSync(mediaPath, { recursive: true, force: true });
                
                const storePath = getStorePath(accountId);
                if (fs.existsSync(storePath)) fs.unlinkSync(storePath);

                const lockPath = getSessionLockPath(accountId);
                if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
            } catch (e: any) { console.error(`[${accountId}] File cleanup error:`, e.message); }
        })()
    ]);

    // Clean up memory maps
    pendingMessageStatuses.delete(accountId);
    reconnectTimers.delete(accountId);
}

export async function getLogs(userId?: number) {
    try {
        const { db } = await import('./server/db');
        const { logs, accounts } = await import('./server/db/schema');
        const { desc, eq, inArray } = await import('drizzle-orm');

        if (userId !== undefined && userId !== null && !isNaN(userId)) {
            // First, get all account IDs belonging to this user
            const userAccounts = await db.select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.userId, String(userId)));
            
            const accountIds = userAccounts.map(a => a.id);
            
            if (accountIds.length === 0) {
                return [];
            }

            // Then fetch logs for those accounts
            return await db.select({
                id: logs.id,
                batchId: logs.batchId,
                accountId: logs.accountId,
                accountName: accounts.name,
                recipient: logs.recipient,
                status: logs.status,
                message: logs.message,
                error: logs.error,
                timestamp: logs.timestamp
            })
            .from(logs)
            .leftJoin(accounts, eq(logs.accountId, accounts.id))
            .where(inArray(logs.accountId, accountIds))
            .orderBy(desc(logs.timestamp))
            .limit(1000);
        } else {
            // If no userId, return all (superadmin view)
            return await db.select({
                id: logs.id,
                batchId: logs.batchId,
                accountId: logs.accountId,
                accountName: accounts.name,
                recipient: logs.recipient,
                status: logs.status,
                message: logs.message,
                error: logs.error,
                timestamp: logs.timestamp
            })
            .from(logs)
            .leftJoin(accounts, eq(logs.accountId, accounts.id))
            .orderBy(desc(logs.timestamp))
            .limit(1000);
        }
    } catch (e) {
        console.error('getLogs error:', e);
        return [];
    }
}

export function getContactName(accountId: string, jidOrNumber: string): string {
    const store = stores.get(accountId);
    if (!store) return '';

    const raw = String(jidOrNumber || '').trim().toLowerCase();
    if (!raw) return '';

    const domain = raw.includes('@') ? raw.split('@')[1] : '';
    const digits = normalizeDigits(raw);

    const isGroup = raw.endsWith('@g.us');

    // Helper to extract directory name from a contact object
    const getDirectoryName = (c: any) => {
        if (!c) return '';
        const synced = (c.name || '').trim();
        const jidUser = raw.split('@')[0];
        // Only return if it's a real name, not a placeholder/JID variant
        return (synced && synced !== jidUser) ? synced : '';
    };

    // 1. Group logic: Always return subject/name from store
    if (isGroup) {
        const chat = (store as any).chats?.get(raw);
        const groupName = chat?.subject || chat?.name || store.contacts.get(raw)?.subject || store.contacts.get(raw)?.name;
        if (groupName) return groupName;

        // Fallback for groups: check other accounts' stores
        for (const s of stores.values()) {
            const otherChat = (s as any).chats?.get(raw);
            if (otherChat?.name || otherChat?.subject) return otherChat.subject || otherChat.name;
        }
        return raw.split('@')[0]; // Final fallback for group
    }

    // 2. Individual chat logic: Directory -> Verified -> Push -> Number
    const currentStore = stores.get(accountId);
    if (!currentStore) return digits || raw.split('@')[0];

    // Collect all internal account names to blacklist them from contact results
    const accountNames = new Set(Array.from(statuses.values()).map(s => String(s.name || '').trim().toLowerCase()).filter(Boolean));
    const selfJids = new Set(Array.from(statuses.values()).map(s => String((s.user as any)?.id || '').split(':')[0].split('@')[0]).filter(Boolean));

    const isBlacklisted = (candidate: string) => {
        if (!candidate) return true;
        const lower = candidate.toLowerCase();
        // If the name is just the JID part, ignore it as a name
        if (lower === raw.split('@')[0]) return true;
        return false;
    };

    const getBestName = (s: any, jid: string) => {
        const c = s.contacts.get(jid);
        if (!c) return '';
        
        const name = String(c.name || '').trim();
        if (name && !isBlacklisted(name)) return name;

        const verified = String(c.verifiedName || '').trim();
        if (verified && !isBlacklisted(verified)) return verified;

        const push = String(c.notify || c.pushName || '').trim();
        if (push && !isBlacklisted(push)) return push;

        return '';
    };

    // 2a. Check current store
    let name = getBestName(currentStore, raw);
    if (name) return name;

    // Check variants in current store
    if (domain === 'lid') {
        const phoneJid = (currentStore as any).lidToJid?.get(raw);
        if (phoneJid) {
            name = getBestName(currentStore, phoneJid);
            if (name) return name;
        }
    }
    if (domain === 's.whatsapp.net') {
        const lidJid = (currentStore as any).jidToLid?.get(raw);
        if (lidJid) {
            name = getBestName(currentStore, lidJid);
            if (name) return name;
        }
    }

    // 2b. Check other stores (SKIP 'self' identities based on JID match)
    for (const [otherId, otherStore] of stores.entries()) {
        if (otherId === accountId) continue;
        
        const otherSelfJid = String((statuses.get(otherId)?.user as any)?.id || '').split(':')[0].split('@')[0];
        const rawUser = raw.split('@')[0].split(':')[0];
        if (otherSelfJid && rawUser === otherSelfJid) continue; 

        name = getBestName(otherStore, raw);
        if (name) return name;

        if (digits) {
            const jidInOther = otherStore.numberToJid.get(digits);
            if (jidInOther && jidInOther !== raw) {
                name = getBestName(otherStore, jidInOther);
                if (name) return name;
            }
        }
    }

    // FINAL FALLBACK: Return digits/number
    return digits || raw.split('@')[0];
}

export function getWhatsAppClient(accountId: string) {
    return clients.get(accountId);
}

export async function subscribeToPresence(accountId: string, chatJid: string) {
    const client = clients.get(accountId) as any;
    const status = statuses.get(accountId);
    const targetJid = String(chatJid || '').trim();
    if (!client || status?.status !== 'ready' || !targetJid) return false;

    try {
        await client.presenceSubscribe(targetJid);
        return true;
    } catch (err: any) {
        console.warn(`[${accountId}] presenceSubscribe failed for ${targetJid}:`, err?.message || err);
        return false;
    }
}

export async function markConversationAsReadOnWhatsApp(accountId: string, targetJids: string[]) {
    const client = clients.get(accountId) as any;
    const status = statuses.get(accountId);
    if (!client || status?.status !== 'ready') return;

    const normalizedTargetJids = Array.from(new Set(
        (targetJids || [])
            .map((jid) => String(jid || '').trim())
            .filter(Boolean)
    ));
    if (normalizedTargetJids.length === 0) return;

    try {
        const { db: dbInst } = await import('./server/db');
        const { sql } = await import('drizzle-orm');

        const readKeys: any[] = [];
        for (const jid of normalizedTargetJids) {
            // First, update local DB
            await dbInst.execute(sql`
                UPDATE messages
                SET status = CASE WHEN status IN ('received', 'delivered') THEN 'read' ELSE status END,
                    is_read = 1
                WHERE account_id = ${accountId}
                  AND contact_jid = ${jid}
                  AND from_me = 0
                  AND is_read = 0
            `);

            // Then, gather keys for WhatsApp read receipt
            const [rows]: any = await dbInst.execute(sql`
                SELECT id, contact_jid, sender_jid
                FROM messages
                WHERE account_id = ${accountId}
                  AND contact_jid = ${jid}
                  AND from_me = 0
                ORDER BY timestamp DESC
                LIMIT 100
            `);

            for (const row of rows as any[]) {
                const rawId = String(row?.id || '').split(':').slice(1).join(':') || String(row?.id || '');
                if (!rawId) continue;

                const remoteJid = String(row?.contact_jid || '').trim();
                if (!remoteJid) continue;

                const participant = String(row?.sender_jid || '').trim();
                readKeys.push({
                    remoteJid,
                    id: rawId,
                    fromMe: false,
                    ...(remoteJid.endsWith('@g.us') && participant ? { participant } : {})
                });
            }
        }

        if (readKeys.length > 0) {
            await client.readMessages(readKeys);
        }
    } catch (e: any) {
        console.error(`[${accountId}] Sync DB read->WA error:`, e?.message || e);
    }
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
        (store?.contacts && typeof (store.contacts as any).get === 'function') ? store.contacts.get(normalizedJid)?.imgUrl : null,
        (store?.chats && typeof (store.chats as any).get === 'function') ? store.chats.get(normalizedJid)?.imgUrl : null
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

export function getCanonicalContactNumber(accountId: string, input: string): string {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';

    // Handle group JIDs - they are their own canonical ID
    if (raw.endsWith('@g.us')) return raw;

    const [partUser, domain] = raw.split('@');
    const userDigits = normalizeDigits(partUser);
    const store = stores.get(accountId);

    if (!store) return userDigits;

    const lidToJid = (store as any).lidToJid as Map<string, string> | undefined;
    const jidToLid = (store as any).jidToLid as Map<string, string> | undefined;

    // === Strategy 1: Direct LID mapping (input is "...@lid") ===
    if (domain === 'lid') {
        const lidKey = getLidKey(raw);
        const phoneJid = lidToJid?.get(raw) || lidToJid?.get(lidKey) || (lidKey ? lidMasterMap.get(lidKey) : null);
        if (phoneJid) {
            return normalizeDigits(phoneJid);
        }

        // === Strategy 1b: Cross-account LID lookup ===
        for (const [otherAccountId, otherStore] of stores.entries()) {
            const otherLidToJid = (otherStore as any).lidToJid as Map<string, string> | undefined;
            if (otherLidToJid) {
                const otherPhoneJid = otherLidToJid.get(raw) || otherLidToJid.get(lidKey);
                if (otherPhoneJid) {
                    const resolved = normalizeDigits(otherPhoneJid);
                    console.log(`[JID RESOLVE] ${raw} -> ${resolved} (LID cross-account from ${otherAccountId})`);
                    if (lidToJid) lidToJid.set(raw, otherPhoneJid);
                    return resolved;
                }
            }
        }

        // LID digits are NOT real phone numbers — they are internal WhatsApp identifiers.
        // If we couldn't resolve the LID via mapping, return empty string to force 
        // external resolution (like onWhatsApp) instead of creating a ghost conversation 
        // using raw LID digits as a fake phone number.
        // LID resolution failures are common during history sync and shouldn't clutter the console.
        // console.warn(`[JID RESOLVE] LID ${raw} could not be resolved from known mappings. Returning empty.`);
        return '';
    }

    // === Strategy 2: Known phone JID (already in jidToLid map) ===
    if (jidToLid?.has(raw)) {
        // Input IS the canonical phone JID
        return userDigits;
    }

    // === Strategy 3: Contact store chaining ===
    // The input JID (e.g. 122553083379885@s.whatsapp.net) might be an internal 
    // WhatsApp identifier. Look up its contact entry for a "lid" field,
    // then chain through lidToJid to find the real phone number.
    const contact = store.contacts.get(raw);
    if (contact) {
        const contactLid = String(contact.lid || '').trim().toLowerCase();
        if (contactLid && lidToJid) {
            const phoneJid = lidToJid.get(contactLid);
            if (phoneJid) {
                const resolved = normalizeDigits(phoneJid);
                console.log(`[JID RESOLVE] ${raw} -> ${resolved} (contact->lid->phone chain)`);
                return resolved;
            }
        }
        // Check if the contact has a "number" or "phone" field
        const contactNumber = String(contact.number || contact.phone || '').replace(/\D/g, '');
        if (contactNumber && contactNumber !== userDigits) {
            console.log(`[JID RESOLVE] ${raw} -> ${contactNumber} (contact number field)`);
            return contactNumber;
        }
    }

    // === Strategy 4: Try userDigits@lid in map ===
    const fallbackPhoneJid = lidToJid?.get(`${userDigits}@lid`);
    if (fallbackPhoneJid) {
        const resolved = normalizeDigits(fallbackPhoneJid);
        console.log(`[JID RESOLVE] ${raw} -> ${resolved} (digits@lid fallback)`);
        return resolved;
    }

    // Safety: If userDigits is longer than the E.164 maximum (15 digits), 
    // it cannot be a real phone number.
    if (userDigits.length > 15) {
        // console.warn(`[JID RESOLVE] ${raw} has ${userDigits.length}-digit number — exceeding E.164 limit. Returning empty.`);
        return '';
    }

    return userDigits;
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
            if (manualStops.has(account.id)) {
                console.log(`[${account.id}] Skipping auto-init because account was manually stopped.`);
                continue;
            }
            // CRITICAL: Auto-initialization (restarts) should NEVER sync history.
            // History sync is strictly reserved for the initial "Account Addition" phase.
            await initializeWhatsApp(account.id, false);
            await delay(2000); 
        }
    } catch (e) {}
}

if (!building) {
    // Check if we are in dev mode to avoid multiple initializations during HMR
    // SvelteKit re-imports this file often in dev mode
    if (!globalRef.baileysInitScheduled) {
        globalRef.baileysInitScheduled = true;
        setTimeout(() => {
            initAllAccounts().catch(e => console.error(e));
        }, 3000); // 3-second delay to let the server start properly
    }
}
