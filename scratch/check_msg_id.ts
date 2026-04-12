
import mysql from 'mysql2/promise';

async function run() {
    const c = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });
    const [r] = await c.query('SELECT * FROM messages WHERE id = "ecb1b203-4dad-45ec-9e00-0a328729a083:AC69E8F970D597DF91F44F1A4E12AB41"');
    console.log(JSON.stringify(r, null, 2));
    await c.end();
}
run();
