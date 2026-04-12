const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await conn.execute('SELECT id, account_id, contact_jid, body, from_me, timestamp FROM messages WHERE body LIKE ?', ['%Test 28%']);
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
}

run().catch(console.error);
