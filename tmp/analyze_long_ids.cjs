const fs=require('fs');
const p='.baileys_auth/store-52866083-dac3-4c85-ad7c-7c96af6b797a.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const contacts=(d.contacts||[]).map(([k,v])=>v||{});
const ids=contacts.map(c=>String(c.id||'')).filter(Boolean);
const direct=ids.filter(id=>id.endsWith('@s.whatsapp.net'));
const lidSet=new Set(ids.filter(id=>id.endsWith('@lid')).map(id=>id.split('@')[0].replace(/\D/g,'')));
let sample=[];
for(const id of direct){
  const num=id.split('@')[0].replace(/\D/g,'');
  if(num.length>=15){
    const c=contacts.find(x=>String(x.id||'')===id)||{};
    sample.push({id,name:c.name||c.notify||c.pushName||'',hasLidPair:lidSet.has(num)});
  }
}
console.log('longDirectCount',sample.length);
console.log('withLidPair',sample.filter(x=>x.hasLidPair).length);
console.log('withoutName',sample.filter(x=>!x.name).length);
console.log(sample.slice(0,25));
