const fs=require('fs');const [X,out,mtrjs]=process.argv.slice(2);
function csv(file,cb){const t=fs.readFileSync(X+'/'+file,'utf8');let i=0,row=[],f='',q=false,first=true;const N=t.length;
 for(;i<N;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c;continue}
  if(c==='"'){q=true}else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);f='';if(first)first=false;else if(row.length>1)cb(row);row=[]}else f+=c}
 if(f||row.length){row.push(f);cb(row)}}
const stops=[],sIdx={};
csv('stops.txt',r=>{const raw=r[1];let nm=raw.split('|')[0].replace(/^\[[^\]]*\]\s*/,'').split('/<BR>').pop().trim();
 sIdx[r[0]]=stops.length;stops.push([Math.round(+r[2]*1e5),Math.round(+r[3]*1e5),nm])});
const routes=[],rIdx={};
csv('routes.txt',r=>{rIdx[r[0]]=routes.length;routes.push([r[2],r[1],r[3].replace(/\s+/g,' ').trim(),+r[4],0])});
const cal={};csv('calendar.txt',r=>{let m=0;for(let d=0;d<7;d++)if(r[1+d]==='1')m|=1<<d;cal[r[0]]=m});
const tripRoute={},tripSvc={};csv('trips.txt',r=>{tripRoute[r[2]]=r[0];tripSvc[r[2]]=r[1]});
// stop sequences per trip
const seq={};csv('stop_times.txt',r=>{(seq[r[0]]??=[]).push([+r[4],r[3]])});
const patCount={},patMask={};
for(const tid in seq){const rt=tripRoute[tid];if(!rt)continue;const dir=tid.split('-')[1];
 const s=seq[tid].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' ');const k=rt+'|'+dir;(patCount[k]??={});patCount[k][s]=(patCount[k][s]||0)+1;patMask[k]=(patMask[k]||0)|(cal[tripSvc[tid]]||0)}
// headways
const hw={};csv('frequencies.txt',r=>{const rt=tripRoute[r[0]];if(!rt)return;const h=+r[3];const st=+r[1].slice(0,2);if(st>=9&&st<=18)(hw[rt]??=[]).push(h)});
for(const rt in hw){const a=hw[rt].sort((x,y)=>x-y);routes[rIdx[rt]][4]=Math.round(a[a.length>>1]/60)}
// fares
const price={};csv('fare_attributes.txt',r=>{price[r[0]]=+r[1]});
const fare={};csv('fare_rules.txt',r=>{const p=price[r[0]];if(p!=null)fare[r[1]+'|'+r[2]+'|'+r[3]]=p});
const pats=[];let nf=0,tot=0;
for(const k in patCount){const [rt,dir]=k.split('|');const best=Object.entries(patCount[k]).sort((a,b)=>b[1]-a[1])[0][0].split(' ');
 const last=best[best.length-1];const f=best.map((s,i)=>{if(i===best.length-1)return -1;tot++;let p=fare[rt+'|'+s+'|'+last];if(p==null){for(let j=best.length-1;j>i&&p==null;j--)p=fare[rt+'|'+s+'|'+best[j]]}if(p==null){nf++;return -1}return Math.round(p*10)});
 pats.push([rIdx[rt],+dir,best.map(s=>sIdx[s]),f,patMask[k]||127])}
// station coordinates from bus stops named "<station> STATION"
eval(fs.readFileSync(mtrjs,'utf8').replace('const MTR','global.MTR'));
const stc={},miss=[];
for(const [code,en] of MTR.st){const key=en.toUpperCase().replace(/'/g,'').trim()+' STATION';
 const hits=stops.filter(s=>{const n=s[2].toUpperCase().replace(/'/g,'');return n.startsWith(key)||n.includes(' '+key)||n.includes(key+',')});
 if(hits.length){stc[code]=[Math.round(hits.reduce((a,s)=>a+s[0],0)/hits.length),Math.round(hits.reduce((a,s)=>a+s[1],0)/hits.length)]}else miss.push(code+':'+en)}
// OSM: station positions + exits
const osmDir=process.argv[5];const ost=JSON.parse(fs.readFileSync(osmDir+"/stations.json")).elements, oex=JSON.parse(fs.readFileSync(osmDir+"/exits.json")).elements;
const P=x=>[x.lat??x.center.lat,x.lon??x.center.lon];const md=(a,b)=>Math.hypot((a[0]-b[0])*111320,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
const sPos={};for(const s of ost){const r=s.tags&&s.tags.ref;if(r&&/^[A-Z]{3}$/.test(r)&&!sPos[r])sPos[r]=P(s)}
const ex={};let ok=0;for(const e of oex){const ref=e.tags&&e.tags.ref;if(!ref)continue;const p=P(e);let best=null,bd=500;for(const c in sPos){const d=md(p,sPos[c]);if(d<bd){bd=d;best=c}}if(!best)continue;ok++;(ex[best]??=[]).push([ref,(e.tags["name:en"]||"").slice(0,40),Math.round(p[0]*1e5),Math.round(p[1]*1e5)])}
for(const c in sPos)stc[c]=[Math.round(sPos[c][0]*1e5),Math.round(sPos[c][1]*1e5)];
console.log("osm stations",Object.keys(sPos).length,"exits assigned",ok,"stations with exits",Object.keys(ex).length);
fs.writeFileSync(out,JSON.stringify({ex,v:'TD GTFS '+new Date().toISOString().slice(0,10),stops,routes,pats,stc}));
console.log('stops',stops.length,'routes',routes.length,'pats',pats.length,'fareMissing',nf,'/',tot,'bytes',fs.statSync(out).size);
console.log('stations found',Object.keys(stc).length,'missing',miss.join(', '));
console.log(JSON.stringify(routes.filter(r=>['6X','A21','S1','260'].includes(r[0])).slice(0,8)));
