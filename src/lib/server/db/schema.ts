import { mysqlTable, varchar, text, int, timestamp, boolean, index, serial, datetime } from 'drizzle-orm/mysql-core';

// Local tables (formerly SQLite) for WhatsApp data and preferences - Now MySQL
export const accounts = mysqlTable('accounts', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 255 }), // Linked to remote user ID
    scannerId: int('scanner_id'), // Linked to remote user ID
    createdAt: datetime('created_at', { mode: 'date' }).notNull(),
    autoReply: boolean('auto_reply').notNull().default(false),
    autoReplyMessage: text('auto_reply_message').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    isPrivate: boolean('is_private').notNull().default(false),
    syncHistory: boolean('sync_history').notNull().default(true)
}, (t) => ({
    userIdIdx: index('accounts_user_id_idx').on(t.userId),
    scannerIdIdx: index('accounts_scanner_id_idx').on(t.scannerId)
}));

export const userSettings = mysqlTable('user_settings', {
    userId: int('user_id').primaryKey(),
    readReceipt: boolean('read_receipt').notNull().default(true),
    darkMode: boolean('dark_mode').notNull().default(true),
    messageDelay: int('message_delay').notNull().default(2000),
    batchSize: int('batch_size').notNull().default(25),
    batchWaitMinutes: int('batch_wait_minutes').notNull().default(5),
    useGreetingVariations: boolean('use_greeting_variations').notNull().default(true),
    useIntroVariations: boolean('use_intro_variations').notNull().default(true),
    useClosingVariations: boolean('use_closing_variations').notNull().default(true),
    rejectMessageCheckEnabled: boolean('reject_message_check_enabled').notNull().default(false),
    rejectKeywords: text('reject_keywords').notNull(),
    banProtectionEnabled: boolean('ban_protection_enabled').notNull().default(true),
});

export const autoReplyHistory = mysqlTable('auto_reply_history', {
    id: serial('id').primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    contactNumber: varchar('contact_number', { length: 255 }).notNull(),
    sentAt: datetime('sent_at', { mode: 'date' }).notNull()
}, (t) => ({
    accountIdIdx: index('auto_reply_history_account_id_idx').on(t.accountId)
}));

export const logs = mysqlTable('logs', {
    id: varchar('id', { length: 255 }).primaryKey(),
    batchId: varchar('batch_id', { length: 255 }),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    recipient: varchar('recipient', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    message: text('message').notNull(),
    error: text('error'),
    timestamp: datetime('timestamp', { mode: 'date' }).notNull()
}, (t) => ({
    accountIdIdx: index('logs_account_id_idx').on(t.accountId)
}));

export const messageTemplates = mysqlTable('message_templates', {
    id: serial('id').primaryKey(),
    userId: int('user_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    content: text('content').notNull(),
    createdAt: datetime('created_at', { mode: 'date' }).notNull()
}, (t) => ({
    userIdIdx: index('message_templates_user_id_idx').on(t.userId)
}));

export const messages = mysqlTable('messages', {
    id: varchar('id', { length: 255 }).primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    contactJid: varchar('contact_jid', { length: 255 }).notNull(),
    senderJid: varchar('sender_jid', { length: 255 }),
    senderName: varchar('sender_name', { length: 255 }),
    fromMe: boolean('from_me').notNull().default(false),
    body: text('body').notNull(),
    mediaType: varchar('media_type', { length: 50 }),
    quotedMsgId: varchar('quoted_msg_id', { length: 255 }),
    quotedMsgBody: text('quoted_msg_body'),
    reaction: text('reaction'),
    editedAt: datetime('edited_at', { mode: 'date' }),
    timestamp: datetime('timestamp', { mode: 'date' }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('sent'),
    isRead: boolean('is_read').notNull().default(false)
}, (t) => ({
    accountContactIdx: index('messages_account_contact_idx').on(t.accountId, t.contactJid),
    accountIdIdx: index('messages_account_id_idx').on(t.accountId),
    timestampIdx: index('messages_timestamp_idx').on(t.timestamp)
}));

export const conversationPreferences = mysqlTable('conversation_preferences', {
    id: serial('id').primaryKey(),
    accountId: varchar('account_id', { length: 255 }).notNull(),
    contactKey: varchar('contact_key', { length: 255 }).notNull(),
    muted: boolean('muted').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    createdAt: datetime('created_at', { mode: 'date' }).notNull(),
    updatedAt: datetime('updated_at', { mode: 'date' }).notNull()
}, (t) => ({
    accountContactKeyIdx: index('conversation_preferences_account_contact_idx').on(t.accountId, t.contactKey)
}));
