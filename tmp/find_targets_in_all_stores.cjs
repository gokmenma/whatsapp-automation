const fs=require('fs');
const path=require('path');
const targets=['231958986641581','253206122725493'];
const dir='.baileys_auth';
for(const f of fs.readdirSync(dir).filter(x=>x.startsWith('store-')&&x.endsWith('.json'))){
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  const arr=[...(d.contacts||[]),...(d.chats||[])].map(([k,v])=>v||{});
  const hits=arr.filter(o=>targets.some(t=>JSON.stringify(o).includes(t)));
  if(hits.length){
    console.log('FILE',f,'hits',hits.length);
    console.log(hits.slice(0,8));
  }
}
