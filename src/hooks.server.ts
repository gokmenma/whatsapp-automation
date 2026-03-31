import { getSession } from '$lib/server/auth';
import { redirect, type HandleServerError } from '@sveltejs/kit';

export const handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('session_id');
	
	if (sessionId) {
		const session = await getSession(sessionId);
		if (session) {
			event.locals.user = session.user;
		} else {
			event.cookies.delete('session_id', { path: '/' });
		}
	}
	
	const isAuthPage = event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/register');
	const isDashboard = event.url.pathname === '/' || event.url.pathname.startsWith('/mesaj-gonder') || event.url.pathname.startsWith('/mesajlar') || event.url.pathname.startsWith('/hesaplar') || event.url.pathname.startsWith('/ayarlar');
	
	if (isDashboard && !event.locals.user) {
		throw redirect(303, '/login');
	}
	
	if (isAuthPage && event.locals.user) {
		throw redirect(303, '/');
	}
	
	const response = await resolve(event);
	return response;
};

export const handleError: HandleServerError = ({ error, event }) => {
	console.error('Server error at:', event.url.pathname, error);
	
	const message = error instanceof Error ? error.message : 'Bilinmeyen bir sunucu hatası oluştu';
	
	return {
		message,
		code: (error as any)?.code ?? 'INTERNAL_SERVER_ERROR'
	};
};
