import mysql from 'mysql2/promise';

async function getName() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows] = await connection.execute(
        "SELECT sender_name FROM messages WHERE contact_jid = '905079432723@s.whatsapp.net' AND sender_name IS NOT NULL LIMIT 1"
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

getName();
