import { json } from '@sveltejs/kit';
import { getWhatsAppContacts, getWhatsAppConversations } from '$lib/whatsapp';
import * as XLSX from 'xlsx';

export async function GET({ url }) {
    const accountId = url.searchParams.get('accountId');
    const type = url.searchParams.get('type') || 'all'; // 'all' or 'conversations'
    
    if (!accountId) {
        return json({ success: false, error: "AccountId is required" }, { status: 400 });
    }

    try {
        let contacts;
        if (type === 'conversations') {
            contacts = await getWhatsAppConversations(accountId);
        } else {
            contacts = await getWhatsAppContacts(accountId);
        }

        // Prepare data for Excel
        const data = contacts.map((c: any) => ({
            'İsim': c.name,
            'Numara': c.number,
            'ID': c.id,
            'Rehberde Kayıtlı': c.isMyContact ? 'Evet' : 'Hayır'
        }));

        // Create workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kişiler");

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        return new Response(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="whatsapp-kisiler-${accountId}-${type}.xlsx"`
            }
        });

    } catch (e: any) {
        console.error("Export error:", e);
        return json({ success: false, error: e.message }, { status: 500 });
    }
}
