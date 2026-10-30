// Last-train times for every MTR station, from MTR's official "first and last train" pages.
// usage: node build-lasttrain.js mtr-data.js out.json   (station ids are the MTR open-data ids)
const fs=require('fs');
const [mtrFile,out]=process.argv.slice(2);
const MTR=JSON.parse(fs.readFileSync(mtrFile,'utf8').replace(/^const MTR=/,'').replace(/;\s*$/,''));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const res={}; let bad=0;
  for(const id of MTR.ids){
    let html=null;
    for(let i=0;i<3 && !html;i++){ try{ const r=await fetch(`https://www.mtr.com.hk/en/customer/services/service_hours_search.php?query_type=search&station=${id}`,{headers:{'User-Agent':'Mozilla/5.0 (hk-trip-planner)'}}); if(r.ok) html=await r.text() }catch(e){} if(!html) await sleep(3000) }
    if(!html){ bad++; continue }
    html=html.replace(/<!--[\s\S]*?-->/g,'');            // the page keeps old rows in comments
    const rows=[]; let line=null;
    for(const m of html.matchAll(/class="trainLine ([A-Z]+)"|js_station_(\d+)"[^>]*>[^<]*<\/span><\/td>\s*<td[^>]*>(\d{4})<\/td>\s*<td>(\d{4})<\/td>/g)){
      if(m[1]) line=m[1]; else if(line) rows.push([line, +m[2], m[4]]);   // [line, towards station id, last train hhmm]
    }
    if(rows.length) res[id]=rows; else bad++;
    await sleep(250);
  }
  const n=Object.keys(res).length;
  if(n<MTR.ids.length*0.9){ console.error('last trains: only',n,'stations'); process.exit(1) }
  fs.writeFileSync(out, JSON.stringify({at:new Date().toISOString(), st:res}));
  console.log('last trains for',n,'stations, missing',bad);
})();
