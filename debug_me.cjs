const fs = require('fs');
const path = require('path');

const accountId = 'a6179994-071c-4992-9a4c-f2e165ae3f14';
const sessionPath = path.join('.baileys_auth', `session-${accountId}`, 'creds.json');

if (fs.existsSync(sessionPath)) {
    const creds = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    console.log('--- Account Own Info ---');
    console.log(JSON.stringify(creds.me, null, 2));
} else {
    console.log('Creds file not found: ' + sessionPath);
}
