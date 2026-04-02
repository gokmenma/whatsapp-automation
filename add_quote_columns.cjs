const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
try {
    db.exec(`ALTER TABLE messages ADD COLUMN quoted_msg_id TEXT;`);
    db.exec(`ALTER TABLE messages ADD COLUMN quoted_msg_body TEXT;`);
    console.log('✅ Columns added successfully.');
} catch (e) {
    if (e.message.includes('duplicate column name')) {
        console.log('⚠️ Columns already exist.');
    } else {
        console.error('❌ Error:', e.message);
    }
}
db.close();
