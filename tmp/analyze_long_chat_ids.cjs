const fs=require('fs');
const p='.baileys_auth/store-52866083-dac3-4c85-ad7c-7c96af6b797a.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const contacts=(d.contacts||[]).map(([k,v])=>v||{});
const chats=(d.chats||[]).map(([k,v])=>v||{});
const lidSet=new Set(contacts.map(c=>String(c.id||'')).filter(id=>id.endsWith('@lid')).map(id=>id.split('@')[0].replace(/\D/g,'')));
const rows=[];
for(const c of chats){
  const id=String(c.id||'');
  if(!id.endsWith('@s.whatsapp.net')) continue;
  const num=id.split('@')[0].replace(/\D/g,'');
  if(num.length>=15){
    const contact=contacts.find(x=>String(x.id||'')===id)||{};
    rows.push({id,name:contact.name||contact.notify||contact.pushName||c.name||c.notify||c.pushName||'',hasLidPair:lidSet.has(num)});
  }
}
console.log('longChatCount',rows.length);
console.log('withLidPair',rows.filter(x=>x.hasLidPair).length);
console.log('withoutName',rows.filter(x=>!x.name).length);
console.log(rows.slice(0,30));
