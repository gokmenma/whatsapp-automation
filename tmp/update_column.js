
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
try {
    db.exec("UPDATE messages SET is_read = 0 WHERE is_read IS NULL;");
    console.log("Updated null values to 0.");
} catch (e) {
    console.error("Error updating:", e.message);
} finally {
    db.close();
}
