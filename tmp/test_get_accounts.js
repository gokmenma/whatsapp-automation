
import { getAllAccounts } from '../src/lib/whatsapp.ts';
import Database from 'better-sqlite3';
const dbAccounts = [
  { id: '19dc2193-0b5f-4c24-9c9e-93561e29dcf9', name: 'Sendika' },
  { id: 'fe40f459-78b7-4c9d-a62e-b81387c8baf6', name: 'Kendi Hesabım' }
];

async function test() {
    try {
        const results = await getAllAccounts(dbAccounts);
        console.log("getAllAccounts results:", JSON.stringify(results, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
