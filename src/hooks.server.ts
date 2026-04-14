import { getSession } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
    const cookieName = dev ? 'session_id_dev' : 'session_id';
	const sessionId = event.cookies.get(cookieName);
	
	if (sessionId) {
		try {
			const session = await getSession(sessionId);
			if (session) {
				event.locals.user = session.user;
			} else {
				event.cookies.delete(cookieName, { path: '/' });
			}
		} catch (error) {
			console.error('Session retrieval failed (retention mode):', error);
			// We DO NOT delete the cookie here because it might be a temporary DB failure.
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
                const { eq, and, or } = await import('drizzle-orm');
                
                // Normalizing path
                let path = event.url.pathname;
                if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);
                const pathWithoutSlash = path.startsWith('/') ? path.slice(1) : path;

                // Default allowed paths
                const publicPaths = ['/hesabim', '/logout', '/ayarlar', '/unauthorized'];
                const isPublic = publicPaths.some(p => path.startsWith(p));
                
                const [dbPermission] = await remoteDb.select()
                    .from(rolePermissions)
                    .where(
                        and(
                            eq(rolePermissions.role, userRole), 
                            or(
                                eq(rolePermissions.resource, path),
                                eq(rolePermissions.resource, pathWithoutSlash)
                            )
                        )
                    )
                    .limit(1);
                
                if (dbPermission) {
                    if (!dbPermission.canAccess) {
                        console.warn(`[Hook] Access DENIED for role ${userRole} to ${path}`);
                        throw redirect(303, '/unauthorized');
                    }
                } else if (!isPublic) {
                    console.warn(`[Hook] No record found. Default DENY for role ${userRole} to ${path}`);
                    throw redirect(303, '/unauthorized');
                }
            } catch (e: any) {
                if (e.status === 303 || e.status === 302 || e.status === 307) throw e;
                console.error('Permission check error:', e);
            }
        }
    }
	
	if (isAuthPage && event.locals.user) {
		throw redirect(303, '/');
	}
	
	const response = await resolve(event);
	return response;
};
