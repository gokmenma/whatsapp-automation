import { mysqlTable, varchar, text, int, timestamp, mysqlEnum, tinyint, bigint, datetime } from 'drizzle-orm/mysql-core';

// Mevcut Users Tablosu (Görselinizdeki Yapı)
export const users = mysqlTable('users', {
    id: int('id').primaryKey().autoincrement(),
    username: varchar('username', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    role: mysqlEnum('role', ['superadmin', 'admin', 'user', 'qrcode_scanner']).default('user'),
    status: mysqlEnum('status', ['active', 'inactive']).default('active'),
    canAddSources: tinyint('can_add_sources').default(1),
    canAddAccount: tinyint('can_add_account').default(0),
    accountLimit: int('account_limit').default(5),
    createdAt: timestamp('created_at', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
    fullName: varchar('full_name', { length: 100 }),
    userType: mysqlEnum('user_type', ['self_source', 'pool_source']).default('self_source'),
    lastLogin: timestamp('last_login', { mode: 'string' }),
    deleted: tinyint('deleted').default(0)
});

// Sayfalar ve İşlemler
export const resources = mysqlTable('resources', {
    id: int('id').primaryKey().autoincrement(),
    path: varchar('path', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    icon: varchar('icon', { length: 50 }).default('Globe'),
    sortOrder: int('sort_order').default(0),
    category: mysqlEnum('category', ['page', 'action']).default('page')
});

// Rol Yetkileri
export const rolePermissions = mysqlTable('role_permissions', {
    id: int('id').primaryKey().autoincrement(),
    role: mysqlEnum('role', ['superadmin', 'admin', 'user', 'qrcode_scanner']).notNull(),
    resource: varchar('resource', { length: 255 }).notNull(), // Sayfa veya İşlem adı (Path)
    canAccess: tinyint('can_access').default(1)
});

// Oturumlar
export const sessions = mysqlTable('sessions', {
    id: varchar('id', { length: 255 }).primaryKey(),
    userId: int('user_id').notNull(),
    expires: bigint('expires', { mode: 'number' }).notNull()
});

// Abonelik Paketleri (Planlar)
export const subscriptionPackages = mysqlTable('subscription_packages', {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    price: int('price').notNull(),
    durationDays: int('duration_days').default(30),
    accountLimit: int('account_limit').default(1),
    features: text('features')
});

// Kullanıcı Abonelikleri
export const userSubscriptions = mysqlTable('user_subscriptions', {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id').notNull(),
    packageId: int('package_id').notNull(),
    startDate: datetime('start_date'),
    endDate: datetime('end_date').notNull(),
    status: mysqlEnum('status', ['active', 'expired', 'cancelled']).default('active'),
    autoRenew: tinyint('auto_renew').default(1)
});

// Kredi Bakiyeleri (Ayrı Tablo)
export const userCredits = mysqlTable('user_credits', {
    userId: int('user_id').primaryKey(),
    balance: int('balance').default(0),
    updatedAt: datetime('updated_at')
});

// Kredi Paketleri
export const creditPackages = mysqlTable('kredi_paketleri', {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('ad', { length: 255 }).notNull(),
    credits: int('kredi').notNull(),
    price: int('fiyat').notNull(),
    description: text('aciklama')
});

// Kredi Satın Alımları
export const creditPurchases = mysqlTable('kredi_satin_alimlari', {
    id: int('id').primaryKey().autoincrement(),
    userId: int('user_id').notNull(),
    packageId: int('package_id'),
    credits: int('kredi').notNull(),
    amount: int('tutar').notNull(),
    status: mysqlEnum('status', ['pending', 'completed', 'failed']).default('completed'),
    createdAt: datetime('created_at')
});
