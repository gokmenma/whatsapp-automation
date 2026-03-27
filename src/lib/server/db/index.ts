import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

let dbPath;
if (process.env.USER_DATA_PATH) {
    dbPath = path.join(process.env.USER_DATA_PATH, 'sqlite.db');
    // Eğer veritabanı dosyası yoksa, ana dizinden kopyala (opsiyonel)
    if (!fs.existsSync(dbPath) && fs.existsSync(path.resolve('sqlite.db'))) {
        fs.copyFileSync(path.resolve('sqlite.db'), dbPath);
    }
} else {
    dbPath = path.resolve('sqlite.db');
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
