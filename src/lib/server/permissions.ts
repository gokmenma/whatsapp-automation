import { remoteDb } from './db';
import { rolePermissions } from './db/remote-schema';
import { eq, and } from 'drizzle-orm';

export async function hasPermission(user: any, resource: string): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'superadmin') return true;

    try {
        const [permission] = await remoteDb.select()
            .from(rolePermissions)
            .where(and(
                eq(rolePermissions.role, user.role),
                eq(rolePermissions.resource, resource)
            ))
            .limit(1);

        return !!(permission && permission.canAccess);
    } catch (error) {
        console.error(`Permission check error for ${resource}:`, error);
        return false;
    }
}
