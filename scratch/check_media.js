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
        console.log('--- RECENT MESSAGES IN MBEYAZILIM ---');
        const [msgs] = await pool.query(`
            SELECT id, body, media_type, timestamp, sender_name 
            FROM messages 
            WHERE contact_jid = '120363179169715740@g.us'
            ORDER BY timestamp DESC
            LIMIT 50
        `);
        console.table(msgs);

    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        await pool.end();
    }
}

check();
