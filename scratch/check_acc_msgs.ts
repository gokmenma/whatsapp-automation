
import mysql from 'mysql2/promise';

async function run() {
    const c = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });
    const [r] = await c.query('SELECT contact_jid, from_me, body, timestamp FROM messages WHERE account_id = "4ea4dbd9-3714-41df-8329-aa57ad5553b4" ORDER BY timestamp DESC');
    console.log(JSON.stringify(r, null, 2));
    await c.end();
}
run();
