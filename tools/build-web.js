// Builds the GitHub Pages site (index.html + offline worker) from hk-trip.html.
// usage: node tools/build-web.js <repo root>
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const root=process.argv[2]||path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'hk-trip.html'),'utf8');
const DATA=['bus.json','places.json','water.json','weather.json','lasttrain.json'];
const head=`<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
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
const sw=fs.readFileSync(path.join(root,'tools','sw.template.js'),'utf8').replace('__VERSION__',ver).replace('__FILES__',JSON.stringify(['./','index.html','manifest.webmanifest','icon-192.png','icon-180.png',...DATA]));
fs.writeFileSync(path.join(root,'sw.js'),sw);
console.log('index.html',page.length,'version',ver);
