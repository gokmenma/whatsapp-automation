const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const rows = db.prepare("select id,account_id,contact_jid,sender_jid,sender_name,from_me,body,timestamp from messages where account_id=? and (contact_jid like ? or sender_jid like ?) order by timestamp desc limit 20").all('52866083-dac3-4c85-ad7c-7c96af6b797a','%231958986641581%','%231958986641581%');
console.log('rows', rows.length);
console.log(rows);
