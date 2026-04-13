import mysql from 'mysql2/promise';

async function checkCevapToday() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT * FROM messages WHERE body = 'cevap' AND timestamp > '2026-04-12 00:00:00'"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkCevapToday();
