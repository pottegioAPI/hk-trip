// Round 4–5: the whole trip lived through minute by minute, then everything that can go wrong.
(function(){
// never run against the real shared trip data (a page opened with a personal link)
const realData=()=>{ if(S.mode==='shared' || typeof db!=='undefined' && db) throw new Error('หยุด: หน้านี้ต่อกับข้อมูลจริง ทดสอบได้เฉพาะโหมดในเครื่อง') };
const realNow=Date.now.bind(Date), realFetch=window.fetch.bind(window);
const R=[]; let errs=[];
const ok=(n,m='')=>R.push({ok:true,n,m:String(m).slice(0,200)}), bad=(n,m='')=>R.push({ok:false,n,m:String(m).slice(0,300)});
const check=(c,n,m)=>c?ok(n):bad(n,m);
addEventListener('error',e=>errs.push('error: '+(e.message||e)+' @'+(e.lineno||'')));
addEventListener('unhandledrejection',e=>errs.push('promise: '+((e.reason&&e.reason.message)||e.reason)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const atT=T=>{ const s=realNow(); Date.now=()=>T+(realNow()-s) };
const hkT=(date,min)=>Date.parse(date+'T00:00:00+08:00')+min*60e3;
const clock=()=>{ Date.now=realNow };
const txt=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const JUNK=/\b(undefined|NaN|\[object Object\]|Infinity)\b|HK\$-|\bnull\b/;
function screen(tag, tabs){
  for(const t of tabs){ try{ setTab(t) }catch(e){ bad(`${tag} เปิดแท็บ ${t} พัง`, e.message); continue }
    const s=(document.querySelector('main')||{}).innerText||''; const m=s.match(JUNK); if(m) bad(`${tag} แท็บ ${t} มีค่าว่างบนจอ`, s.slice(Math.max(0,m.index-60),m.index+30));
    const wide=[...document.querySelectorAll('main .wrap *')].filter(el=>!el.closest('.places,.tmwrap,.lpick,svg,.chout') && el.getBoundingClientRect().right>innerWidth+2 && getComputedStyle(el).position!=='fixed');
    if(wide.length) bad(`${tag} แท็บ ${t} ล้นจอ`, [...new Set(wide.map(e=>e.className||e.tagName))].slice(0,3).join(',')) }
}
function mockDZ(over={}){
  const now=hkNow().min;
  DZQ={at:Date.now(), anyOpen:true, food:{}, rbh:{open:true,w:10,at:Date.now()},
    m:Object.fromEntries(Object.keys(DZ_RIDES).map(k=>[k,{open:true, w:Math.round(DZ_RIDES[k].avg*dzCurve(now)/5)*5, at:Date.now()}]))};
  for(const [k,v] of Object.entries(over)) DZQ.m[k]={...DZQ.m[k],...v};
}

window.HKT2 = {
  // ---- round 4: the four days as they will really happen ----
  async round4(){
    realData();
    R.length=0; errs=[]; const keep={done:S.done, gps:S.gps};
    S.done={}; S.dzLater={}; DZ_LAST_ORDER.length=0;
    const toasts=[]; const tEl=document.getElementById('toast'); const mo=new MutationObserver(()=>{ if(!tEl.hidden) toasts.push(tEl.textContent) }); mo.observe(tEl,{childList:true,attributes:true,characterData:true,subtree:true});
    // the night before: nothing has started yet
    atT(hkT('2026-11-13',22*60)); screen('13 พ.ย. คืนก่อนบิน',['home','plan','dz','money']);
    check(/จุดแรกของทริป/.test(txt(nextStopHTML())),'คืนก่อนบิน: หน้าแรกบอกจุดแรกของทริป', txt(nextStopHTML()).slice(0,80));
    for(let d=1; d<=4; d++){
      const day=DAYS[d-1].date, list=dayItems(d);
      const first=toMin(list[0].t), last=Math.max(...list.map(i=>toMin(i.e||i.t)));
      let lastLL=d===1?null:HOTEL_LL, dzDone=false;
      for(let m=first-20; m<=last+60; m+=10){
        atT(hkT(day,m)); const now=hkNow();
        if(d===1 && !S.done.start && m>=first){ await letsGo(); check(!!S.done.start,'วันแรก: กด LET\'S GO แล้วทริปเริ่ม') }
        // Disney: the whole park day run by the app's own suggestions
        const park=list.find(i=>i.id==='3b');
        if(d===3 && park && !dzDone && m>=toMin(park.t)){ dzDone=true; await this._disneyDay(day); m=hkNow().min-hkNow().min%10; atT(hkT(day,m)) }
        // at each stop when its time comes (GPS shows we are there, then "ถึงแล้ว")
        for(const it of list){ if(S.done[it.id] || toMin(it.t)>m) continue;
          if(d===3 && ['3l','3n'].includes(it.id)){ if(!dzMealDone(it.id==='3l'?'lunch':'dinner')) bad(`วัน 3 ${it.h} ไม่ได้กินตามแผน Disney`); continue }
          const ll=targetLL(it); if(ll){ S.gps={ll, acc:15, at:Date.now()}; lastLL=ll }
          const {opts}=optionsFor(d,it), sel=opts.length?chosen(d,it,opts):null;
          if(sel&&sel.manual){ S.day=d; setTab('plan'); const inp=document.getElementById('fare-'+it.id); if(inp) inp.value='25' }
          await toggleArrive(it.id); await sleep(5);
          if(!S.done[it.id]) bad(`วัน ${d} ${hhmm(m)} กด "ถึงแล้ว" ที่ ${it.h} ไม่ติด`, toasts.slice(-1)[0]);
        }
        // the home card always points at the next unchecked stop of today
        const nx=nextItem(d), nit=list.find(i=>i.id===nx), card=txt(nextStopHTML());
        if(nit && !card.includes(txt(esc(nit.h)).slice(0,12))) bad(`วัน ${d} ${hhmm(m)} การ์ด "ถัดไป" ไม่ตรงกับจุดถัดไป (${nit.h})`, card.slice(0,90));
        const al=txt(alertsHTML()); if(JUNK.test(al)) bad(`วัน ${d} ${hhmm(m)} แจ้งเตือนมีค่าว่าง`, al);
        if(m%60===0) screen(`วัน ${d} ${hhmm(m)}`, d===3?['home','plan','dz']:['home','plan']);
      }
      const left=list.filter(i=>!S.done[i.id]).map(i=>i.h);
      check(!left.length, `วัน ${d}: ทุกจุดในแผนบันทึกว่าถึงแล้ว (${list.length} จุด)`, left.join(', '));
      screen(`จบวัน ${d}`, ['home','plan','go','money']);
    }
    // money after four days
    const all=allExp(), auto=all.filter(e=>e.auto);
    check(all.every(e=>Number.isFinite(e.amt)&&e.amt>=0),'ค่าใช้จ่ายทุกรายการเป็นตัวเลขถูกต้อง', all.filter(e=>!Number.isFinite(e.amt)).length);
    const paid=Object.values(S.done).filter(v=>v&&v.fare>0).length;
    check(auto.length>=paid-1, `ค่ารถจดอัตโนมัติครบ (${auto.length} รายการ จาก ${paid} จุดที่เสียค่ารถ)`);
    check(tripEnded(),'วันสุดท้าย: กด "กลับถึงไทยแล้ว" แล้วทริปจบ');
    try{ openSheet({kind:'summary'}); const s=document.getElementById('sheet').innerText; check(!JUNK.test(s),'สรุปทริปแสดงได้ไม่มีค่าว่าง', s.slice(0,120)); closeSheet() }catch(e){ bad('สรุปทริปพัง', e.message) }
    try{ await storyMake(); await sleep(300); const imgs=document.querySelectorAll('#sheet img, #sheet canvas'); check(imgs.length>=2,'ทำรูป Story ได้ 2 ภาพ', imgs.length); closeSheet() }catch(e){ bad('ทำรูป Story พัง', e.message) }
    mo.disconnect(); clock(); S.gps=keep.gps; DZQ=null; setTab('home');
    errs.forEach(e=>bad('JS error',e)); return R.slice();
  },
  // the park day: follow the first suggestion every time, like we will
  async _disneyDay(day){
    let t=dzOpenT(), guard=0; S.dzLand='MS'; atT(hkT(day,t)); const log=[];
    while(guard++<40){
      atT(hkT(day,t)); mockDZ(); DZ_MEMO=null; const p=dzOptimize(); const s=p.steps[0]; if(!s) break;
      const end=s.at+(s.wait||0)+(s.dur||5); atT(hkT(day,end));
      if(s.meal){ dzLinkToggle('dz:'+s.meal); log.push(`${hhmm(s.at)} กิน${s.meal==='lunch'?'เที่ยง':'เย็น'}`);
        const M=DZ_MEALS[s.meal]; if(s.at<M.from||s.at>M.to) bad(`Disney: ${s.meal} นอกเวลา voucher (${hhmm(s.at)})`) }
      else if(s.snack){ (window.dzSnackDone||(()=>{ S.done={...S.done,'dz:snack':{at:hhmm(end)}} }))(); log.push(`${hhmm(s.at)} ขนม`) }
      else if(s.k){ toggleDz(s.k); log.push(`${hhmm(s.at)} ${DZ_RIDES[s.k].n} รอ ${s.wait}`) }
      else break;
      t=end; screen(`Disney ${hhmm(t)}`, ['dz']);
    }
    const must=[...DZ_MUST].filter(k=>!S.done['dz:'+k]).map(k=>DZ_RIDES[k].n), rides=Object.keys(DZ_RIDES).filter(k=>!S.done['dz:'+k]).map(k=>DZ_RIDES[k].n);
    check(!must.length,'Disney: เครื่องเล่นห้ามพลาดครบทั้ง 5', must.join(', '));
    check(dzMealDone('lunch')&&dzMealDone('dinner'),'Disney: กินครบ 2 มื้อตาม voucher');
    check(t<=fwBeThere(), `Disney: ทำครบก่อนไปจองที่ดูพลุ (เสร็จ ${hhmm(t)} / ต้องไป ${hhmm(fwBeThere())})`);
    ok(`Disney เล่นได้ ${Object.keys(DZ_RIDES).length-rides.length}/${Object.keys(DZ_RIDES).length} เครื่อง`, rides.length?'เหลือ: '+rides.join(', '):'ครบ');
    ok('ลำดับวัน Disney', log.join(' · '));
    atT(hkT(day,t));
  },

  // ---- round 5: problems ----
  async round5(){
    realData();
    R.length=0; errs=[]; const keep={done:S.done, gps:S.gps};
    // 1 no internet in the middle of the day: ticks wait, then go up when the signal is back
    atT(hkT('2026-11-15',11*60)); S.done={start:{at:'08:00', run:realNow()}};   // a value the server hasn't seen yet
    if(!db){ ok('ข้ามทดสอบไม่มีเน็ต: หน้านี้ไม่ได้ต่อระบบซิงค์ (ทดสอบไว้แล้วในการทดสอบสองเครื่อง)') } else {
    window.fetch=()=>Promise.reject(new TypeError('Failed to fetch'));
    const it=dayItems(2)[0]; await toggleArrive(it.id); await sleep(300);
    const c1=JSON.parse(lsGet('hk-cache','{}')); check((c1.queue||[]).some(q=>q.path==='trip/progress'),'ไม่มีเน็ต: กด "ถึงแล้ว" ได้ เก็บรอส่งในเครื่อง');
    check(S.net==='off'||S.net==='wait','ไม่มีเน็ต: ด้านบนบอกสถานะว่ายังไม่ซิงค์', S.net);
    screen('ไม่มีเน็ต',['home','plan','go','dz','money']);
    window.fetch=realFetch; await db.sync(); await sleep(500); await db.sync();
    const c2=JSON.parse(lsGet('hk-cache','{}')); check(!(c2.queue||[]).length,'เน็ตกลับมา: ส่งข้อมูลที่ค้างขึ้นไปครบ', JSON.stringify(c2.queue||[]).slice(0,100));
    }
    // 2 bus: count the stops with GPS and warn one stop before
    let bx=null; for(let d=1;d<=4&&!bx;d++) for(const i of dayItems(d)){ const o=optionsFor(d,i).opts.find(o=>o.bx&&ridePattern(o.bx)); if(o){ bx=o.bx; break } }
    if(!bx) bad('หาเส้นทางรถเมล์ในแผนไม่เจอ'); else {
      const toasts=[]; const tEl=document.getElementById('toast'); const mo=new MutationObserver(()=>{ if(!tEl.hidden) toasts.push(tEl.textContent) }); mo.observe(tEl,{childList:true,subtree:true,characterData:true,attributes:true});
      const stops=ridePattern(bx); S.gps={ll:stopLL(stops[0]),acc:20,at:Date.now()}; rideStart(bx); await sleep(50);
      let warnedAt=-1; for(let i=0;i<stops.length;i++){ S.gps={ll:stopLL(stops[i]),acc:20,at:Date.now()}; rideDraw(); await sleep(20);
        const head=document.querySelector('.ridehead'); if(warnedAt<0 && head && head.classList.contains('flash')) warnedAt=i }
      check(warnedAt===stops.length-2, `รถเมล์ ${bx.route||''}: เตือน "ป้ายหน้าลง" ที่ป้ายก่อนลงพอดี (ป้ายที่ ${warnedAt+1}/${stops.length})`);
      check(toasts.some(t=>/ป้ายหน้าลง/.test(t)),'รถเมล์: มีข้อความเตือนขึ้นจอ', toasts.join('|'));
      check(/ถึงป้ายลงแล้ว/.test(document.getElementById('ridebody').innerText),'รถเมล์: ถึงป้ายสุดท้ายบอกว่าถึงแล้ว');
      S.gps={ll:stopLL(stops[0]),acc:20,at:Date.now()-10*60e3}; rideDraw(); check(/เปิด GPS/.test(document.getElementById('ridebody').innerText),'รถเมล์: GPS ขาดหาย บอกให้เปิด GPS ไม่นับมั่ว');
      closeSheet(); S.ride=null; mo.disconnect() }
    // 3 flights: every status the airport board can show
    const saveF=FLIGHT; atT(hkT('2026-11-14',16*60));
    for(const [st,expect] of [['Est at 18:40','คาดว่าลง'],['At gate 17:20','ลงแล้ว'],['Cancelled','ยกเลิก'],['Delayed','ล่าช้า'],['','ยังไม่ออก'],['Landed 17:05','ลงแล้ว']]){
      FLIGHT={EK384:{at:Date.now(), found:{status:st,time:'17:40',baggage:'12',hall:'B'}}};
      const h=txt(flightHTML('EK384')); check(h.includes(expect)&&!JUNK.test(h), `เที่ยวบินขาไป สถานะ "${st||'(ว่าง)'}" → ${expect}`, h.slice(0,90)) }
    FLIGHT={EK384:{at:Date.now(), found:{status:'Est at 19:10',time:'17:40'}}}; S.done={start:{at:'05:00'}}; atT(hkT('2026-11-14',18*60));
    { const {delay}=dayDelay(dayItems(1)); check(delay===90,'เครื่องช้า 90 นาที: แผนวันแรกเลื่อนตาม', delay) }
    atT(hkT('2026-11-17',17*60));
    for(const [st,expect] of [['Boarding','เรียกขึ้นเครื่อง'],['Gate Closed','ปิดแล้ว'],['Dep 21:54','ออกแล้ว'],['Cancelled','ยกเลิก']]){
      FLIGHT={EK385:{at:Date.now(), found:{status:st,time:'20:40',gate:'23',aisle:'H'}}};
      const h=txt(flightHTML('EK385')); check(h.includes(expect)&&!JUNK.test(h), `เที่ยวบินขากลับ "${st}" → ${expect}`, h.slice(0,90)) }
    FLIGHT=saveF;
    // 4 Disney goes wrong
    atT(hkT('2026-11-16',10*60+30)); S.done={start:{at:'05:00'}}; S.dzLater={}; DZ_MEMO=null;
    mockDZ({frozen:{open:false}}); let p=dzOptimize(); check(p.steps.some(s=>s.k==='frozen') && p.steps.findIndex(s=>s.k==='frozen')>0,'Frozen ปิดตอนเปิดสวน: ยังอยู่ในแผน แต่เลื่อนไปทีหลัง');
    check(/ปิดชั่วคราว/.test(txt(dzSmartHTML())),'เครื่องที่ปิด ขึ้นป้าย "ปิดชั่วคราว"');
    mockDZ(Object.fromEntries(Object.keys(DZ_RIDES).map(k=>[k,{w:120}]))); DZ_MEMO=null; p=dzOptimize();
    check(/เกินเวลา|ไม่ทัน/.test(txt(dzSmartHTML())),'คิวยาวมากทุกเครื่อง: เตือนว่าอาจไม่ทันพลุ', txt(dzSmartHTML()).slice(-160));
    atT(hkT('2026-11-16',12*60)); mockDZ(); DZQ.rbh={open:false,w:0,at:Date.now()};
    check(/ร้านอื่น|แทน/.test(txt(dzMealHTML(12*60))),'Royal Banquet Hall ปิด: แนะนำร้านอื่นที่ใช้ voucher ได้', txt(dzMealHTML(12*60)).slice(0,120));
    mockDZ(); atT(hkT('2026-11-16',14*60)); DZ_MEMO=null; p=dzOptimize();   // got to the park late
    const must=p.steps.filter(s=>DZ_MUST.has(s.k)); check(must.length===5 && must.every(s=>s.at+s.wait<fwBeThere()),'มาถึงสวนสาย (14:00): ยังจัดให้เล่นห้ามพลาดครบก่อนพลุ', must.map(s=>DZ_RIDES[s.k].n+' '+hhmm(s.at)).join(', '));
    S.dzLater={frozen:hkNow().min+45}; DZ_MEMO=null; p=dzOptimize(); check(p.steps[0].k!=='frozen','กด "ไว้ทีหลัง": เครื่องนั้นไม่ขึ้นเป็นอันแรก'); S.dzLater={};
    window.fetch=()=>Promise.reject(new TypeError('x')); DZQ=null; await dzQueueFetch(true); window.fetch=realFetch; atT(hkT('2026-11-16',11*60));
    check(!JUNK.test(txt(dzSmartHTML())),'คิว Disney ดึงไม่ได้: ใช้สถิติแทนไม่พัง');
    // 5 GPS problems
    const g=navigator.geolocation.watchPosition; gpsStop();
    navigator.geolocation.watchPosition=(ok,err)=>{ setTimeout(()=>err({code:1}),10); return 1 }; gpsStart(true); await sleep(60);
    check(!S.gps && lsGet('hk-gps','')==='off','ไม่อนุญาต GPS: แอปไม่พัง บอกวิธีเปิด'); navigator.geolocation.watchPosition=g;
    S.gps={ll:[22.3,114.17],acc:2000,at:Date.now()}; check(!gpsFresh(),'GPS คลาด 2 กม. (ในตึก/ใต้ดิน): ไม่เอามาใช้'); S.gps=null;
    // 6 typhoon 8 and black rain on the Disney day
    const sw=WARN; WARN={at:Date.now(), list:[{code:'TC8NE',lv:'danger',th:WARN_TH.TC8NE[1],en:'No. 8'}]}; setTab('home');
    check(document.querySelectorAll('.wn.danger').length>=1,'สัญญาณไต้ฝุ่น 8: แถบเตือนสีแดงหน้าแรก'); WARN=sw;
    // 7 day 1: test leftovers cleared on this phone
    lsSet('hk-fresh',''); lsSet('hk-dzlive','{"frozen":{"w":5,"at":1}}'); await PDB.put('test:x', new Blob(['x']));
    atT(hkT('2026-11-13',23*60)); await freshStart(); check(lsGet('hk-dzlive','')!=='{}','ก่อนวันที่ 14: ยังไม่ล้างข้อมูลทดสอบ');
    atT(hkT('2026-11-14',0)); await freshStart(); const ks=await PDB.keys();
    check(lsGet('hk-dzlive','')==='{}' && !(ks||[]).length && lsGet('hk-fresh','')==='1','00:00 วันที่ 14: ล้างรูปและคิวที่ทดลองในเครื่องแล้ว');
    lsSet('hk-dzlive','{"x":1}'); await freshStart(); check(lsGet('hk-dzlive','')==='{"x":1}','ล้างแค่ครั้งเดียว ข้อมูลระหว่างทริปไม่ถูกล้างซ้ำ'); lsSet('hk-dzlive','{}'); lsSet('hk-fresh','');
    // 8 phone clock on Thai time: the app still reads Hong Kong time
    atT(Date.parse('2026-11-15T09:00:00+07:00')); check(hkNow().min===10*60 && tripDay()===2,'มือถือตั้งเวลาไทย: แอปยังใช้เวลาฮ่องกงถูกต้อง (09:00 ไทย = 10:00 HK)', hhmm(hkNow().min));
    clock(); S.done=keep.done; S.gps=keep.gps; DZQ=null; setTab('home');
    errs.forEach(e=>bad('JS error',e)); return R.slice();
  }
};
})();
