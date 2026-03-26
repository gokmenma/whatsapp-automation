const sqlite = require('better-sqlite3');
const db = new sqlite('sqlite.db');
const rows = db.prepare('SELECT * FROM accounts').all();
console.log(JSON.stringify(rows, null, 2));
db.close();
