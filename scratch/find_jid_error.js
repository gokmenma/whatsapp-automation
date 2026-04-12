import fs from 'fs';
const content = fs.readFileSync('src/lib/whatsapp.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('numberToJid') && !line.includes('store.') && !line.includes('currentStore.') && !line.includes('const ') && !line.includes('let ') && !line.includes('numberToJid:') && !line.includes('(store as any).')) {
        console.log(`Line ${i+1}: ${line.trim()}`);
    }
});
