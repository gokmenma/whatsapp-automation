import mysql from 'mysql2/promise';

async function getAccount() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT name, id FROM accounts"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

getAccount();
