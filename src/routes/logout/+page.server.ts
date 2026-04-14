import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { deleteSession } from '$lib/server/auth';

export const load = async ({ cookies }) => {
    const cookieName = dev ? 'session_id_dev' : 'session_id';
    const sessionId = cookies.get(cookieName);
    
    if (sessionId) {
        await deleteSession(sessionId);
        cookies.delete(cookieName, { path: '/' });
    }
    
    throw redirect(303, '/login');
};

export const GET = async ({ cookies }) => {
    const cookieName = dev ? 'session_id_dev' : 'session_id';
    const sessionId = cookies.get(cookieName);
    
    if (sessionId) {
        await deleteSession(sessionId);
        cookies.delete(cookieName, { path: '/' });
    }
    
    throw redirect(303, '/login');
};
