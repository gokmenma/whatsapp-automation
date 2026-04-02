import Database from "better-sqlite3";
const db = new Database("sqlite.db", { readonly: true });
const rows = db.prepare("SELECT id, account_id, contact_jid, sender_jid, sender_name, from_me, body, timestamp FROM messages WHERE contact_jid LIKE ? ORDER BY timestamp DESC LIMIT 60").all("%@g.us");
console.log(JSON.stringify(rows, null, 2));
