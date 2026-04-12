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
        console.log('--- RECENT IMAGES FOR ACCOUNT 9c98420b ---');
        const [msgs] = await pool.query(`
            SELECT id, timestamp 
            FROM messages 
            WHERE account_id = '9c98420b-4908-4f04-8e99-33a29de888ac' 
            AND media_type = 'image' 
            ORDER BY timestamp DESC 
            LIMIT 5
        `);
        console.table(msgs);

    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        await pool.end();
    }
}

check();
