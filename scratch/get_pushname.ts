import mysql from 'mysql2/promise';

async function getPushName() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT sender_name, body FROM messages WHERE contact_jid = '905079432723@s.whatsapp.net' AND from_me = 0 LIMIT 10"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

getPushName();
