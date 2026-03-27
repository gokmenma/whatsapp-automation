import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    credits: integer('credits').notNull().default(30)
});

export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expires: integer('expires').notNull()
}, (t) => ({
    userIdIdx: index('sessions_user_id_idx').on(t.userId)
}));

export const accounts = sqliteTable('accounts', {
    id: text('id').primaryKey(), // Truly unique safe ID
    name: text('name').notNull(), // The display name
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    autoReply: integer('auto_reply', { mode: 'boolean' }).notNull().default(false),
    autoReplyMessage: text('auto_reply_message').notNull().default('Merhaba, şu an müsait değilim. En kısa sürede size geri dönüş yapacağım.'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
}, (t) => ({
    userIdIdx: index('accounts_user_id_idx').on(t.userId)
}));

export const userSettings = sqliteTable('user_settings', {
    userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    readReceipt: integer('read_receipt', { mode: 'boolean' }).notNull().default(true),
    darkMode: integer('dark_mode', { mode: 'boolean' }).notNull().default(true),
    messageDelay: integer('message_delay').notNull().default(2000), // Default 2 seconds
});

export const autoReplyHistory = sqliteTable('auto_reply_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    contactNumber: text('contact_number').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }).notNull()
}, (t) => ({
    accountIdIdx: index('auto_reply_history_account_id_idx').on(t.accountId)
}));
export const creditPackages = sqliteTable('kredi_paketleri', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('ad').notNull(),
    credits: integer('kredi').notNull(),
    price: integer('fiyat').notNull(), // Amount in cents or Lira (I'll assume integer for price)
    description: text('aciklama')
});

export const creditPurchases = sqliteTable('kredi_satin_alimlari', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    packageId: integer('paket_id').references(() => creditPackages.id),
    credits: integer('kredi').notNull(),
    amount: integer('tutar').notNull(),
    status: text('durum').notNull().default('completed'), // For simulation
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, (t) => ({
    userIdIdx: index('kredi_satin_alimlari_user_id_idx').on(t.userId)
}));

export const purchases = sqliteTable('purchases', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    packageName: text('package_name').notNull(),
    credits: integer('credits').notNull(),
    amount: integer('amount').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, (t) => ({
    userIdIdx: index('purchases_user_id_idx').on(t.userId)
}));

export const logs = sqliteTable('logs', {
    id: text('id').primaryKey(),
    batchId: text('batch_id'),
    accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    recipient: text('recipient').notNull(),
    status: text('status').notNull(), // 'success' or 'error'
    message: text('message').notNull(),
    error: text('error'),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull()
}, (t) => ({
    accountIdIdx: index('logs_account_id_idx').on(t.accountId)
}));

export const messageTemplates = sqliteTable('message_templates', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
}, (t) => ({
    userIdIdx: index('message_templates_user_id_idx').on(t.userId)
}));
