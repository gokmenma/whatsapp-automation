const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await conn.execute('SELECT account_id, contact_jid, body, from_me FROM messages WHERE body LIKE ? ORDER BY timestamp DESC', ['%Test 2%']);
    console.table(rows);
    await conn.end();
}

run().catch(console.error);
