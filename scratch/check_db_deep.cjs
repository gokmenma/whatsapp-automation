const mysql = require('mysql2/promise');

async function run() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const accountId = '9c98420b-4908-4f04-8e99-33a29de888ac';
    const [rows] = await conn.execute('SELECT contact_jid, body FROM messages WHERE account_id = ? AND (body LIKE ? OR contact_jid LIKE ?)', [accountId, '%Test 28%', '%122553083379885%']);
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
}

run().catch(console.error);
