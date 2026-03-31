const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
try {
    db.exec(`ALTER TABLE messages ADD COLUMN sender_jid TEXT;`);
    console.log('✅ Column sender_jid added successfully.');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('⚠️ Column already exists.');
    } else {
        console.error('❌ Error:', e.message);
    }
}
db.close();
