const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const rows = db.prepare("select contact_jid, count(*) as cnt, max(timestamp) as last_ts from messages where account_id=? and (contact_jid like ? or contact_jid like ?) group by contact_jid order by last_ts desc").all('52866083-dac3-4c85-ad7c-7c96af6b797a','%231958986641581%','%908502235909%');
console.log(rows);
