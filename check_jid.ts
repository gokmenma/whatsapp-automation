import Database from 'better-sqlite3';
const db = new Database('./sqlite.db');
const rows = db.prepare("SELECT contact_jid, COUNT(*) as count FROM messages GROUP BY contact_jid").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
