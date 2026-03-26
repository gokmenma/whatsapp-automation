import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';

const ACCOUNTS_FILE = './accounts.json';

function saveAccountList(accountId: string) {
    try {
        let accounts: string[] = [];
        if (fs.existsSync(ACCOUNTS_FILE)) {
            accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        }
        if (!accounts.includes(accountId)) {
            accounts.push(accountId);
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }
    } catch (e) {
        console.error('Account list save error:', e);
    }
}

function removeAccountFromList(accountId: string) {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            let accounts: string[] = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
            accounts = accounts.filter(id => id !== accountId);
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }
    } catch (e) {
        console.error('Account list remove error:', e);
    }
}

export function getStoredAccounts(): string[] {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('Account list load error:', e);
    }
    return [];
}

interface AccountStatus {
    id: string;
    status: "disconnected" | "connecting" | "ready" | "loading";
    qr: string | null;
    qrRaw?: string | null;
    user?: any;
}

interface LogEntry {
    id: string;
    batchId?: string; // Optional ID to group messages together
    accountId: string;
    timestamp: Date;
    recipient: string;
    status: "success" | "error";
    message: string;
    error?: string;
}

// Use globalThis to persist these across SvelteKit HMR reloads in development
const globalRef = globalThis as any;
if (!globalRef.whatsappClients) globalRef.whatsappClients = new Map<string, any>();
if (!globalRef.whatsappStatuses) globalRef.whatsappStatuses = new Map<string, AccountStatus>();

const clients: Map<string, any> = globalRef.whatsappClients;
const statuses: Map<string, AccountStatus> = globalRef.whatsappStatuses;

export async function initializeWhatsApp(accountId: string) {
    if (clients.has(accountId)) {
        console.log(`[${accountId}] Client already exists in Map.`);
        const currentStatus = statuses.get(accountId);
        // If it's already running or loading, don't restart unless requested
        if (currentStatus && (currentStatus.status === "ready" || currentStatus.status === "loading" || currentStatus.status === "connecting")) {
            console.log(`[${accountId}] Status is ${currentStatus.status}, skipping initialization.`);
            return;
        }
        
        // If it was disconnected but still in the map, destroy it first to be safe
        console.log(`[${accountId}] Status is disconnected but client exists. Destroying old instance...`);
        try {
            const oldClient = clients.get(accountId);
            await oldClient.destroy().catch(() => {});
        } catch (e) {}
        clients.delete(accountId);
    }

    const status: AccountStatus = {
        id: accountId,
        status: "loading",
        qr: null
    };
    statuses.set(accountId, status);
    saveAccountList(accountId);

    console.log(`Starting WhatsApp client for ${accountId}...`);

    const chromiumArgs = [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    ];

    const possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    let executablePath = undefined;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            executablePath = p;
            break;
        }
    }

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: accountId }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1032633165-alpha.html',
        },
        puppeteer: {
            headless: true,
            handleSIGTERM: false,
            args: [
                ...chromiumArgs,
                '--disable-extensions',
                '--disable-infobars',
                '--window-size=1280,720',
            ],
            executablePath: executablePath,
            waitForInitialPage: true,
            defaultViewport: null
        }
    });

    console.log(`[${accountId}] Instance created. Sessions check at .wwebjs_auth/session-${accountId}...`);
    if (fs.existsSync(path.join('.wwebjs_auth', `session-${accountId}`))) {
        console.log(`[${accountId}] PREVIOUS SESSION FOUND. Attempting automatic login...`);
    } else {
        console.log(`[${accountId}] No previous session found. Will require QR scan.`);
    }

    client.on('qr', async (qr: string) => {
        console.log(`[${accountId}] QR RECEIVED! Please scan to connect.`);
        status.qr = await qrcode.toDataURL(qr);
        status.qrRaw = qr;
        status.status = "connecting";
    });

    client.on('loading_screen', (percent: string, message: string) => {
        console.log(`[${accountId}] LOADING: ${percent}% - ${message}`);
        status.status = "loading";
    });

    client.on('ready', () => {
        console.log(`[${accountId}] SUCCESS: WHATSAPP READY!`);
        status.status = "ready";
        status.qr = null;
        status.qrRaw = null;
        status.user = client.info.wid;
    });

    client.on('authenticated', () => {
        console.log(`[${accountId}] AUTHENTICATION SUCCESSFUL!`);
        status.status = "loading"; // Move to loading until it reaches 'ready'
    });

    client.on('auth_failure', (msg: string) => {
        console.error(`[${accountId}] AUTH FAILURE:`, msg);
        status.status = "disconnected";
    });

    client.on('message', async (msg: any) => {
        if (msg.fromMe || msg.isStatus) return;
        try {
            const { db } = await import('./server/db');
            const { accounts, users, userSettings, autoReplyHistory } = await import('./server/db/schema');
            const { eq, sql, and } = await import('drizzle-orm');

            // 1. Get the account info directly (autoReply settings are now here)
            const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
            if (!account || !account.autoReply || !account.autoReplyMessage) return;

            const contactNumber = msg.from.split('@')[0];

            // 2. CHECK HISTORY (Only reply to first message)
            const alreadyReplied = await db.select()
                .from(autoReplyHistory)
                .where(and(
                    eq(autoReplyHistory.accountId, accountId),
                    eq(autoReplyHistory.contactNumber, contactNumber)
                ))
                .get();
            
            if (alreadyReplied) return;

            // 3. User & Credits Check
            const user = await db.select().from(users).where(eq(users.id, account.userId)).get();
            if (!user || user.credits <= 0) return;

            // 4. Send "Seen" if globally enabled
            const settings = await db.select().from(userSettings).where(eq(userSettings.userId, account.userId)).get();
            if (settings && settings.readReceipt) {
                try { await msg.sendSeen(); } catch (e) { }
            }

            // 5. Automatic Response with Natural Delay
            setTimeout(async () => {
                try {
                    // Atomic credit deduction
                    const res = await db.update(users)
                        .set({ credits: sql`${users.credits} - 1` })
                        .where(and(eq(users.id, account.userId), sql`${users.credits} > 0`))
                        .returning();
                    
                    if (res.length > 0) {
                        await client.sendMessage(msg.from, account.autoReplyMessage);
                        
                        // 6. RECORD HISTORY (To prevent multiple replies)
                        await db.insert(autoReplyHistory).values({
                            accountId: accountId,
                            contactNumber: contactNumber,
                            sentAt: new Date()
                        });
                        
                        console.log(`[${accountId}] Auto-replied to ${msg.from} (First time)`);
                    }
                } catch (e: any) {
                    // Refund on failure
                    try {
                        await db.update(users)
                            .set({ credits: sql`${users.credits} + 1` })
                            .where(eq(users.id, account.userId));
                    } catch (err) {}
                    console.error(`[${accountId}] Auto-reply failed:`, e.message);
                }
            }, 2000);

        } catch (e: any) {
            console.error(`[${accountId}] Error in auto-reply logic:`, e.message);
        }
    });

    client.on('disconnected', (reason: string) => {
        console.log(`[${accountId}] DISCONNECTED (Reason: ${reason})`);
        status.status = "disconnected";
        clients.delete(accountId);
    });

    clients.set(accountId, client);

    try {
        console.log(`[${accountId}] Calling client.initialize()...`);
        await client.initialize();
    } catch (e: any) {
        console.error(`[${accountId}] FAILED TO INITIALIZE:`, e.message || e);
        status.status = "disconnected";
        clients.delete(accountId);
        
        // Log to file for diagnostics
        try {
            fs.appendFileSync('whatsapp_error.log', `${new Date().toISOString()} [${accountId}] ERROR: ${e.message || JSON.stringify(e)}\n`);
        } catch (err) {}
    }
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
        console.error("Fetch logs error:", e);
        return [];
    }
}

export async function sendWhatsAppMessage(accountId: string, to: string, message: string, media?: { data: string, mimetype: string, filename: string }, batchId?: string) {
    const { db } = await import('./server/db');
    const { accounts, users, logs } = await import('./server/db/schema');
    const { eq, sql, and } = await import('drizzle-orm');

    // 1. Get the account and user info
    const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).get();
    if (!account) {
        throw new Error('Account not found');
    }

    // 2. Security Check & Credit Deduction
    // Attempt to decrement credit only if credits > 0 (atomic operation)
    const result = await db.update(users)
        .set({
            credits: sql`${users.credits} - 1`
        })
        .where(and(
            eq(users.id, account.userId),
            sql`${users.credits} > 0`
        ))
        .returning({ updatedCredits: users.credits });

    if (!result || result.length === 0) {
        throw new Error('Yetersiz kredi veya geçersiz kullanıcı. Lütfen kredinizi kontrol edin.');
    }

    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        // Refund credit if client was not ready? (Optional, but safer for user)
        await db.update(users)
            .set({ credits: sql`${users.credits} + 1` })
            .where(eq(users.id, account.userId));

        throw new Error(`Account ${accountId} is not ready`);
    }

    // 4. Basic Format Validation
    if (to.length < 7) {
        // Refund
        await db.update(users)
            .set({ credits: sql`${users.credits} + 1` })
            .where(eq(users.id, account.userId));
        return { success: false, error: 'Geçersiz telefon numarası formatı.' };
    }

    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    
    try {
        let response;
        if (media) {
            const messageMedia = new MessageMedia(media.mimetype, media.data, media.filename);
            response = await client.sendMessage(chatId, messageMedia, { caption: message });
        } else {
            response = await client.sendMessage(chatId, message);
        }

        const log = {
            id: Math.random().toString(36).substr(2, 9),
            batchId,
            accountId,
            timestamp: new Date(),
            recipient: to,
            status: "success" as const,
            message: message.substring(0, 100) // Support longer messages in DB
        };
        await db.insert(logs).values(log);

        return { success: true, messageId: response.id.id, remainingCredits: result[0].updatedCredits };
    } catch (e: any) {
        // Refund if it failed at the WhatsApp level
        await db.update(users)
            .set({ credits: sql`${users.credits} + 1` })
            .where(eq(users.id, account.userId));

        const log = {
            id: Math.random().toString(36).substr(2, 9),
            batchId,
            accountId,
            timestamp: new Date(),
            recipient: to,
            status: "error" as const,
            message: message.substring(0, 100),
            error: e.message || 'Unknown error'
        };
        await db.insert(logs).values(log);
        
        if (e.message.includes('detached Frame') || e.message.includes('Session closed')) {
            console.error(`[${accountId}] CRITICAL puppeteer error detected. Marking as disconnected.`);
            const status = statuses.get(accountId);
            if (status) status.status = "disconnected";
            // Optional: destroy client to force a fresh start on next attempt
            try { client.destroy().catch(() => {}); } catch(err) {}
            clients.delete(accountId);
        }

        return { success: false, error: e.message || 'WhatsApp gönderim hatası' };
    }
}

export async function getWhatsAppContacts(accountId: string) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        throw new Error(`Account ${accountId} is not ready`);
    }

    try {
        const contacts = await client.getContacts();
        
        // De-duplicate contacts by number to avoid showing internal IDs and phone numbers separately
        const uniqueContacts = new Map();
        
        for (const c of contacts) {
            // Only personal contacts, not groups (c.us is for individuals)
            if (c.isGroup || !c.id._serialized.endsWith('@c.us') || c.id._serialized === 'status@broadcast') continue;
            
            const number = c.number || c.id.user;
            if (!number || number.length < 5) continue; 
            
            // Prioritize address book name, then pushname, then number
            let name = c.name;
            if (!name || name === number) {
                name = c.pushname || name || number;
            }
            
            const existing = uniqueContacts.get(number);
            
            if (!existing || (c.name && !existing.isMyContact)) {
                uniqueContacts.set(number, {
                    id: c.id._serialized,
                    name: name,
                    number: number,
                    isMyContact: c.isMyContact
                });
            }
        }

        return Array.from(uniqueContacts.values())
            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    } catch (e: any) {
        console.error("Error fetching contacts:", e);
        throw e;
    }
}

export async function getWhatsAppConversations(accountId: string) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        throw new Error(`Account ${accountId} is not ready`);
    }

    try {
        const chats = await client.getChats();
        
        const filteredChats = chats.filter((c: any) => !c.isGroup && c.id._serialized.endsWith('@c.us'));
        
        // Fetch full contact info for each chat to get accurate names and isMyContact status
        const conversations = await Promise.all(filteredChats.map(async (chat: any) => {
            try {
                const contact = await chat.getContact();
                const number = chat.id.user;
                
                let name = contact.name || chat.name;
                if (!name || name === number) {
                    name = contact.pushname || name || number;
                }

                return {
                    id: chat.id._serialized,
                    name: name,
                    number: number,
                    isMyContact: contact.isMyContact
                };
            } catch (err) {
                // Fallback if contact fetch fails
                return {
                    id: chat.id._serialized,
                    name: chat.name || chat.id.user,
                    number: chat.id.user,
                    isMyContact: false
                };
            }
        }));

        return conversations.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    } catch (e: any) {
        console.error("Error fetching conversations:", e);
        throw e;
    }
}

export async function stopWhatsApp(accountId: string) {
    const client = clients.get(accountId);
    if (client) {
        try {
            console.log(`[${accountId}] Stopping client instance...`);
            await client.destroy();
            console.log(`[${accountId}] Client instance stopped.`);
        } catch (e) {
            console.error(`[${accountId}] Error while stopping client:`, e);
        }
        clients.delete(accountId);
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
    const status = statuses.get(accountId);

    if (client && status?.status === "ready") {
        try {
            console.log(`[${accountId}] Logging out before removal...`);
            await client.logout();
            console.log(`[${accountId}] Logout successful.`);
        } catch (e) {
            console.error(`[${accountId}] Logout error during removal:`, e);
        }
    }

    await stopWhatsApp(accountId);
    statuses.delete(accountId);
    removeAccountFromList(accountId);
    
    // Give it a tiny bit of time for OS to release file locks
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Also remove the session directory to allow a clean restart
    try {
        const sessionPath = path.resolve('.wwebjs_auth', `session-${accountId}`);
        if (fs.existsSync(sessionPath)) {
            console.log(`[${accountId}] DELETING ALL PERSISTENT DATA: ${sessionPath}`);
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[${accountId}] Persistent data successfully removed.`);
        }
    } catch (e) {
        console.error(`[${accountId}] Failed to delete session directory:`, e);
    }
}

// Automatically initialize stored accounts if not already done
let initialized = globalRef.whatsappInitialized || false;

export async function initAllAccounts() {
    if (initialized) {
        console.log("WhatsApp accounts already auto-initialized, skipping...");
        return;
    }
    
    initialized = true;
    globalRef.whatsappInitialized = true;
    
    try {
        const { db } = await import('./server/db');
        const { accounts } = await import('./server/db/schema');
        
        const storedAccounts = await db.select().from(accounts);
        
        console.log(`Loading ${storedAccounts.length} stored WhatsApp accounts from DATABASE...`);
        // Use sequential initialization to avoid memory pressure or lock issues
        for (const account of storedAccounts) {
            console.log(`[${account.id}] Starting AUTO-INIT...`);
            try {
                await initializeWhatsApp(account.id);
                // Give it some time before starting the next one to reduce CPU/RAM spike
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (err) {
                console.error(`Failed to auto-init account ${account.name} (${account.id}):`, err);
            }
        }
    } catch (e) {
        console.error('Error in initAllAccounts:', e);
    }
}

// Automatically start all connections when module loads
// Use a small delay to ensure other things are ready
setTimeout(() => {
    initAllAccounts().catch(e => console.error("Global initAllAccounts error:", e));
}, 1000);
