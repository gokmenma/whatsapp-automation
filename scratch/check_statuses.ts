
import { statuses } from '../src/lib/whatsapp';

async function main() {
    console.log('--- Account Statuses ---');
    console.log(JSON.stringify(Array.from((globalThis as any).baileysStatuses.entries()), null, 2));
    console.log('--- Client IDs ---');
    console.log(JSON.stringify(Array.from((globalThis as any).baileysClients.keys()), null, 2));
    console.log('--- Session Locks ---');
    console.log(JSON.stringify(Array.from((globalThis as any).baileysSessionLocks), null, 2));
    process.exit(0);
}

main().catch(console.error);
