import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { deleteSession } from '$lib/server/auth';

export const load = async ({ cookies }) => {
    const isDev = dev;
    const cookieName = isDev ? 'session_id_dev' : 'session_id';
    const sessionId = cookies.get(cookieName);
    
    if (sessionId) {
        try {
            await deleteSession(sessionId);
        } catch (e) {
            console.error('[Logout] Session deletion error:', e);
        }
        cookies.delete(cookieName, { path: '/' });
    }
    
    throw redirect(303, '/login');
};

export const actions = {
    default: async ({ cookies }) => {
        const isDev = dev;
        const cookieName = isDev ? 'session_id_dev' : 'session_id';
        const sessionId = cookies.get(cookieName);
        
        if (sessionId) {
            try {
                await deleteSession(sessionId);
            } catch (e) {
                console.error('[Logout] Session deletion error:', e);
            }
            cookies.delete(cookieName, { path: '/' });
        }
        
        throw redirect(303, '/login');
    }
};
