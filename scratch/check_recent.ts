import mysql from 'mysql2/promise';

async function checkRecent() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT * FROM messages WHERE timestamp > DATE_SUB(NOW(), INTERVAL 2 HOUR) ORDER BY timestamp DESC"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkRecent();
