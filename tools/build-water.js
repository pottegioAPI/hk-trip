// Government water dispensers (LCSD + FEHD, data.gov.hk) → compact water.json
const fs=require('fs');const [dir,out]=process.argv.slice(2);
// LCSD's file is UTF-16 with every whole line wrapped in quotes; unwrap it to plain CSV
function read(file){ const b=fs.readFileSync(file);
  if(!(b[0]===0xFF&&b[1]===0xFE)) return b.toString('utf8').replace(/^﻿/,'');
  return b.toString('utf16le').slice(1).split(/\r?\n/).map(l=>l.startsWith('"')&&l.endsWith('"')?l.slice(1,-1).replace(/""/g,'"'):l).join('\n') }
function csv(t){ const rows=[];let row=[],f='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){ if(c==='"'){ if(t[i+1]==='"'){f+='"';i++} else q=false } else f+=c; continue }
    if(c==='"') q=true; else if(c===','){row.push(f);f=''} else if(c==='\n'||c==='\r'){ if(c==='\r'&&t[i+1]==='\n')i++; row.push(f);f=''; if(row.length>1)rows.push(row); row=[] } else f+=c }
  if(f||row.length){row.push(f);rows.push(row)} return rows }
const out_=[];
for(const file of ['lcsd.csv','fehd.csv']){
  const rows=csv(read(dir+'/'+file)); const h=rows[0].map(s=>s.trim());
  const col=n=>h.findIndex(x=>x.toLowerCase().startsWith(n.toLowerCase()));
  const iN=col('Name of Building'),iL=col('Location of Water'),iLa=col('Latitude'),iLo=col('Longitude'),iT=col('Type of Water'),iF=col('Service Hours (From)'),iTo=col('Service Hours (To)'),iTe=col('Water Temperature'),iIn=col('Indoor'),iR=col('Remarks');
  for(const r of rows.slice(1)){
    const la=parseFloat(r[iLa]), lo=parseFloat(r[iLo]); if(!(la>22&&lo>113)) continue;
    if(iR>=0 && /not in use|suspend|closed/i.test(r[iR]||'')) continue;
    out_.push([ (r[iN]||'').trim().slice(0,60), (r[iL]||'').trim().slice(0,80), Math.round(la*1e5), Math.round(lo*1e5),
      /bottle/i.test(r[iT]||'')?1:0, ((r[iF]||'').trim()+'-'+(r[iTo]||'').trim().slice(0,25)).replace(/^-$/,''), iTe>=0?(r[iTe]||'').trim().slice(0,30):'', iIn>=0?(r[iIn]||'').trim().slice(0,10):'' ]);
  }
}
fs.writeFileSync(out, JSON.stringify({v:new Date().toISOString().slice(0,10), src:'LCSD + FEHD water dispensers (data.gov.hk)', w:out_}));
console.log('dispensers',out_.length,'bytes',fs.statSync(out).size);
