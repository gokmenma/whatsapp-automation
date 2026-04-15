(async () => {
  const accountId='52866083-dac3-4c85-ad7c-7c96af6b797a';
  const res = await fetch(`http://localhost:5173/api/whatsapp/contacts?accountId=${accountId}`);
  const data = await res.json();
  const bad = (data.contacts||[]).filter(c=>{ const n=String(c.number||'').replace(/\D/g,''); return !c.isGroup && n.length>=15 && String(c.name||'').trim()===n; });
  console.log('genericLongDirect', bad.length);
  console.log(bad.slice(0,20));
})();
