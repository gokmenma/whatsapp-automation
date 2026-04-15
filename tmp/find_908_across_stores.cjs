const fs=require('fs');
const path=require('path');
const dir='.baileys_auth';
const files=fs.readdirSync(dir).filter(f=>f.startsWith('store-')&&f.endsWith('.json'));
for(const f of files){
  const full=path.join(dir,f);
  let d;
  try{ d=JSON.parse(fs.readFileSync(full,'utf8')); }catch{ continue; }
  const contacts=(d.contacts||[]).map(([k,v])=>v||{});
  const hit=contacts.find(c=>String(c.id||'')==='908502235909@s.whatsapp.net');
  if(hit){
    console.log('FILE',f,'CONTACT',JSON.stringify(hit));
  }
}
