// Bus stop positions from the bus companies themselves.
// The Transport Department timetable file (GTFS) that bus.json is built from places some stops tens of metres from the
// real pole (seen 10 Nov 2026: "Queen's College, Causeway Road" 52 m off, on the wrong side of a school wall).
// KMB/LWB and Citybus publish each stop's own position in their open data; this moves every stop we can match
// (same route, same direction, nearest stop within 120 m) onto it. Anything that can't be matched keeps its position.
// usage: node build-busfix.js bus.json cacheDir   (cacheDir keeps the companies' lists; Citybus is re-read when older than 6 days)
const fs=require('fs'), path=require('path');
const [busFile, cache]=process.argv.slice(2);
const UA={'User-Agent':'hk-trip-planner/1.0 (personal trip app)'};
const md=(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJSON(url, tries=4){
  for(let i=0;;i++){
    try{ const r=await fetch(url,{headers:UA, signal:AbortSignal.timeout(30000)}); if(r.ok) return await r.json(); if(r.status===422||r.status===404) return {data:[]}; throw new Error('HTTP '+r.status) }
    catch(e){ if(i>=tries-1) throw new Error(url+': '+e.message); await sleep(1500*(i+1)) }
  }
}
async function pool(items, n, fn){ const out=new Array(items.length); let k=0;
  await Promise.all(Array.from({length:n},async()=>{ while(k<items.length){ const i=k++; out[i]=await fn(items[i],i) } })); return out }
const fresh=(f,days)=>{ try{ return Date.now()-Date.parse(JSON.parse(fs.readFileSync(f,'utf8')).at)<days*864e5 }catch(e){ return false } };
const load=f=>JSON.parse(fs.readFileSync(f,'utf8')), save=(f,v)=>fs.writeFileSync(f,JSON.stringify(v));

(async()=>{
  // "node build-busfix.js --need-kmb cacheDir": exit 0 when KMB's saved list is missing or over 6 days old (refresh.sh then downloads it)
  if(busFile==='--need-kmb') process.exit(fresh(path.join(cache,'kmb.json'),6) ? 1 : 0);
  fs.mkdirSync(cache,{recursive:true});
  const F=n=>path.join(cache,n);
  // KMB + Long Win: every stop and every route's stop order, one call each
  // (each company on its own: if one can't be reached, its last saved list is used, or it is left out)
  const tryOp=async(name,fn)=>{ try{ await fn() }catch(e){ console.log(name+' list not refreshed: '+e.message+(fs.existsSync(F(name+'.json'))?' (using the saved one)':'')) } };
  // KMB's server refuses this program's requests (403) but answers curl, so refresh.sh downloads its two lists with curl
  // into kmb-stop.raw.json and kmb-routestop.raw.json; they are read here when they are complete.
  await tryOp('kmb', async()=>{
    const A=F('kmb-stop.raw.json'), R=F('kmb-routestop.raw.json'); if(!fs.existsSync(A) || !fs.existsSync(R)) { if(!fs.existsSync(F('kmb.json'))) throw new Error('no download'); return }
    const st=load(A), rs=load(R);
    if(!st.data || !rs.data || st.data.length<3000 || rs.data.length<10000) throw new Error('KMB list looks incomplete');
    const pos={}; for(const s of st.data) pos[s.stop]=[Math.round(+s.lat*1e6)/1e6, Math.round(+s.long*1e6)/1e6];
    const seq={}; for(const r of rs.data) ((seq[r.route]??={})[r.bound+r.service_type]??=[])[+r.seq-1]=r.stop;
    save(F('kmb.json'),{at:new Date().toISOString(), pos, seq}); fs.unlinkSync(A); fs.unlinkSync(R);
  });
  // Citybus: the stop order of each route and direction, then each stop's position (kept; only new stops are asked for)
  await tryOp('ctb', async()=>{ if(fresh(F('ctb.json'),6)) return;
    const old=fs.existsSync(F('ctb.json')) ? load(F('ctb.json')) : {pos:{}};
    const routes=(await getJSON('https://rt.data.gov.hk/v2/transport/citybus/route/ctb')).data.map(r=>r.route);
    if(routes.length<200) throw new Error('Citybus route list looks incomplete');
    const seq={}, jobs=routes.flatMap(r=>[[r,'outbound','O'],[r,'inbound','I']]);
    await pool(jobs, 6, async([r,dir,d])=>{ const j=await getJSON(`https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${encodeURIComponent(r)}/${dir}`);
      if(j.data.length) (seq[r]??={})[d]=j.data.sort((a,b)=>a.seq-b.seq).map(x=>x.stop) });
    const pos=old.pos||{}, need=[...new Set(Object.values(seq).flatMap(o=>Object.values(o).flat()))].filter(id=>!pos[id]);
    await pool(need, 6, async id=>{ const j=await getJSON('https://rt.data.gov.hk/v2/transport/citybus/stop/'+id); const s=j.data;
      if(s && s.lat) pos[id]=[Math.round(+s.lat*1e6)/1e6, Math.round(+s.long*1e6)/1e6] });
    save(F('ctb.json'),{at:new Date().toISOString(), pos, seq});
    console.log('citybus routes',routes.length,'new stops asked',need.length);
  });
  const OPS={}; for(const [k,f] of [['KMB','kmb.json'],['CTB','ctb.json']]) if(fs.existsSync(F(f))) OPS[k]=load(F(f));
  if(!Object.keys(OPS).length) throw new Error('no company list available');
  const B=load(busFile), votes=new Map();   // stop index -> [[lat,lon],...]
  let patsDone=0, patsTried=0;
  for(const p of B.pats){
    const rt=B.routes[p[0]], no=rt[0], ag=String(rt[1]);
    const ops=[...(/(KMB|LWB)/.test(ag)?['KMB']:[]), ...(/CTB/.test(ag)?['CTB']:[])].filter(o=>OPS[o]); if(!ops.length) continue;
    patsTried++;
    const g=p[2].map(i=>[B.stops[i][0]/1e5, B.stops[i][1]/1e5]); let best=null;
    for(const op of ops){ const seqs=OPS[op] && OPS[op].seq[no]; if(!seqs) continue;
      for(const ids of Object.values(seqs)){ const pts=ids.filter(Boolean).map(id=>OPS[op].pos[id]).filter(Boolean); if(pts.length<2) continue;
        const m=g.map(q=>{ let bd=121, bp=null; for(const x of pts){ const d=md(q,x); if(d<bd){ bd=d; bp=x } } return bp?[bp,bd]:null });
        const n=m.filter(Boolean).length, tot=m.reduce((s,x)=>s+(x?x[1]:0),0);
        // the right direction: its first and last stops are where ours are
        const ends=md(g[0],pts[0])+md(g[g.length-1],pts[pts.length-1]);
        if(n>=g.length*.6 && ends<1500 && (!best || n>best.n || (n===best.n && tot<best.tot))) best={n,tot,m} } }
    if(!best) continue; patsDone++;
    best.m.forEach((x,k)=>{ if(x){ const i=p[2][k]; (votes.get(i)||votes.set(i,[]).get(i)).push(x[0]) } });
  }
  // each stop: the position most routes agree on (poles of one stop are a few metres apart)
  let moved=0; const shifts=[];
  for(const [i,v] of votes){
    const groups=[]; for(const q of v){ const gph=groups.find(G=>md(G.c,q)<20); if(gph){ gph.n++ } else groups.push({c:q,n:1}) }
    groups.sort((a,b)=>b.n-a.n); const c=groups[0].c, was=[B.stops[i][0]/1e5, B.stops[i][1]/1e5], d=md(was,c);
    if(d>150) continue; shifts.push(d);
    if(d>=3){ B.stops[i][0]=Math.round(c[0]*1e5); B.stops[i][1]=Math.round(c[1]*1e5); moved++ }
  }
  shifts.sort((a,b)=>a-b); const q=f=>shifts.length?Math.round(shifts[Math.floor((shifts.length-1)*f)]):0;
  console.log(`bus stops: routes matched ${patsDone}/${patsTried}, stops checked ${shifts.length}/${B.stops.length}, moved ${moved} (shift m: median ${q(.5)}, p90 ${q(.9)}, max ${q(1)})`);
  if(patsDone<patsTried*.5 || shifts.length<800) throw new Error('too few matches: keeping the timetable positions');
  B.v=String(B.v||'')+' + stop positions KMB/Citybus '+new Date().toISOString().slice(0,10);
  save(busFile,B);
})().catch(e=>{ console.error('bus stop positions not updated:', e.message); process.exit(1) });
