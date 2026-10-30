// Hong Kong Disneyland's own calendar for our park day: hours, show times, attractions closed.
// usage: node build-dzcal.js 2026-11-16 out.json
const fs=require('fs');
const [date,out]=process.argv.slice(2);
const to24 = s => { const m=String(s).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i); if(!m) return null; let h=+m[1]%12; if(/p/i.test(m[3])) h+=12; return String(h).padStart(2,'0')+':'+m[2] };
(async()=>{
  const r=await fetch(`https://www.hongkongdisneyland.com/finder/api/v1/explorer-service/calendar/hkdl/hkdl;entityType=destination/${date}/day/`,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) hk-trip-planner','Accept':'application/json, text/plain, */*','Accept-Language':'en-US,en;q=0.9'}});
  if(!r.ok) throw new Error('HTTP '+r.status);
  const j=await r.json(), park=(j.locations||[]).find(l=>/theme-park/.test(l.id||l.urlFriendlyId||''));
  if(!park) throw new Error('no park in calendar');
  const hours=((park.schedules||[]).find(s=>s.group==='operating')||{}).schedules?.[date]?.[0]?.time||'';
  const [open,close]=hours.split(/\s+to\s+/i).map(to24);
  const shows=[]; for(const g of park.events||[]) for(const e of g.data||[]){ const times=(e.schedules?.[date]||[]).map(x=>to24(x.time)).filter(Boolean); if(times.length) shows.push({type:g.type, name:e.name.replace(/[“”]/g,'"'), times}) }
  const closed=(park.closedFacilities||[]).filter(f=>!f.refurbishment || f.refurbishment.includes(date)).map(f=>f.name);
  if(!open || !close) throw new Error('no park hours for '+date);
  fs.writeFileSync(out, JSON.stringify({at:new Date().toISOString(), date, open, close, shows, closed}));
  console.log('disney calendar', date, open, close, shows.length, 'shows', closed.length, 'closed');
})().catch(e=>{ console.error('disney calendar failed:', e.message); process.exit(1) });
