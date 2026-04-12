import { json, error } from '@sveltejs/kit';
import { markConversationAsReadOnWhatsApp } from '$lib/whatsapp';

export async function POST({ request, locals }) {
    if (!locals.user) throw error(401, 'Unauthorized');

    try {
        const { accountId, contactJid } = await request.json();

        if (!accountId || !contactJid) {
            return json({ success: false, error: 'accountId and contactJid are required' }, { status: 400 });
        }

        // Background task to mark as read on WhatsApp and update DB
        // We don't necessarily need to wait for the WhatsApp receipt to succeed 
        // to respond to the UI, but we'll await it for reliability here.
        await markConversationAsReadOnWhatsApp(accountId, [contactJid]);

        return json({ success: true });
    } catch (e: any) {
        console.error('Mark Read API Error:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
