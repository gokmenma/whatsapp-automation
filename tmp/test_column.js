
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
try {
    const row = db.prepare("SELECT is_read FROM messages LIMIT 1").get();
    console.log("Successfully selected is_read:", row);
} catch (e) {
    console.error("Error selecting is_read:", e.message);
} finally {
    db.close();
}
