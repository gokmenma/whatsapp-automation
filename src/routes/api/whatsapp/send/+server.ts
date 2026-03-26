import { json } from '@sveltejs/kit';
import { sendWhatsAppMessage } from '$lib/whatsapp';

export const POST = async ({ request }) => {
    try {
        const { accountId, to, message, media } = await request.json();
        
        if (!accountId || !to || !message) {
            return json({ success: false, error: 'Hesap, numara ve mesaj gereklidir.' }, { status: 400 });
        }

        const result = await sendWhatsAppMessage(accountId, to, message, media);
        return json(result);
    } catch (e: any) {
        console.error('API Send Message Error:', e);
        return json({ success: false, error: e.message || 'Mesaj gönderilemedi' }, { status: 500 });
    }
};
