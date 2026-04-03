const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const paths = [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Whatsapp_Auto_Messagger', 'sqlite.db'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'waflow-electron', 'sqlite.db'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'WaFlow', 'sqlite.db')
].filter(Boolean);
for (const p of paths) {
  if (!fs.existsSync(p)) continue;
  console.log('-- ' + p);
  const db = new Database(p);
  try {
    const cols = db.prepare('PRAGMA table_info(user_settings)').all().map(c => c.name);
    console.log('cols:', cols);
    const row = db.prepare('select * from user_settings limit 1').get();
    console.log('row:', row);
  } catch (e) {
    console.error('ERR:', e.message);
  } finally {
    db.close();
  }
}
