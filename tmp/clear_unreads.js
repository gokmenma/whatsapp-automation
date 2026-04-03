
import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
try {
    const acc1 = 'fe40f459-78b7-4c9d-a62e-b81387c8baf6'; // Kendi Hesabı
    const acc2 = '19dc2193-0b5f-4c24-9c9e-93561e29dcf9'; // Sendika
    
    db.prepare("UPDATE messages SET is_read = 1 WHERE account_id = ?").run(acc1);
    // Let's also mark Sendika's existing as read to test one fresh message
    db.prepare("UPDATE messages SET is_read = 1 WHERE account_id = ?").run(acc2);
    
    console.log("Marked all current messages as read for both accounts.");
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
