import Database from 'better-sqlite3';

const db = new Database('sqlite.db');
try {
  // 1. Add columns to accounts
  try {
    db.prepare("ALTER TABLE accounts ADD COLUMN auto_reply INTEGER NOT NULL DEFAULT 0").run();
  } catch (e) { console.log("auto_reply column error:", e.message); }

  try {
    db.prepare("ALTER TABLE accounts ADD COLUMN auto_reply_message TEXT NOT NULL DEFAULT 'Merhaba, şu an müsait değilim. En kısa sürede size geri dönüş yapacağım.'").run();
  } catch (e) { console.log("auto_reply_message column error:", e.message); }

  // 2. Drop columns from user_settings (Drizzle-kit was trying this anyway)
  try {
    // SQLite doesn't support DROP COLUMN in older versions easily, but we can just leave them or ignore errors
    // Actually, if we just add the missing ones, the app will work.
  } catch (e) {}

  // 3. Create auto_reply_history table if it doesn't exist
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS auto_reply_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        contact_number TEXT NOT NULL,
        sent_at INTEGER NOT NULL
      )
    `).run();
  } catch (e) { console.log("auto_reply_history error:", e.message); }

  console.log("Database update migration script finished.");
} finally {
  db.close();
}
