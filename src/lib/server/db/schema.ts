import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull()
});

export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expires: integer('expires').notNull()
});

export const accounts = sqliteTable('accounts', {
    id: text('id').primaryKey(), // The safe ID (slug)
    name: text('name').notNull(), // The display name
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const userSettings = sqliteTable('user_settings', {
    userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    autoReply: integer('auto_reply', { mode: 'boolean' }).notNull().default(false),
    readReceipt: integer('read_receipt', { mode: 'boolean' }).notNull().default(true),
    darkMode: integer('dark_mode', { mode: 'boolean' }).notNull().default(true),
    messageDelay: integer('message_delay').notNull().default(2000), // Default 2 seconds
});

