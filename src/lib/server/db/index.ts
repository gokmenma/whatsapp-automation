import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let dbPath;
if (process.env.USER_DATA_PATH) {
    dbPath = path.join(process.env.USER_DATA_PATH, 'sqlite.db');
    // Eğer veritabanı dosyası yoksa, ana dizinden kopyala (opsiyonel)
    if (!fs.existsSync(dbPath) && fs.existsSync(path.resolve('sqlite.db'))) {
        fs.copyFileSync(path.resolve('sqlite.db'), dbPath);
    }
} else {
    dbPath = path.resolve('sqlite.db');
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

function ensureMessageColumns() {
    const columns = sqlite.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    const requiredColumns: Array<[string, string]> = [
        ['sender_jid', 'ALTER TABLE messages ADD COLUMN sender_jid TEXT'],
        ['sender_name', 'ALTER TABLE messages ADD COLUMN sender_name TEXT'],
        ['quoted_msg_id', 'ALTER TABLE messages ADD COLUMN quoted_msg_id TEXT'],
        ['quoted_msg_body', 'ALTER TABLE messages ADD COLUMN quoted_msg_body TEXT'],
        ['reaction', 'ALTER TABLE messages ADD COLUMN reaction TEXT'],
        ['edited_at', 'ALTER TABLE messages ADD COLUMN edited_at INTEGER']
    ];

    for (const [name, statement] of requiredColumns) {
        if (!names.has(name)) {
            sqlite.exec(statement);
        }
    }
}

function ensureConversationPreferencesTable() {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS conversation_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            contact_key TEXT NOT NULL,
            muted INTEGER NOT NULL DEFAULT 0,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
    `);
    sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS conversation_preferences_account_contact_unique_idx
        ON conversation_preferences(account_id, contact_key)
    `);
}

function ensureUserSettingsColumns() {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,
            read_receipt INTEGER NOT NULL DEFAULT 1,
            dark_mode INTEGER NOT NULL DEFAULT 1,
            message_delay INTEGER NOT NULL DEFAULT 2000,
            batch_size INTEGER NOT NULL DEFAULT 25,
            batch_wait_minutes INTEGER NOT NULL DEFAULT 5,
            use_greeting_variations INTEGER NOT NULL DEFAULT 1,
            use_intro_variations INTEGER NOT NULL DEFAULT 1,
            use_closing_variations INTEGER NOT NULL DEFAULT 1,
            reject_message_check_enabled INTEGER NOT NULL DEFAULT 0,
            reject_keywords TEXT NOT NULL DEFAULT 'mesaj red\nred\nmesaj ret\nret\nmesaj almak istemiyorum',
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    const columns = sqlite.prepare('PRAGMA table_info(user_settings)').all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    const requiredColumns: Array<[string, string]> = [
        ['read_receipt', 'ALTER TABLE user_settings ADD COLUMN read_receipt INTEGER NOT NULL DEFAULT 1'],
        ['dark_mode', 'ALTER TABLE user_settings ADD COLUMN dark_mode INTEGER NOT NULL DEFAULT 1'],
        ['message_delay', 'ALTER TABLE user_settings ADD COLUMN message_delay INTEGER NOT NULL DEFAULT 2000'],
        ['batch_size', 'ALTER TABLE user_settings ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 25'],
        ['batch_wait_minutes', 'ALTER TABLE user_settings ADD COLUMN batch_wait_minutes INTEGER NOT NULL DEFAULT 5'],
        ['use_greeting_variations', 'ALTER TABLE user_settings ADD COLUMN use_greeting_variations INTEGER NOT NULL DEFAULT 1'],
        ['use_intro_variations', 'ALTER TABLE user_settings ADD COLUMN use_intro_variations INTEGER NOT NULL DEFAULT 1'],
        ['use_closing_variations', 'ALTER TABLE user_settings ADD COLUMN use_closing_variations INTEGER NOT NULL DEFAULT 1'],
        ['reject_message_check_enabled', 'ALTER TABLE user_settings ADD COLUMN reject_message_check_enabled INTEGER NOT NULL DEFAULT 0'],
        ['reject_keywords', "ALTER TABLE user_settings ADD COLUMN reject_keywords TEXT NOT NULL DEFAULT 'mesaj red\\nred\\nmesaj ret\\nret\\nmesaj almak istemiyorum'"]
    ];

    for (const [name, statement] of requiredColumns) {
        if (!names.has(name)) {
            sqlite.exec(statement);
        }
    }
}

ensureMessageColumns();
ensureConversationPreferencesTable();
ensureUserSettingsColumns();

export const db = drizzle(sqlite, { schema });
