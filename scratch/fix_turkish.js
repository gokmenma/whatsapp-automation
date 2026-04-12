import mysql from 'mysql2/promise';

async function fix() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: 'whatsapp_automation',
        charset: 'utf8mb4'
    });

    const data = [
        ['Kullanıcı Yönetimi', '/admin/users'],
        ['Hesaplarım', '/hesaplar'],
        ['Hesap Havuzu', '/hesap-havuzu'],
        ['Mesajlar', '/mesajlar'],
        ['Hızlı Mesaj Gönder', '/mesaj-gonder'],
        ['Yetki Yönetimi', '/admin/permissions'],
        ['Kredi İşlemleri', '/admin/kredi-islemleri'],
        ['Mesaj Ayarları', '/ayarlar'],
        ['Gönderim Raporları', '/gonderim-raporlari']
    ];

    for (const [name, path] of data) {
        await connection.execute('UPDATE resources SET name = ? WHERE path = ?', [name, path]);
        console.log(`Updated ${path} to ${name}`);
    }

    await connection.end();
}

fix().catch(console.error);
