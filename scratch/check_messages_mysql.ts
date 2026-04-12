
import mysql from 'mysql2/promise';

async function check() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows]: any = await connection.query('SELECT id, account_id, contact_jid, from_me, status, body, timestamp FROM messages ORDER BY timestamp DESC LIMIT 20');
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

check();
