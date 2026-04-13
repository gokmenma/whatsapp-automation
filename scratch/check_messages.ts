import mysql from 'mysql2/promise';

async function checkMessages() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        'SELECT contact_jid, body, timestamp, from_me FROM messages ORDER BY timestamp DESC LIMIT 20'
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkMessages();
