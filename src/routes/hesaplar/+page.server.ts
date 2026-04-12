import { redirect } from '@sveltejs/kit';
import { remoteDb } from '$lib/server/db';
import { rolePermissions } from '$lib/server/db/remote-schema';
import { eq, and } from 'drizzle-orm';

export const load = async ({ locals, url }) => {
    if (!locals.user) throw redirect(303, '/login');

    if (locals.user.role !== 'superadmin') {
        const [dbPermission] = await remoteDb.select()
            .from(rolePermissions)
            .where(and(eq(rolePermissions.role, locals.user.role), eq(rolePermissions.resource, '/hesaplar')))
            .limit(1);

        if (!dbPermission || !dbPermission.canAccess) {
            throw redirect(303, '/unauthorized');
        }
    }

    return {};
};
