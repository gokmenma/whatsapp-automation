import { db, remoteDb } from '$lib/server/db';
import { creditPackages as localCreditPackages } from '$lib/server/db/schema';
import { subscriptionPackages, creditPackages as remoteCreditPackages } from '$lib/server/db/remote-schema';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';

export async function GET() {
    try {
        // 1. Seed Remote Subscription Packages (MySQL)
        const subPacks = [
            { 
                name: 'Pro Aylık', 
                description: 'Profesyonel WhatsApp otomasyon paketi.', 
                price: 299, 
                durationDays: 30, 
                accountLimit: 3, 
                features: '["3 WhatsApp Hesabı", "100 Mesaj Kredisi", "Öncelikli Destek"]' 
            }
        ];

        for (const pkg of subPacks) {
            await remoteDb.execute(sql`
                INSERT INTO subscription_packages (name, description, price, duration_days, account_limit, features)
                VALUES (${pkg.name}, ${pkg.description}, ${pkg.price}, ${pkg.durationDays}, ${pkg.accountLimit}, ${pkg.features})
                ON DUPLICATE KEY UPDATE name = name
            `);
        }

        // 2. Seed Remote Credit Packages (MySQL)
        const credPacks = [
            { name: 'Başlangıç Paketi', credits: 100, price: 100 },
            { name: 'Standart Paket', credits: 250, price: 200 },
            { name: 'Profesyonel Paket', credits: 500, price: 350 },
            { name: 'Kurumsal Paket', credits: 1000, price: 600 }
        ];

        for (const pkg of credPacks) {
            await remoteDb.execute(sql`
                INSERT INTO kredi_paketleri (ad, kredi, fiyat)
                VALUES (${pkg.name}, ${pkg.credits}, ${pkg.price})
                ON DUPLICATE KEY UPDATE ad = ad
            `);
        }

        // 3. Seed Local Credit Packages (SQLite - legacy or fallback)
        try {
            await db.insert(localCreditPackages).values(
                credPacks.map(p => ({
                    name: p.name,
                    credits: p.credits,
                    price: p.price
                }))
            ).onConflictDoNothing();
        } catch (localErr) {
            console.warn('Local seed optional:', localErr);
        }

        return json({ success: true, message: 'Veritabanı paketleri başarıyla senkronize edildi.' });
    } catch (e: any) {
        console.error('Seed Error:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
