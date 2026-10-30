// Offline copy of the app: opens without signal, updates itself when online.
const VERSION='8596260645', CACHE='hk-'+VERSION, FILES=["./","index.html","manifest.webmanifest","icon-192.png","icon-180.png","bus.json","places.json","water.json","weather.json","lasttrain.json","dzcal.json"];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())) });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('hk-')&&k!==CACHE&&k!=='hk-fonts').map(k=>caches.delete(k)))).then(()=>self.clients.claim())) });
const timeout=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('slow')),ms))]);
self.addEventListener('fetch', e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET') return;
  if(url.origin===location.origin){
    // the page: newest if the network answers within 4 s, otherwise the saved copy
    if(req.mode==='navigate'){
      e.respondWith(timeout(fetch(req),4000).then(r=>{ const c=r.clone(); caches.open(CACHE).then(x=>x.put('index.html',c)); return r })
        .catch(()=>caches.match('index.html',{ignoreSearch:true})));
      return;
    }
    // data files: saved copy straight away, refreshed in the background
    e.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>{
      const net=fetch(req).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(x=>x.put(req,c)) } return r }).catch(()=>hit);
      return hit||net;
    }));
    return;
  }
  if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith(caches.open('hk-fonts').then(c=>c.match(req).then(hit=>hit||fetch(req).then(r=>{ c.put(req,r.clone()); return r }))));
  }
  // live times and shared data always go to the network
});
