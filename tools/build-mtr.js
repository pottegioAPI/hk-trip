const fs=require('fs');const [dir,out]=process.argv.slice(2);
const parse=t=>t.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(l=>l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(c=>c.replace(/,$/,'').replace(/^"|"$/g,'')));
const st=parse(fs.readFileSync(dir+'/stations.csv','utf8')).slice(1).filter(r=>r[0]&&r[0]!=='AEL');
const S={}; const seqs={};
for(const [line,dir_,code,id,zh,en,seq] of st){ if(!dir_.endsWith('DT')) continue;
  S[id] ??= {id:+id,c:code,en,zh,l:[]}; if(!S[id].l.includes(line)) S[id].l.push(line);
  (seqs[line+'|'+dir_] ??= []).push([+seq,+id]); }
const L={}; for(const k in seqs){ const [line]=k.split('|'); (L[line] ??= []).push(seqs[k].sort((a,b)=>a[0]-b[0]).map(x=>x[1])); }
const fr=parse(fs.readFileSync(dir+'/fares.csv','utf8')).slice(1);
const ids=Object.keys(S).map(Number).sort((a,b)=>a-b); const idx=Object.fromEntries(ids.map((id,i)=>[id,i]));
const M=ids.map(()=>ids.map(()=>-1)); let miss=0;
for(const r of fr){ const a=idx[+r[1]],b=idx[+r[3]]; if(a==null||b==null){miss++;continue} M[a][b]=Math.round(+r[4]*10); }
let holes=0; M.forEach((row,i)=>row.forEach((v,j)=>{if(v<0&&i!==j)holes++}));
const data={ids,st:ids.map(id=>[S[id].c,S[id].en,S[id].zh,S[id].l.join(' ')]),lines:L,fare:M.map(r=>r.map(v=>v<0?'':v.toString(36)).join(','))};
fs.writeFileSync(out,'const MTR='+JSON.stringify(data)+';');
console.log('stations',ids.length,'lines',Object.keys(L).join(','),'missRows',miss,'holes',holes,'bytes',fs.statSync(out).size);
console.log(JSON.stringify(L.EAL), JSON.stringify(L.TKL));
