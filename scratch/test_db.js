import mysql from 'mysql2/promise';
import 'dotenv/config';

async function test() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'whatsapp_automation',
    });

    try {
        console.log('Testing connection...');
        const [rows] = await pool.query('SELECT 1');
        console.log('Connection OK:', rows);

        console.log('Checking users table...');
        const [columns] = await pool.query("SHOW COLUMNS FROM users");
        console.log('Columns:', columns.map((c) => c.Field));

        const hasLimit = columns.some((c) => c.Field === 'account_limit');
        console.log('Has account_limit:', hasLimit);

        console.log('Checking role_permissions table...');
        const [tables] = await pool.query("SHOW TABLES LIKE 'role_permissions'");
        console.log('Role permissions table exists:', tables.length > 0);

    } catch (e) {
        console.error('Test Failed:', e);
    } finally {
        await pool.end();
    }
}

test();
