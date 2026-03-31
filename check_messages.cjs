const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const rows = db.prepare('SELECT id, from_me, contact_jid, body, sender_jid FROM messages ORDER BY timestamp DESC LIMIT 10').all();
console.log(JSON.stringify(rows, null, 2));
db.close();
