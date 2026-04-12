import { json } from '@sveltejs/kit';
import { remoteDb } from '$lib/server/db';
import { rolePermissions, resources } from '$lib/server/db/remote-schema';
import { eq, and, asc } from 'drizzle-orm';

export const GET = async ({ locals }) => {
    if (!locals.user || locals.user.role !== 'superadmin') {
        return json({ error: 'Yetkiniz yok' }, { status: 403 });
    }

    try {
        const [perms, resList] = await Promise.all([
            remoteDb.select().from(rolePermissions).execute(),
            remoteDb.select().from(resources).orderBy(asc(resources.sortOrder)).execute()
        ]);
        return json({ permissions: perms, resources: resList });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};

export const POST = async ({ locals, request }) => {
    if (!locals.user || locals.user.role !== 'superadmin') {
        return json({ error: 'Yetkiniz yok' }, { status: 403 });
    }

    try {
        const body = await request.json();
        
        // Handle Reordering
        if (body.action === 'reorder') {
            const { orders } = body;
            for (const item of orders) {
                await remoteDb.update(resources)
                    .set({ sortOrder: item.sortOrder })
                    .where(eq(resources.id, item.id));
            }
            return json({ success: true });
        }

        // Handle Resource Creation/Update
        if (body.action === 'upsertResource') {
            const { path, name, icon, id, category } = body;
            if (id) {
                await remoteDb.update(resources).set({ path, name, icon, category }).where(eq(resources.id, id));
            } else {
                await remoteDb.insert(resources).values({ path, name, icon, category: category || 'page' });
            }
            return json({ success: true });
        }

        // Handle Permission Toggle
        const { role, resource, canAccess } = body;
        const existing = await remoteDb.select().from(rolePermissions)
            .where(and(eq(rolePermissions.role, role), eq(rolePermissions.resource, resource)))
            .limit(1);

        if (existing.length > 0) {
            await remoteDb.update(rolePermissions)
                .set({ canAccess: canAccess ? 1 : 0 })
                .where(eq(rolePermissions.id, existing[0].id));
        } else {
            await remoteDb.insert(rolePermissions).values({
                role,
                resource,
                canAccess: canAccess ? 1 : 0
            });
        }

        return json({ success: true });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};

export const DELETE = async ({ locals, request }) => {
    if (!locals.user || locals.user.role !== 'superadmin') {
        return json({ error: 'Yetkiniz yok' }, { status: 403 });
    }

    try {
        const { id, path } = await request.json();
        if (id) {
            await remoteDb.delete(resources).where(eq(resources.id, id));
            // Also clean up permissions for this path if provided
            if (path) {
                await remoteDb.delete(rolePermissions).where(eq(rolePermissions.resource, path));
            }
        }
        return json({ success: true });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};
