const fs=require('fs');
const p='.baileys_auth/store-52866083-dac3-4c85-ad7c-7c96af6b797a.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const contacts=new Map(d.contacts||[]);
const chats=new Map(d.chats||[]);
for (const n of ['231958986641581','253206122725493']) {
  const jid=`${n}@s.whatsapp.net`;
  const c=contacts.get(jid) || null;
  const ch=chats.get(jid) || null;
  console.log('---',jid);
  console.log('contact',c);
  console.log('chat',ch);
}
