const mysql = require('mysql2/promise');

async function checkMessages() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    try {
        console.log('--- Recent Messages with "Cevap yazıyorum" ---');
        const [rows] = await connection.execute(
            'SELECT account_id, from_me, contact_jid, sender_name, body, timestamp FROM messages WHERE body LIKE "%Cevap yazıyorum%" ORDER BY timestamp DESC LIMIT 5'
        );
        console.log(JSON.stringify(rows, null, 2));

        console.log('\n--- Contacts for relevant JIDs ---');
        const [contacts] = await connection.execute(
            'SELECT * FROM messages WHERE contact_jid IN ("122553083379885@s.whatsapp.net", "905079432723@s.whatsapp.net", "905409432723@s.whatsapp.net") GROUP BY contact_jid'
        );
        // Wait, messages table doesn't have contact names store, only sender_name if it was a group.
        // The contacts are in the Baileys store (JSON files) not in MySQL yet.
        // Wait, where does the sidebar get names from?
        // Let's check the API endpoint for messages/sidebar.

    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

checkMessages();
