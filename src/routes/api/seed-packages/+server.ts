import { db } from '$lib/server/db';
import { creditPackages } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';

export async function GET() {
    const packages = [
        { name: 'Başlangıç Paketi', credits: 100, price: 100 },
        { name: 'Standart Paket', credits: 250, price: 200 },
        { name: 'Profesyonel Paket', credits: 500, price: 350 },
        { name: 'Kurumsal Paket', credits: 1000, price: 600 }
    ];

    try {
        const existing = await db.select().from(creditPackages).all();
        if (existing.length === 0) {
            await db.insert(creditPackages).values(packages);
            return json({ success: true, message: 'Paketler başarıyla eklendi.' });
        }
        return json({ success: true, message: 'Paketler zaten mevcut.' });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
