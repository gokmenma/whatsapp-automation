import { db } from '../src/lib/server/db/index.js';
import { accounts } from '../src/lib/server/db/schema.js';

async function check() {
    try {
        const all = await db.select().from(accounts).all();
        console.log('TOTAL ACCOUNTS IN DB:', all.length);
        all.forEach(a => {
            console.log(`- ID: ${a.id}, Name: ${a.name}, UserID: ${a.userId}, ScannerID: ${a.scannerId}`);
        });
    } catch (e) {
        console.error(e);
    }
}

check();
