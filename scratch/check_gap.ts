import mysql from 'mysql2/promise';

async function checkGap() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT contact_jid, body, timestamp FROM messages WHERE timestamp > '2026-04-12 13:00:00' AND timestamp < '2026-04-12 18:30:00' AND account_id = '19f006d3-f919-43bb-8d64-4aa894ed06d4' ORDER BY timestamp DESC"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkGap();
