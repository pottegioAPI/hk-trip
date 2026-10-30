// Trip-app simulation tests. Loaded into the running app page; results come back as a list.
(function(){
// never run against the real shared trip data (a page opened with a personal link)
const realData=()=>{ if(S.mode==='shared' || typeof db!=='undefined' && db) throw new Error('หยุด: หน้านี้ต่อกับข้อมูลจริง ทดสอบได้เฉพาะโหมดในเครื่อง') };
const realNow=Date.now.bind(Date), realFetch=window.fetch.bind(window);
const R=[]; let errs=[];
const ok=(n,m='')=>R.push({ok:true,n,m}), bad=(n,m='')=>R.push({ok:false,n,m:String(m).slice(0,300)});
const check=(cond,n,m)=>cond?ok(n):bad(n,m);
addEventListener('error',e=>errs.push('error: '+(e.message||e)+' @'+(e.lineno||'')));
addEventListener('unhandledrejection',e=>errs.push('promise: '+((e.reason&&e.reason.message)||e.reason)));
const ce=console.error; console.error=(...a)=>{ errs.push('console: '+a.map(String).join(' ').slice(0,200)); ce(...a) };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function at(iso){ const T=Date.parse(iso), s=realNow(); Date.now=()=>T+(realNow()-s) }
function clock(){ Date.now=realNow }
const vis = el => el && el.innerText || '';
// text that should never reach the screen
function junk(where){ const txt=vis(document.querySelector('main'))+' '+vis(document.getElementById('sheet')); const m=txt.match(/\b(undefined|NaN|\[object Object\]|Infinity)\b|HK\$-|null\b/); return m?`${where}: "${txt.slice(Math.max(0,m.index-50),m.index+30).replace(/\s+/g,' ')}"`:null }
function overflow(where){ const out=[]; document.querySelectorAll('main .wrap *, #sheet *').forEach(el=>{ if(el.closest('.places,.tmwrap,.lpick,svg,.chout')) return; const r=el.getBoundingClientRect(); if(r.width>0 && r.right>innerWidth+2 && getComputedStyle(el).position!=='fixed') out.push(el.className||el.tagName) }); return out.length?`${where}: ${[...new Set(out)].slice(0,4).join(', ')}`:null }
function renderAllViews(tag){
  const probs=[];
  for(const t of ['home','plan','go','dz','money']){ try{ setTab(t) }catch(e){ probs.push(`${tag} tab ${t}: ${e.message}`) } const j=junk(tag+' '+t); if(j) probs.push(j); const o=overflow(tag+' '+t); if(o) probs.push('ล้นจอ '+o) }
  for(let d=1;d<=4;d++){ try{ S.day=d; S.compact=false; for(const it of dayItems(d)){ S.ghOpen.add(it.id); S.routeOn.add(it.id) } setTab('plan') }catch(e){ probs.push(`${tag} plan day ${d}: ${e.message}`) } const j=junk(`${tag} plan day ${d}`); if(j) probs.push(j) }
  for(const sh of [{kind:'water'},{kind:'sos'},{kind:'fun'},{kind:'add'},{kind:'set'}]){ try{ if(sh.kind==='fun'){ for(const f of ['color','stamp']){ S.funTab=f; openSheet(sh); const j=junk(tag+' sheet fun '+f); if(j) probs.push(j); closeSheet() } } else { openSheet(sh); const j=junk(tag+' sheet '+sh.kind); if(j) probs.push(j); closeSheet() } }catch(e){ probs.push(`${tag} sheet ${sh.kind}: ${e.message}`); try{closeSheet()}catch(_){} } }
  try{ setTab('home'); document.getElementById('hotelbtn').click(); const j=junk(tag+' hotel'); if(j) probs.push(j); closeSheet() }catch(e){ probs.push(tag+' hotel: '+e.message) }
  return probs;
}
const TIMES=[['13 พ.ย. ก่อนบิน','2026-11-13T04:00:00Z'],['14 พ.ย. 17:30 ลงเครื่อง','2026-11-14T09:30:00Z'],['14 พ.ย. 21:00','2026-11-14T13:00:00Z'],['15 พ.ย. 08:00','2026-11-15T00:00:00Z'],['15 พ.ย. 13:45','2026-11-15T05:45:00Z'],['15 พ.ย. 23:55','2026-11-15T15:55:00Z'],['16 พ.ย. 00:50','2026-11-15T16:50:00Z'],['16 พ.ย. 10:30 Disney','2026-11-16T02:30:00Z'],['16 พ.ย. 21:10','2026-11-16T13:10:00Z'],['17 พ.ย. 09:00','2026-11-17T01:00:00Z'],['17 พ.ย. 16:45','2026-11-17T08:45:00Z'],['18 พ.ย. หลังทริป','2026-11-18T04:00:00Z']];
const SPOTS={MongKok:[22.3193,114.1694],TST:[22.2950,114.1720],Central:[22.2820,114.1580],KennedyTown:[22.2836,114.1290],Stanley:[22.2186,114.2133],Disney:[22.3133,114.0410],TungChung:[22.2890,113.9410],Airport:[22.3155,113.9365],WongTaiSin:[22.3420,114.1937],ShaTin:[22.3770,114.1870],Repulse:[22.2368,114.1963]};

window.HKT = {
  // round 1: every stop of every day, at many times of day
  async round1(){
    realData();
    R.length=0; errs=[];
    for(let d=1;d<=4;d++) for(const it of dayItems(d)){
      const {prev,opts}=optionsFor(d,it), sel=opts.length?chosen(d,it,opts):null, tag=`วัน ${d} ${it.h}`;
      if(prev && !prev.flight && targetLL(it) && !opts.length) bad(tag+' ไม่มีวิธีเดินทาง');
      for(const o of opts){ if(o.fare!=null && !(o.fare>=0)) bad(tag+' ค่ารถผิด', o.n+' '+o.fare); if(o.mins!=null && !(o.mins>0)) bad(tag+' เวลาเดินทางผิด', o.n+' '+o.mins);
        if(o.legs){ const f=mtrFare(o.legs[0].from, o.legs[o.legs.length-1].to); if(f!==o.fare) bad(tag+' ค่า MTR ไม่ตรงตาราง', o.fare+' vs '+f);
          const h=stepsHTML(o.legs,'A','B',locOf(it)); if(/undefined|NaN/.test(h)) bad(tag+' ขั้นตอน MTR มีค่าว่าง', h.slice(0,120)) }
        if(o.bx){ const h=busSteps(o.bx); if(/undefined|NaN/.test(h)) bad(tag+' ขั้นตอนบัสมีค่าว่าง', o.n) } }
      if(it.st){ const x=exitFor(it); if(!x) bad(tag+' ไม่มี Exit'); else if(x.src!=='official' && OFFICIAL_EXITS[it.id]) bad(tag+' Exit ไม่ใช่ทางการ', x.ref) }
      if(sel) ok(tag+' → '+sel.n+(sel.fare!=null?' HK$'+sel.fare:''));
    }
    const saveDone=S.done, saveGps=S.gps;
    for(const [name,iso] of TIMES){
      at(iso); S.done={}; const td=tripDay();
      // mark everything before "now" as done, like a real day
      if(td){ for(let d=1;d<=td;d++) for(const it of dayItems(d)) if(d<td || toMin(it.t)<=hkNow().min) S.done[it.id]={at:it.t} }
      const probs=renderAllViews(name); probs.forEach(p=>bad('แสดงผล',p));
      const nx=nextStopHTML().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      const al=alertsHTML().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      ok(`${name}: การ์ดถัดไป = ${nx.slice(0,70)||'(ไม่มี)'}${al?' | แจ้งเตือน: '+al.slice(0,90):''}`);
      if(td){ for(const [sp,ll] of Object.entries(SPOTS)){ S.gps={ll, acc:20, at:Date.now()}; let h=''; try{ h=gpsCardHTML()+alertsHTML(); const r=navRoutes(planSpot(), hotelSpot()); if(metres(ll,HOTEL_LL)>800 && !r.some(o=>o.mode!=='taxi' && o.mode!=='walk')) bad(`${name} GPS ${sp}: ไม่มีทางกลับที่พักด้วยรถสาธารณะ`); if(r.some(o=>o.fare!=null&&!(o.fare>=0) || o.mins!=null&&!(o.mins>0))) bad(`${name} GPS ${sp}: ค่ารถ/เวลาผิด`) }catch(e){ bad(`${name} GPS ${sp}`, e.message) } if(/undefined|NaN/.test(h)) bad(`${name} GPS ${sp} ข้อความมีค่าว่าง`, h.replace(/<[^>]+>/g,' ').slice(0,160)) } S.gps=null }
    }
    // last train home from where each night ends
    for(const [iso,sp,expect] of [['2026-11-15T15:55:00Z','KennedyTown','ก่อน'],['2026-11-15T16:50:00Z','KennedyTown','ออกไปแล้ว'],['2026-11-16T15:30:00Z','Disney','ก่อน'],['2026-11-16T16:30:00Z','Disney','ออกไปแล้ว']]){
      at(iso); S.gps={ll:SPOTS[sp],acc:15,at:Date.now()}; const al=alertsHTML().replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      check(al.includes('รถไฟเที่ยวสุดท้าย') && al.includes(expect), `รถไฟเที่ยวสุดท้าย ${sp} ${iso.slice(11,16)}Z`, al.slice(0,160)) }
    S.gps=saveGps; S.done=saveDone; clock(); setTab('home');
    errs.forEach(e=>bad('JS error',e)); return R.slice();
  },
  // round 3: things going wrong
  async round3(){
    realData();
    R.length=0; errs=[]; const saveW=WARN, saveQ=DZQ, saveDone=S.done;
    // 1 typhoon T8 + black rain
    WARN={at:Date.now(), list:[{code:'TC8NE',lv:'danger',th:WARN_TH.TC8NE[1],en:'No. 8 Northeast Gale or Storm Signal'},{code:'WRAINB',lv:'danger',th:WARN_TH.WRAINB[1],en:'Black Rainstorm'}]};
    setTab('home'); check(document.querySelectorAll('.wn.danger').length===2,'เตือน T8 + ฝนดำ แสดงสีแดง 2 แถบ');
    WARN=saveW;
    // 2 live services down
    window.fetch=(u,o)=>/rt\.data\.gov\.hk|etabus|functions\/v1|weather\.gov/.test(String(u))?Promise.reject(new TypeError('Failed to fetch')):realFetch(u,o);
    const C=NET.byCode; LIVE.set('t1',{mtr:['TWL',C.MOK,C.TST]}); const div=document.createElement('div'); div.id='t1'; document.body.appendChild(div);
    await liveShow('t1'); check(/ดึงข้อมูลไม่สำเร็จ|ไม่มีเน็ต/.test(div.innerText),'MTR สดล่ม แอปบอกข้อความแทนพัง', div.innerText);
    const bx=busRoutes(SPOTS.Repulse,SPOTS.Central,{dow:6,min:900})[0]; LIVE.set('t2',{bus:bx}); div.id='t2'; await liveShow('t2'); check(/ดึงข้อมูลไม่สำเร็จ|ไม่มีเน็ต|หาป้าย/.test(div.innerText),'บัสสดล่ม แอปบอกข้อความแทนพัง', div.innerText); div.remove();
    await dzQueueFetch(true); await warnFetch(); window.fetch=realFetch; ok('Disney/เตือนอากาศ ล่มแล้วไม่พัง');
    // 3 Disney: everything closed / all ridden
    DZQ={at:Date.now(), anyOpen:true, m:Object.fromEntries(Object.keys(DZ_RIDES).map(k=>[k,{open:false,w:0,at:Date.now()}]))};
    let h=dzSmartHTML(); check(!/undefined|NaN/.test(h),'Disney ปิดทุกเครื่องไม่พัง');
    DZQ=saveQ; S.done={...S.done, ...Object.fromEntries(Object.keys(DZ_RIDES).map(k=>['dz:'+k,{at:'12:00'}]))}; h=dzSmartHTML(); check(!/class="dzok" data-dz="/.test(h) && (h.match(/dzstep played/g)||[]).length===Object.keys(DZ_RIDES).length,'Disney เล่นครบทุกเครื่อง (ไม่มีเครื่องค้างในเส้นทาง ทุกเครื่องเป็นสีเทา)'); S.done=saveDone;
    // 4 a stop with no place / odd names
    const day=S.plan[1], extra={id:'tX', t:'16:00', h:'ร้าน "ลับ" <b>&</b> ชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆ'};
    S.plan[1]=[...day, extra]; try{ S.day=2; setTab('plan'); const j=junk('จุดไม่มีตำแหน่ง'); check(!j,'จุดที่ไม่มีตำแหน่ง/ชื่อแปลกไม่พัง', j); check(!document.querySelector('main b b, main .card h3 b'),'ชื่อที่มี <b> ไม่กลายเป็นตัวหนา (ป้องกันโค้ดแทรก)') }catch(e){ bad('จุดไม่มีตำแหน่ง', e.message) } S.plan[1]=day;
    // 5 GPS bad accuracy / outside Hong Kong
    S.gps={ll:[13.7563,100.5018],acc:30,at:Date.now()}; let g=gpsCardHTML(); check(!/undefined|NaN/.test(g) && planSpot().src==='gps','GPS ที่กรุงเทพ ไม่พัง', g.replace(/<[^>]+>/g,' ').slice(0,100));
    S.gps={ll:SPOTS.TST,acc:900,at:Date.now()}; check(planSpot().src!=='gps','GPS แม่นยำต่ำ (900 ม.) ไม่ถูกใช้');
    S.gps=null;
    // 6 days outside the trip
    for(const iso of ['2026-10-30T04:00:00Z','2026-11-20T04:00:00Z']){ at(iso); const p=renderAllViews(iso.slice(0,10)); p.forEach(x=>bad('แสดงผล',x)); clock() } ok('วันนอกทริปแสดงผลได้');
    // 7 big numbers
    const saveE=S.expenses; S.expenses=[...saveE,{id:'tbig',amt:99999.99,cat:'food',day:2,note:'ทดสอบ',payer:0,type:'split',at:Date.now()}]; setTab('money'); check(!junk('เงินจำนวนมาก'),'ยอดเงินหลักหมื่นแสดงผลได้'); S.expenses=saveE; setTab('home');
    errs.forEach(e=>bad('JS error',e)); return R.slice();
  }
};
})();
