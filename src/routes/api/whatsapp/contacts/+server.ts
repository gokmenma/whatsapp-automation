import { json } from '@sveltejs/kit';
import { getWhatsAppContacts } from '$lib/whatsapp';

export async function GET({ url }) {
    const accountId = url.searchParams.get('accountId');
    
    if (!accountId) {
        return json({ success: false, error: "AccountId is required" }, { status: 400 });
    }

    try {
        const contacts = await getWhatsAppContacts(accountId);
        return json({ success: true, contacts });
    } catch (e: any) {
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
