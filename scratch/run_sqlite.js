import Database from 'better-sqlite3';
const db = new Database('sqlite.db');
db.exec("UPDATE messages SET contact_jid = '90' || contact_jid WHERE contact_jid LIKE '5_________%@s.whatsapp.net'");
db.exec("UPDATE messages SET contact_jid = '9' || contact_jid WHERE contact_jid LIKE '05_________%@s.whatsapp.net'");
console.log('Done');
