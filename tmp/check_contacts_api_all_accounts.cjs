const Database = require('better-sqlite3');
const db = new Database('sqlite.db');
const accounts = db.prepare('select id,name from accounts').all();
(async () => {
  for (const a of accounts) {
    try {
      const res = await fetch(`http://localhost:5173/api/whatsapp/contacts?accountId=${encodeURIComponent(a.id)}`);
      const data = await res.json();
      const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
      const long = contacts.filter(c => String(c?.number||'').replace(/\D/g,'').length >= 15);
      console.log('ACCOUNT', a.name, a.id, 'contacts', contacts.length, 'long>=15', long.length);
      if (long.length) console.log(' sample', long.slice(0,5).map(x=>({id:x.id,name:x.name,number:x.number})));
    } catch (e) {
      console.log('ACCOUNT', a.name, a.id, 'ERROR', String(e.message||e));
    }
  }
})();
