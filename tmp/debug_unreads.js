
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
try {
    const accountId = '19dc2193-8647-4977-96a3-673abedfacdf'; // Sendika ID from image snippet
    const unreads = db.prepare("SELECT COUNT(*) as count FROM messages WHERE account_id = ? AND from_me = 0 AND is_read = 0").get(accountId);
    console.log(`Unread count for Sendika (${accountId}):`, unreads.count);
    
    const lastMsg = db.prepare("SELECT body, timestamp, is_read, from_me FROM messages WHERE account_id = ? ORDER BY timestamp DESC LIMIT 1").get(accountId);
    console.log("Last message for Sendika:", lastMsg);
} catch (e) {
    console.error("Error:", e.message);
} finally {
    db.close();
}
