const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const rows = db.prepare("SELECT id, from_me, body, sender_jid FROM messages WHERE contact_jid LIKE '%@g.us' ORDER BY timestamp DESC LIMIT 5").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
