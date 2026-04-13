import mysql from 'mysql2/promise';

async function checkTest43() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT * FROM messages WHERE body LIKE '%Test 43%'"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkTest43();
