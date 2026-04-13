import mysql from 'mysql2/promise';

async function checkAccount2() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const accountId = 'eb7e3165-e702-4d09-82ef-fe1f3adb0c51';
    const [rows] = await connection.execute(
        `SELECT contact_jid, body, timestamp FROM messages 
         WHERE account_id = ? 
         ORDER BY timestamp DESC LIMIT 10`,
        [accountId]
    );
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

checkAccount2();
