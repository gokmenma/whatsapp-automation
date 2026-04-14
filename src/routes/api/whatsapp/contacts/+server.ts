import { json } from '@sveltejs/kit';
import { getWhatsAppContacts, initializeWhatsApp, getAccountStatus } from '$lib/whatsapp';

export async function GET({ url }) {
    const accountId = url.searchParams.get('accountId');
    const refresh = url.searchParams.get('refresh') === 'true';
    
    if (!accountId) {
        return json({ success: false, error: "AccountId is required" }, { status: 400 });
    }

    try {
        const liveStatus = getAccountStatus(accountId);
        
        if (refresh) {
            console.log(`[API] Manual refresh requested for account=${accountId}`);
            const { resyncWhatsAppAccount } = await import('$lib/whatsapp');
            // We don't force history sync unless explicitly requested elsewhere, 
            // but resyncWhatsAppAccount(accountId, false) will restart the connection which triggers contact sync.
            await resyncWhatsAppAccount(accountId, false);
            // Wait a tiny bit for the connection to re-establish and events to fire
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (liveStatus.status === 'disconnected') {
            console.log(`[API] Account ${accountId} is disconnected, attempting auto-initialization for contacts...`);
            initializeWhatsApp(accountId).catch(console.error);
        }

        const contacts = await getWhatsAppContacts(accountId);
        
        if (contacts.length === 0 && (liveStatus.status === 'connecting' || liveStatus.status === 'loading')) {
            return json({ success: true, contacts: [], message: "Rehber senkronize ediliyor..." });
        }

        return json({ success: true, contacts });
    } catch (e: any) {
        console.error('Contacts API Error:', e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
