
import { db } from './src/lib/server/db/index';
async function run() {
    try {
        const [rows] = await db.execute('SELECT id, name FROM accounts');
        console.log('ACCOUNTS:', rows);
        const [msgRows] = await db.execute('SELECT account_id, contact_jid, body, timestamp FROM messages ORDER BY timestamp DESC LIMIT 5');
        console.log('LATEST MESSAGES:', msgRows);
    } catch (e) {
        console.error(e);
    }
}
run();
