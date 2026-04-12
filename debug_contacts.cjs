const fs = require('fs');
const path = require('path');

const accountId = '9c98420b-4908-4f04-8e99-33a29de888ac';
const storePath = path.join('.baileys_auth', `store-${accountId}.json`);

if (fs.existsSync(storePath)) {
    const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
    console.log(`--- Contacts for Mehmet (${accountId}) ---`);
    const targetJid = '122553083379885@s.whatsapp.net';
    const contact = data.contacts.find(c => c[0] === targetJid);
    if (contact) {
        console.log('Match found by JID:');
        console.log(JSON.stringify(contact[1], null, 2));
    } else {
        console.log('No direct match for ' + targetJid);
        // Search by LID
        const contactByLid = data.contacts.find(c => c[1].lid === '122553083379885@lid' || c[0].split('@')[0] === '122553083379885');
        if (contactByLid) {
            console.log('Match found by LID/Search:');
            console.log(JSON.stringify(contactByLid[1], null, 2));
        }
    }
} else {
    console.log('Store file not found: ' + storePath);
}
