import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { dev } from '$app/environment';
import * as schema from './schema';
import * as remoteSchema from './remote-schema';

// --- MYSQL CONFIGURATION ---
const dbName = process.env.MYSQL_DATABASE || (dev ? 'whatsapp_automation_dev' : 'whatsapp_automation');

const mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: dbName,
    timezone: 'Z',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 50,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Single database instance for everything
export const db = drizzleMysql(mysqlPool, { schema, mode: 'default' });
export const remoteDb = drizzleMysql(mysqlPool, { schema: remoteSchema, mode: 'default' });

let isInitialized = false;

async function initDb() {
    if (isInitialized) return;
    isInitialized = true;

    try {
        console.log('MySQL Database checking schema...');
        
        // Use a faster way to check columns/indexes than running full ALTERs
        // 1. Core tables
        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            username VARCHAR(255) NOT NULL, 
            password VARCHAR(255) NOT NULL, 
            email VARCHAR(255) NOT NULL, 
            role ENUM('superadmin', 'admin', 'user', 'qrcode_scanner') DEFAULT 'user', 
            status ENUM('active', 'inactive') DEFAULT 'active', 
            can_add_sources TINYINT(1) DEFAULT 1, 
            can_add_account TINYINT(1) DEFAULT 0,
            account_limit INT DEFAULT 5, 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, 
            full_name VARCHAR(100), 
            user_type ENUM('self_source', 'pool_source') DEFAULT 'self_source', 
            last_login TIMESTAMP NULL, 
            deleted TINYINT(1) DEFAULT 0
        )`);
        
        // Ensure can_add_account column exists (migration)
        const [userCols]: any = await mysqlPool.query("SHOW COLUMNS FROM users LIKE 'can_add_account'");
        if (userCols.length === 0) {
            console.log('Adding can_add_account column to users table...');
            await mysqlPool.query("ALTER TABLE users ADD COLUMN can_add_account TINYINT(1) DEFAULT 0 AFTER can_add_sources");
        }

        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS role_permissions (id INT AUTO_INCREMENT PRIMARY KEY, role ENUM('superadmin', 'admin', 'user', 'qrcode_scanner') NOT NULL, resource VARCHAR(255) NOT NULL, can_access TINYINT(1) DEFAULT 1)`);
        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(255) PRIMARY KEY, user_id INT NOT NULL, expires BIGINT NOT NULL)`);
        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS subscription_packages (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, price INT NOT NULL, account_limit INT DEFAULT 1)`);
        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS user_subscriptions (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, package_id INT NOT NULL, end_date DATETIME NOT NULL, status ENUM('active', 'expired', 'cancelled') DEFAULT 'active')`);
        await mysqlPool.query(`CREATE TABLE IF NOT EXISTS user_credits (user_id INT PRIMARY KEY, balance INT DEFAULT 0, updated_at DATETIME)`);
        
        // 2. WhatsApp Tables
        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                user_id INT,
                scanner_id INT,
                created_at DATETIME NOT NULL,
                auto_reply TINYINT(1) NOT NULL DEFAULT 0,
                auto_reply_message TEXT NOT NULL,
                is_default TINYINT(1) NOT NULL DEFAULT 0,
                is_private TINYINT(1) NOT NULL DEFAULT 0,
                sync_history TINYINT(1) NOT NULL DEFAULT 1
            )
        `);

        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(255) PRIMARY KEY,
                account_id VARCHAR(255) NOT NULL,
                contact_jid VARCHAR(255) NOT NULL,
                sender_jid VARCHAR(255),
                sender_name VARCHAR(255),
                from_me TINYINT(1) NOT NULL DEFAULT 0,
                body TEXT NOT NULL,
                media_type VARCHAR(50),
                quoted_msg_id VARCHAR(255),
                quoted_msg_body TEXT,
                quoted_msg_sender_name VARCHAR(255),
                reaction TEXT,
                edited_at DATETIME,
                timestamp DATETIME NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'sent',
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                INDEX messages_account_contact_idx (account_id, contact_jid),
                INDEX messages_account_id_idx (account_id),
                INDEX messages_timestamp_idx (timestamp),
                INDEX messages_unread_idx (account_id, from_me, is_read)
            ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `);

        // Check for specific columns/indexes only if needed
        const [cols]: any = await mysqlPool.query("SHOW COLUMNS FROM messages LIKE 'quoted_msg_sender_name'");
        if (cols.length === 0) {
            console.log('Adding quoted_msg_sender_name column...');
            await mysqlPool.query("ALTER TABLE messages ADD COLUMN quoted_msg_sender_name VARCHAR(255) AFTER quoted_msg_body");
        }

        const [indices]: any = await mysqlPool.query("SHOW INDEX FROM messages WHERE Key_name = 'messages_unread_idx'");
        if (indices.length === 0) {
            console.log('Adding unread messages index...');
            await mysqlPool.query("ALTER TABLE messages ADD INDEX messages_unread_idx (account_id, from_me, is_read)");
        }

        const [contactTsIdx]: any = await mysqlPool.query("SHOW INDEX FROM messages WHERE Key_name = 'messages_account_contact_timestamp_idx'");
        if (contactTsIdx.length === 0) {
            console.log('Adding account_contact_timestamp index...');
            await mysqlPool.query("ALTER TABLE messages ADD INDEX messages_account_contact_timestamp_idx (account_id, contact_jid, timestamp DESC)");
        }

        const [accountTsIdx]: any = await mysqlPool.query("SHOW INDEX FROM messages WHERE Key_name = 'messages_account_timestamp_idx'");
        if (accountTsIdx.length === 0) {
            console.log('Adding account_timestamp index...');
            await mysqlPool.query("ALTER TABLE messages ADD INDEX messages_account_timestamp_idx (account_id, timestamp DESC)");
        }

        // 3. User Settings and Migrations
        await mysqlPool.query(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INT PRIMARY KEY,
                read_receipt TINYINT(1) NOT NULL DEFAULT 1,
                dark_mode TINYINT(1) NOT NULL DEFAULT 1,
                message_delay INT NOT NULL DEFAULT 2000,
                batch_size INT NOT NULL DEFAULT 25,
                batch_wait_minutes INT NOT NULL DEFAULT 5,
                use_greeting_variations TINYINT(1) NOT NULL DEFAULT 1,
                use_intro_variations TINYINT(1) NOT NULL DEFAULT 1,
                use_closing_variations TINYINT(1) NOT NULL DEFAULT 1,
                reject_message_check_enabled TINYINT(1) NOT NULL DEFAULT 0,
                reject_keywords TEXT NOT NULL,
                ban_protection_enabled TINYINT(1) NOT NULL DEFAULT 1
            )
        `);

        // Migration: Add human_typing, simulate_online, and use_account_rotation columns individually
        const [hasHumanTyping]: any = await mysqlPool.query("SHOW COLUMNS FROM user_settings LIKE 'human_typing'");
        if (hasHumanTyping.length === 0) {
            await mysqlPool.query("ALTER TABLE user_settings ADD COLUMN human_typing TINYINT(1) NOT NULL DEFAULT 1");
        }
        const [hasSimulateOnline]: any = await mysqlPool.query("SHOW COLUMNS FROM user_settings LIKE 'simulate_online'");
        if (hasSimulateOnline.length === 0) {
            await mysqlPool.query("ALTER TABLE user_settings ADD COLUMN simulate_online TINYINT(1) NOT NULL DEFAULT 1");
        }
        const [hasRotation]: any = await mysqlPool.query("SHOW COLUMNS FROM user_settings LIKE 'use_account_rotation'");
        if (hasRotation.length === 0) {
            await mysqlPool.query("ALTER TABLE user_settings ADD COLUMN use_account_rotation TINYINT(1) NOT NULL DEFAULT 0");
        }

        // Migration: Add browser and proxy columns to accounts table
        const [hasBrowserPlatform]: any = await mysqlPool.query("SHOW COLUMNS FROM accounts LIKE 'browser_platform'");
        if (hasBrowserPlatform.length === 0) {
            await mysqlPool.query("ALTER TABLE accounts ADD COLUMN browser_platform VARCHAR(255) DEFAULT NULL");
            await mysqlPool.query("ALTER TABLE accounts ADD COLUMN browser_name VARCHAR(255) DEFAULT NULL");
            await mysqlPool.query("ALTER TABLE accounts ADD COLUMN proxy_url VARCHAR(500) DEFAULT NULL");
        }

        console.log('MySQL Database initialized successfully.');

    } catch (e) {
        console.error('MySQL Init Error:', e);
    }
}

initDb();

export { mysqlPool };
