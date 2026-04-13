import mysql from 'mysql2/promise';

async function checkCevap() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT * FROM messages WHERE body LIKE '%cevap%'"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkCevap();
