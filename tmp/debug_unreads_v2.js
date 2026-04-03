
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
try {
    const accountId = '19dc2193-0b5f-4c24-9c9e-93561e29dcf9'; 
    const result = db.prepare("SELECT COUNT(*) as count FROM messages WHERE account_id = ? AND from_me = 0 AND is_read = 0").get(accountId);
    console.log(`Unread count for Sendika:`, result.count);
    
    // Check for "Destek 19" specifically
    const msg = db.prepare("SELECT * FROM messages WHERE account_id = ? AND body LIKE '%Destek 19%'").get(accountId);
    console.log("Destek 19 message found:", msg);
} catch (e) { console.error(e.message); } finally { db.close(); }
