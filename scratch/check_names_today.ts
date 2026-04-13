import mysql from 'mysql2/promise';

async function checkNamesToday() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        `SELECT DISTINCT m.contact_jid, m.sender_name, m.body, m.timestamp 
         FROM messages m 
         WHERE m.timestamp > '2026-04-12 00:00:00' 
         ORDER BY m.timestamp DESC`
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkNamesToday();
