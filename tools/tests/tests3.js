// Round 6: random times, random progress and broken or odd live data, hundreds of times over.
(function(){
// never run against the real shared trip data (a page opened with a personal link)
const realData=()=>{ if(S.mode==='shared' || typeof db!=='undefined' && db) throw new Error('หยุด: หน้านี้ต่อกับข้อมูลจริง ทดสอบได้เฉพาะโหมดในเครื่อง') };
const realNow=Date.now.bind(Date), realFetch=window.fetch.bind(window);
const R=[]; let errs=[];
addEventListener('error',e=>errs.push('error: '+(e.message||e)+' @'+(e.lineno||'')));
addEventListener('unhandledrejection',e=>errs.push('promise: '+((e.reason&&e.reason.message)||e.reason)));
const bad=(n,m='')=>R.push({ok:false,n,m:String(m).slice(0,300)}), ok=(n,m='')=>R.push({ok:true,n,m});
const JUNK=/\b(undefined|NaN|\[object Object\]|Infinity)\b|HK\$-|\bnull\b/;
let seed=12345; const rnd=()=>((seed=(seed*16807)%2147483647)/2147483647), pick=a=>a[Math.floor(rnd()*a.length)];
const atT=T=>{ const s=realNow(); Date.now=()=>T+(realNow()-s) };
const T0=Date.parse('2026-11-13T20:00:00+08:00'), T1=Date.parse('2026-11-18T06:00:00+08:00');
function randomDZQ(){
  const r=rnd(); if(r<.15) return null;
  const stale=rnd()<.1, at=Date.now()-(stale?60*60e3:rnd()*5*60e3), allShut=rnd()<.1;
  const m={}; for(const k of Object.keys(DZ_RIDES)){ if(rnd()<.05) continue;   // a ride missing from the feed
    m[k]={open:!allShut && rnd()>.12, w:pick([0,5,10,25,45,90,150,null]), at} }
  return {at, m, food:{}, anyOpen:Object.values(m).some(x=>x.open), rbh:rnd()<.3?null:{open:rnd()>.2,w:pick([0,10,40]),at}, upd:at};
}
window.HKT3={
  async round6(n=400, s=12345){
    realData();
    R.length=0; errs=[]; seed=s; const keep={done:S.done, gps:S.gps, dzq:DZQ, bus:BUS, flight:FLIGHT, warn:WARN, later:S.dzLater, land:S.dzLand};
    const ids=[...S.plan.flat().map(i=>i.id), 'start','4g', ...Object.keys(DZ_RIDES).map(k=>'dz:'+k), 'dz:lunch','dz:dinner','dz:snack'];
    const flights=['Est at 18:40','At gate 17:20','Cancelled','Delayed','','Boarding','Gate Closed','Dep 21:54','Landed 23:55'];
    let renders=0;
    for(let i=0;i<n;i++){
      if(i%10===0){ Date.now=realNow; await new Promise(r=>setTimeout(r,0)) }   // let the page breathe
      atT(T0+rnd()*(T1-T0)); const when=hkNow().date+' '+hhmm(hkNow().min);
      S.done=Object.fromEntries(ids.filter(()=>rnd()<.4).map(id=>[id,{at:hhmm(Math.floor(rnd()*1440)), d:hkNow().date, ...(rnd()<.3?{fare:pick([0,5.4,13.9,22.2])}:{})}]));
      DZQ=randomDZQ(); DZ_MEMO=null; S.dzLater=rnd()<.2?{[pick(Object.keys(DZ_RIDES))]:hkNow().min+45}:{}; S.dzLand=pick(Object.keys(DZ_LANDS));
      S.gps = rnd()<.4 ? null : {ll:[22.15+rnd()*.35, 113.85+rnd()*.45], acc:pick([5,30,300,3000]), at:Date.now()-pick([0,60e3,10*60e3])};
      if(rnd()<.05) BUS=null; else BUS=keep.bus;
      FLIGHT = rnd()<.5 ? {} : {EK384:{at:Date.now(),found:{status:pick(flights),time:'17:40',baggage:'7'}}, EK385:{at:Date.now(),found:{status:pick(flights),time:'20:40',gate:'23'}}};
      WARN = rnd()<.2 ? {at:Date.now(), list:[{code:'TC8NE',lv:'danger',th:'สัญญาณ 8',en:'No. 8'}]} : keep.warn;
      for(const t of ['home','plan','dz','go','money']){
        try{ setTab(t); renders++ }catch(e){ bad(`${when} แท็บ ${t} พัง`, e.stack||e.message); continue }
        const s=(document.querySelector('main')||{}).innerText||''; const m=s.match(JUNK);
        if(m) bad(`${when} แท็บ ${t} มีค่าว่างบนจอ`, s.slice(Math.max(0,m.index-70),m.index+30).replace(/\s+/g,' '));
      }
      if(S.tab!=='dz') setTab('dz');
      try{ const p=dzOptimize(); let last=-1, prob='';
        for(const s of p.steps){ if(!Number.isFinite(s.at)||!Number.isFinite(s.wait)) prob='เวลา/คิวไม่ใช่ตัวเลข'; else if(s.at<last-1) prob='เวลาย้อนหลัง'; last=s.at }
        if(p.skipped && p.skipped.some(k=>DZ_MUST.has(k))) prob+=' ตัดเครื่องห้ามพลาด';
        if(!Number.isFinite(p.end)) prob+=' เวลาจบไม่ใช่ตัวเลข';
        if(prob) bad(`${when} แผน Disney ผิด: ${prob}`, JSON.stringify(p.steps.slice(0,3)));
      }catch(e){ bad(`${when} คำนวณแผน Disney พัง`, e.stack||e.message) }
      try{ const h=alertsHTML()+nextStopHTML()+gpsCardHTML(); if(JUNK.test(h.replace(/<[^>]+>/g,' '))) bad(`${when} การ์ดหน้าแรกมีค่าว่าง`, h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160)) }catch(e){ bad(`${when} การ์ดหน้าแรกพัง`, e.message) }
      for(const kind of ['sos','water','summary']){ try{ openSheet({kind}); const t=document.getElementById('sheet').innerText; if(JUNK.test(t)) bad(`${when} หน้าต่าง ${kind} มีค่าว่าง`, t.slice(0,120)); closeSheet() }catch(e){ bad(`${when} หน้าต่าง ${kind} พัง`, e.message); try{closeSheet()}catch(_){} } }
    }
    Date.now=realNow; Object.assign(S,{done:keep.done, gps:keep.gps, dzLater:keep.later, dzLand:keep.land}); DZQ=keep.dzq; BUS=keep.bus; FLIGHT=keep.flight; WARN=keep.warn; DZ_MEMO=null; setTab('home');
    ok(`สุ่มทดสอบ ${n} สถานการณ์ · แสดงผล ${renders} หน้า`);
    // collapse repeats so the report stays readable
    const seen=new Map(); for(const e of errs) seen.set(e,(seen.get(e)||0)+1); for(const [e,c] of seen) bad('JS error ×'+c, e);
    const byName=new Map(); for(const r of R){ const k=r.ok?r.n:r.n.replace(/^\d{4}-\d\d-\d\d \d\d:\d\d /,''); if(!byName.has(k)) byName.set(k,{...r,n:k,count:0}); byName.get(k).count++ }
    return [...byName.values()];
  }
};
})();
