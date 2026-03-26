import { json } from '@sveltejs/kit';
import { getLogs } from '$lib/whatsapp';

export const GET = async () => {
    return json({ logs: getLogs() });
};
