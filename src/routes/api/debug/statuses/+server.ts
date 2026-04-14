import { json } from '@sveltejs/kit';

export const GET = async () => {
    try {
        const globalRef = globalThis as any;
        const statusesMap = globalRef.baileysStatuses;
        const clientsMap = globalRef.baileysClients;
        const locksSet = globalRef.baileysSessionLocks;

        if (!statusesMap) {
            return json({ error: 'Statuses map not found in globalRef' });
        }

        const statusesList = Array.from(statusesMap.entries()).map(([id, s]) => ({ 
            id, 
            ...s,
            hasClient: clientsMap?.has(id) || false,
            hasLock: locksSet?.has(id) || false
        }));

        return json({ 
            success: true,
            statuses: statusesList,
            locks: Array.from(locksSet || []),
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return json({ error: error.message }, { status: 500 });
    }
};
