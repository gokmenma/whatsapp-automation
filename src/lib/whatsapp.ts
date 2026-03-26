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
    user?: any;
}

interface LogEntry {
    id: string;
    accountId: string;
    timestamp: Date;
    recipient: string;
    status: "success" | "error";
    message: string;
    error?: string;
}

// Store instances directly
const clients = new Map<string, any>();
const statuses = new Map<string, AccountStatus>();
const logs: LogEntry[] = [];

export async function initializeWhatsApp(accountId: string) {
    if (clients.has(accountId)) return;

    const status: AccountStatus = {
        id: accountId,
        status: "loading",
        qr: null
    };
    statuses.set(accountId, status);
    saveAccountList(accountId);

    console.log(`Starting WhatsApp client for ${accountId}...`);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: accountId }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
        puppeteer: {
            headless: true, // Switch to false to see the browser window and debug
            handleSIGTERM: false,
            args: [
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
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            ],
            executablePath: fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') 
                ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                : fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
                ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
                : undefined,
            // Additional options for stability
            waitForInitialPage: true,
            defaultViewport: null
        }
    });

    console.log(`[${accountId}] Client instance created. Initializing events...`);

    client.on('qr', async (qr: string) => {
        console.log(`[${accountId}] QR RECEIVED! Converting to Image...`);
        status.qr = await qrcode.toDataURL(qr);
        status.status = "connecting";
    });

    client.on('loading_screen', (percent: string, message: string) => {
        console.log(`[${accountId}] LOADING SCREEN: ${percent}% - ${message}`);
        status.status = "loading";
    });

    client.on('ready', () => {
        console.log(`[${accountId}] WHATSAPP READY!`);
        status.status = "ready";
        status.qr = null;
        status.user = client.info.wid;
    });

    client.on('authenticated', () => {
        console.log(`[${accountId}] AUTHENTICATED SUCCESS`);
    });

    client.on('auth_failure', (msg: string) => {
        console.error(`[${accountId}] AUTH FAILURE:`, msg);
        status.status = "disconnected";
    });

    client.on('disconnected', (reason: string) => {
        console.log(`[${accountId}] DISCONNECTED:`, reason);
        status.status = "disconnected";
        clients.delete(accountId);
    });

    clients.set(accountId, client);

    try {
        console.log(`[${accountId}] Starting client.initialize()...`);
        await client.initialize();
        console.log(`[${accountId}] client.initialize() call completed (bg process running)`);
    } catch (e: any) {
        console.error(`[${accountId}] FAILED TO INITIALIZE:`, e.message || e);
        status.status = "disconnected";
        clients.delete(accountId);
    }
}

export function getAccountStatus(accountId: string) {
    return statuses.get(accountId) || { id: accountId, status: "disconnected", qr: null };
}

export function getAllAccounts(storedAccounts: { id: string, name: string }[]) {
    const activeIds = Array.from(statuses.values()).map(a => a.id);
    
    return storedAccounts.map(acc => {
        const status = statuses.get(acc.id);
        if (status) {
            return { ...status, name: acc.name };
        }
        return { 
            id: acc.id, 
            name: acc.name, 
            status: "disconnected", 
            qr: null 
        };
    });
}

export function getLogs() {
    return [...logs].reverse().slice(0, 100);
}

export async function sendWhatsAppMessage(accountId: string, to: string, message: string, media?: { data: string, mimetype: string, filename: string }) {
    const client = clients.get(accountId);
    const status = statuses.get(accountId);

    if (!client || status?.status !== "ready") {
        throw new Error(`Account ${accountId} is not ready`);
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

        const log: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            accountId,
            timestamp: new Date(),
            recipient: to,
            status: "success",
            message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
        };
        logs.push(log);

        return { success: true, messageId: response.id.id };
    } catch (e: any) {
        const log: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            accountId,
            timestamp: new Date(),
            recipient: to,
            status: "error",
            message: message.substring(0, 50),
            error: e.message || 'Unknown error'
        };
        logs.push(log);
        throw e;
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

export function removeAccount(accountId: string) {
    const client = clients.get(accountId);
    if (client) {
        client.destroy();
        clients.delete(accountId);
    }
    statuses.delete(accountId);
    removeAccountFromList(accountId);
}

// Automatically initialize stored accounts if not already done
export async function initAllAccounts() {
    try {
        const { db } = await import('./server/db');
        const { accounts } = await import('./server/db/schema');
        
        const storedAccounts = await db.select().from(accounts);
        
        console.log(`Loading ${storedAccounts.length} stored WhatsApp accounts from DATABASE...`);
        for (const account of storedAccounts) {
            if (!clients.has(account.id)) {
                initializeWhatsApp(account.id).catch(err => {
                    console.error(`Failed to auto-init account ${account.name} (${account.id}):`, err);
                });
            }
        }
    } catch (e) {
        console.error('Error in initAllAccounts:', e);
    }
}

// Automatically start all connections when module loads
initAllAccounts();
