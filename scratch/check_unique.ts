import mysql from 'mysql2/promise';

async function checkUniqueToday() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT DISTINCT contact_jid, account_id FROM messages WHERE timestamp > '2026-04-12 00:00:00'"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkUniqueToday();
