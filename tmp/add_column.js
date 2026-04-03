
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');

try {
    db.exec("ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0;");
    console.log("Column is_read added successfully.");
} catch (e) {
    if (e.message.includes("duplicate column name")) {
        console.log("Column is_read already exists.");
    } else {
        console.error("Error adding column:", e.message);
    }
} finally {
    db.close();
}
