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
        console.log('--- ACCOUNTS ---');
        const [accounts] = await pool.query('SELECT id, name FROM accounts');
        console.table(accounts);

        console.log('--- RECENT CONVERSATIONS WITH NAMES ---');
        const [msgs] = await pool.query(`
            SELECT DISTINCT contact_jid, sender_name, body 
            FROM messages 
            WHERE body LIKE '%arka plan%' 
               OR sender_name LIKE '%Mehmet%'
               OR sender_name LIKE '%Bilge%'
            ORDER BY timestamp DESC
            LIMIT 20
        `);
        console.table(msgs);

    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        await pool.end();
    }
}

check();
