import { json } from '@sveltejs/kit';
import { getWhatsAppContacts, initializeWhatsApp, getAccountStatus } from '$lib/whatsapp';

export async function GET({ url }) {
    const accountId = url.searchParams.get('accountId');
    
    if (!accountId) {
        return json({ success: false, error: "AccountId is required" }, { status: 400 });
    }

    try {
        // Otomatik Başlatma (Lazy Load): Eğer hesap memory'de yoksa ama veritabanında varsa başlat.
        const status = getAccountStatus(accountId);
        if (status.status === 'disconnected') {
            console.log(`[API] Account ${accountId} is disconnected, attempting auto-initialization for contacts...`);
            // Arka planda başlat, ancak rehber için 1-2 saniye bekleyebiliriz veya 
            // kullanıcıya hesabın bağlandığını bildirebiliriz.
            initializeWhatsApp(accountId).catch(console.error);
        }

        const contacts = await getWhatsAppContacts(accountId);
        
        // Eğer rehber hala boşsa ve hesap yeni bağlanıyorsa kullanıcıya bilgi verelim
        if (contacts.length === 0 && (status.status === 'connecting' || status.status === 'loading')) {
            return json({ success: true, contacts: [], message: "Rehber senkronize ediliyor..." });
        }

        return json({ success: true, contacts });
    } catch (e: any) {
        console.error('Contacts API Error:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
