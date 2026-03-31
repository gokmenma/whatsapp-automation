import Database from 'better-sqlite3';

const db = new Database('./sqlite.db');

// Fix group IDs that were incorrectly tagged as individual chats
// Turkish phone numbers are 12 digits (905XXXXXXXXX). 
// Any ID longer than 13 digits is almost certainly a group.
console.log("Fixing group JIDs...");
const result = db.prepare(`
    UPDATE messages 
    SET contact_jid = REPLACE(contact_jid, '@s.whatsapp.net', '@g.us')
    WHERE contact_jid LIKE '%@s.whatsapp.net' 
    AND LENGTH(SUBSTR(contact_jid, 0, INSTR(contact_jid, '@'))) > 13
`).run();

console.log(`Updated ${result.changes} group records.`);

// Also clean up empty JIDs if any
const result2 = db.prepare(`
    DELETE FROM messages 
    WHERE contact_jid = '@s.whatsapp.net' OR contact_jid = '' OR contact_jid IS NULL
`).run();
console.log(`Deleted ${result2.changes} empty JID records.`);

db.close();
