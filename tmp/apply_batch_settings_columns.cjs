const Database = require('better-sqlite3');

const db = new Database('sqlite.db');
const cols = db.prepare('PRAGMA table_info(user_settings)').all().map((c) => c.name);

function addColumnIfMissing(name, sqlType, defaultValue) {
  if (cols.includes(name)) {
    console.log('exists', name);
    return;
  }
  db.exec(`ALTER TABLE user_settings ADD COLUMN ${name} ${sqlType} NOT NULL DEFAULT ${defaultValue}`);
  console.log('added', name);
}

addColumnIfMissing('batch_size', 'INTEGER', 25);
addColumnIfMissing('batch_wait_minutes', 'INTEGER', 5);

db.close();
console.log('done');
