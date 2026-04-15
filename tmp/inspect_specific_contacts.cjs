(async () => {
  const accountId='52866083-dac3-4c85-ad7c-7c96af6b797a';
  const res = await fetch(`http://localhost:5173/api/whatsapp/contacts?accountId=${accountId}`);
  const data = await res.json();
  const rows = (data.contacts||[]).filter(c=>String(c.number||'').startsWith('231958986641581')||String(c.number||'').startsWith('253206122725493'));
  console.log(rows);
})();
