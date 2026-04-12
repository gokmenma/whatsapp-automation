import mysql from 'mysql2/promise';
import 'dotenv/config';

async function check() {
    const pool = mysql.createPool({
        host: process.env.MYSQL_HOST || 'localhost',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'whatsapp_automation',
    });

    try {
        console.log('--- ALL ACCOUNTS ---');
        const [accounts] = await pool.query('SELECT id, name FROM accounts');
        console.table(accounts);
    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        await pool.end();
    }
}

check();
