const fs=require('fs');
const path=require('path');
const dir='.baileys_auth';
const files=fs.readdirSync(dir).filter(f=>f.startsWith('store-')&&f.endsWith('.json'));
for(const f of files){
  const full=path.join(dir,f);
  let d;
  try{ d=JSON.parse(fs.readFileSync(full,'utf8')); }catch{ continue; }
  const contacts=(d.contacts||[]).map(([k,v])=>v||{});
  const chats=(d.chats||[]).map(([k,v])=>v||{});
  const longContacts=contacts.filter(c=>String(c.id||'').endsWith('@s.whatsapp.net') && String(c.id||'').split('@')[0].replace(/\D/g,'').length>=15);
  const longChats=chats.filter(c=>String(c.id||'').endsWith('@s.whatsapp.net') && String(c.id||'').split('@')[0].replace(/\D/g,'').length>=15);
  if(longContacts.length || longChats.length){
    console.log('FILE',f,'longContacts',longContacts.length,'longChats',longChats.length);
    console.log(' sampleContact', longContacts.slice(0,3).map(c=>c.id));
    console.log(' sampleChat', longChats.slice(0,5).map(c=>c.id));
  }
}
