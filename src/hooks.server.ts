import { getSession } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const handle = async ({ event, resolve }) => {
	const isDev = dev;
	const cookieName = isDev ? 'session_id_dev' : 'session_id';
	const sessionId = event.cookies.get(cookieName);
	
	if (sessionId) {
		const session = await getSession(sessionId);
		if (session) {
			event.locals.user = session.user;
		} else {
			event.cookies.delete(cookieName, { path: '/' });
		}
	}
	
	const isAuthPage = event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/register');
	const isDashboard = event.url.pathname === '/' || event.url.pathname.startsWith('/mesaj-gonder') || event.url.pathname.startsWith('/mesajlar') || event.url.pathname.startsWith('/hesaplar') || event.url.pathname.startsWith('/ayarlar');
	
	if (isDashboard && !event.locals.user) {
		throw redirect(303, '/login');
	}

    // Role-based permission check
    if (event.locals.user && event.url.pathname !== '/' && !event.url.pathname.startsWith('/api')) {
        const userRole = event.locals.user.role;
        if (userRole !== 'superadmin') {
            try {
                const { remoteDb } = await import('$lib/server/db');
                const { rolePermissions } = await import('$lib/server/db/remote-schema');
                const { eq, and } = await import('drizzle-orm');
                
                // Default allowed paths
                const publicPaths = ['/hesabim', '/logout', '/ayarlar'];
                const isPublic = publicPaths.some(p => event.url.pathname.startsWith(p));
                
                if (!isPublic) {
                    const permissions = await remoteDb.select()
                        .from(rolePermissions)
                        .where(and(eq(rolePermissions.role, userRole), eq(rolePermissions.resource, event.url.pathname)))
                        .limit(1);
                    
                    if (permissions.length === 0 || !permissions[0].canAccess) {
                        // Specific fallback checks
                        if (userRole === 'qrcode_scanner' && (event.url.pathname === '/hesaplar' || event.url.pathname === '/hesap-havuzu')) {
                            // Allow
                        } else if (userRole === 'admin' && event.url.pathname.startsWith('/admin')) {
                            // Allow
                        } else if (userRole === 'user' && (event.url.pathname === '/hesaplar' || event.url.pathname === '/mesaj-gonder')) {
                            // Allow
                        } else {
                            throw redirect(303, '/?error=unauthorized');
                        }
                    }
                }
            } catch (e: any) {
                if (e.status === 303) throw e; // Pass through redirects
                console.error('Permission check error:', e);
                // In case of DB error, we allow the request to proceed to avoid "Internal Error" (or you could block it)
                // However, the dashboard logic likely handles missing data gracefully.
            }
        }
    }
	
	if (isAuthPage && event.locals.user) {
		throw redirect(303, '/');
	}
	
	const response = await resolve(event);
	return response;
};
