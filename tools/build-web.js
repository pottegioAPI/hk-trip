// Builds the GitHub Pages site (index.html + offline worker) from hk-trip.html.
// usage: node tools/build-web.js <repo root>
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const root=process.argv[2]||path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'hk-trip.html'),'utf8');
const DATA=['bus.json','places.json','water.json','weather.json','lasttrain.json','dzcal.json'];
const head=`<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#FF4F8B">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="ฮ่องกง">
<meta name="robots" content="noindex">
<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-180.png"><link rel="icon" href="icon-192.png">
</head><body>
`;
const tail=`
<script>if('serviceWorker' in navigator) addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));</script>
</body></html>
`;
const page=head+src.replace(/^﻿/,'')+tail;
fs.writeFileSync(path.join(root,'index.html'),page);
// version = content of everything the phone keeps offline, so a change makes phones fetch the new copy
const h=crypto.createHash('sha1'); h.update(page); for(const f of DATA) if(fs.existsSync(path.join(root,f))) h.update(fs.readFileSync(path.join(root,f)));
const ver=h.digest('hex').slice(0,10);
// release number people read (1.00, 1.01, ...): one step up when the app itself (hk-trip.html) changed since the
// last commit, never for the daily data refresh. Compared with version.json as committed, so rebuilding is harmless.
const srcHash=crypto.createHash('sha1').update(src).digest('hex').slice(0,10), vf=path.join(root,'version.json');
let base={num:'1.00', src:''}; try{ base=JSON.parse(require('child_process').execSync('git show HEAD:version.json',{cwd:root,stdio:['ignore','pipe','ignore']}).toString()) }catch(e){ try{ base=JSON.parse(fs.readFileSync(vf,'utf8')) }catch(e2){} }
const num = !base.src ? base.num : base.src===srcHash ? base.num : (Math.round(parseFloat(base.num)*100+1)/100).toFixed(2);
fs.writeFileSync(vf, JSON.stringify({num, src:srcHash})+'\n');
const sw=fs.readFileSync(path.join(root,'tools','sw.template.js'),'utf8').replace('__VERSION__',ver).replace('__NUM__',num).replace('__FILES__',JSON.stringify(['./','index.html','manifest.webmanifest','icon-192.png','icon-180.png',...DATA]));
fs.writeFileSync(path.join(root,'sw.js'),sw);
// the page shows its own version and build time, so a phone can tell whether it has the newest copy
const built=new Date(Date.now()+8*3600e3), TH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const stamp=ver+'|'+built.getUTCDate()+' '+TH[built.getUTCMonth()]+' '+String(built.getUTCHours()).padStart(2,'0')+':'+String(built.getUTCMinutes()).padStart(2,'0')+'|'+num;
fs.writeFileSync(path.join(root,'index.html'),page.replace('__APPVER__',stamp));
console.log('index.html',page.length,'version',ver,'release',num);
