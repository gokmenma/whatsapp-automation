
import { json } from '@sveltejs/kit';
import { getAccountStatus, getAllAccounts } from '$lib/whatsapp';
import { db } from '$lib/server/db';
import { accounts } from '$lib/server/db/schema';

export const GET = async ({ url }) => {
    const { WHATSAPP_LIB_VERSION, stopWhatsApp, initializeWhatsApp } = await import('$lib/whatsapp');
    const restartId = url.searchParams.get('restart');
    if (restartId) {
        await stopWhatsApp(restartId);
        await new Promise(r => setTimeout(r, 1000));
        await initializeWhatsApp(restartId);
        return json({ success: true, restarted: restartId, version: WHATSAPP_LIB_VERSION });
    }

    const storedAccounts = await db.select().from(accounts);
    const statuses = await getAllAccounts(storedAccounts);
    return json({ statuses, version: WHATSAPP_LIB_VERSION });
};
