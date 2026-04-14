
import { statuses } from './src/lib/whatsapp.ts';

console.log('--- LIVE WHATSAPP STATUSES ---');
for (const [id, s] of statuses.entries()) {
    console.log(`[${id}] Status: ${s.status}, Error: ${s.lastError || 'None'}, QR: ${s.qr ? 'Present' : 'None'}`);
}
console.log('------------------------------');
