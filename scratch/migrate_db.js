import mysql from 'mysql2/promise';
import 'dotenv/config';

async function migrate() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'whatsapp_automation',
    });

    try {
        console.log('Starting migration...');
        
        // 1. role_permissions
        console.log('Creating role_permissions table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_permissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                role ENUM('superadmin', 'admin', 'user', 'qrcode_scanner') NOT NULL,
                resource VARCHAR(255) NOT NULL,
                can_access TINYINT(1) DEFAULT 1
            )
        `);

        // 2. account_limit
        console.log('Adding account_limit to users...');
        const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'account_limit'");
        if (columns.length === 0) {
            await pool.query("ALTER TABLE users ADD COLUMN account_limit INT DEFAULT 5");
            console.log('account_limit added');
        } else {
            console.log('account_limit already exists');
        }

        // 3. Update role enum
        console.log('Updating role enum...');
        await pool.query(`
            ALTER TABLE users MODIFY COLUMN role ENUM('superadmin', 'admin', 'user', 'qrcode_scanner') DEFAULT 'user'
        `);
        console.log('Role enum updated');

        console.log('Migration complete!');

    } catch (e) {
        console.error('Migration Failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
