import mysql from 'mysql2/promise';

async function check100() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT account_id, contact_jid, body, timestamp FROM messages ORDER BY timestamp DESC LIMIT 100"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

check100();
