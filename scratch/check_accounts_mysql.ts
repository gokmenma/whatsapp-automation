
import mysql from 'mysql2/promise';

async function check() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'whatsapp_automation'
    });

    const [rows]: any = await connection.query('SELECT id, name, is_default, is_private FROM accounts');
    console.log('Accounts in DB:');
    console.log(JSON.stringify(rows, null, 2));
    await connection.end();
}

check();
