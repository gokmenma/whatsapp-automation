const Database = require("better-sqlite3");
const db = new Database("sqlite.db");
const rows = db.prepare("SELECT a.id, a.name, a.user_id, a.auto_reply, a.is_default, a.auto_reply_message, u.credits FROM accounts a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC").all();
console.log(JSON.stringify(rows, null, 2));
