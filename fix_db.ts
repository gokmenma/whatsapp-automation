import { db } from './src/lib/server/db/index.ts';
import { sql } from 'drizzle-orm';

async function fix() {
    console.log('Fixing messages table...');
    
    // 1. Remove [Medya] text from existing messages
    const [res1] = await db.execute(sql`
        UPDATE messages 
        SET body = '' 
        WHERE body = '[Medya]'
    `);
    console.log('Removed [Medya] from rows:', (res1 as any).affectedRows);

    // 2. Fix timestamps that were stored in UTC but are being read as local (3 hour shift)
    // We update messages where the gap exists.
    const [res2] = await db.execute(sql`
        UPDATE messages 
        SET timestamp = DATE_ADD(timestamp, INTERVAL 3 HOUR)
        WHERE timestamp < DATE_ADD(NOW(), INTERVAL -1 HOUR)
    `);
    console.log('Shifted timestamps for rows:', (res2 as any).affectedRows);

    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
