const Database = require('better-sqlite3');
const db = new Database('sqlite.db');

try {
    console.log('Starting SQLite migration...');

    // Check if scanner_id exists
    const columns = db.prepare("PRAGMA table_info(accounts)").all();
    const hasScannerId = columns.some(c => c.name === 'scanner_id');
    const userIdNotNull = columns.find(c => c.name === 'user_id').notnull === 1;

    if (!hasScannerId || userIdNotNull) {
        console.log('Recreating accounts table...');
        
        db.exec("BEGIN TRANSACTION");
        
        // 1. Rename old table
        db.exec("ALTER TABLE accounts RENAME TO accounts_old");
        
        // 2. Create new table
        db.exec(`
            CREATE TABLE accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                user_id TEXT,
                scanner_id INTEGER,
                created_at INTEGER NOT NULL,
                auto_reply INTEGER NOT NULL DEFAULT 0,
                auto_reply_message TEXT NOT NULL DEFAULT 'Merhaba, şu an müsait değilim. En kısa sürede size geri dönüş yapacağım.',
                is_default INTEGER NOT NULL DEFAULT 0
            )
        `);
        
        // 3. Copy data
        db.exec(`
            INSERT INTO accounts (id, name, user_id, created_at, auto_reply, auto_reply_message, is_default)
            SELECT id, name, user_id, created_at, auto_reply, auto_reply_message, is_default FROM accounts_old
        `);
        
        // 4. Drop old table
        db.exec("DROP TABLE accounts_old");
        
        db.exec("COMMIT");
        console.log('Accounts table recreated successfully');
    } else {
        console.log('Accounts table already up to date');
    }

} catch (e) {
    console.error('SQLite Migration Failed:', e);
    db.exec("ROLLBACK");
} finally {
    db.close();
}
