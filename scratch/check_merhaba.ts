import mysql from 'mysql2/promise';

async function checkMerhaba() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT * FROM messages WHERE body LIKE '%detay paylaşabilirim%'"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkMerhaba();
