// Offline copy of the app: opens without signal, updates itself when online.
// release 1.39
const VERSION='086d4540d5', CACHE='hk-'+VERSION, FILES=["./","index.html","manifest.webmanifest","icon-192.png","icon-180.png","bus.json","places.json","water.json","weather.json","lasttrain.json","dzcal.json"];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())) });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('hk-')&&k!==CACHE&&k!=='hk-fonts').map(k=>caches.delete(k)))).then(()=>self.clients.claim())) });
const timeout=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('slow')),ms))]);
self.addEventListener('fetch', e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET') return;
  if(url.origin===location.origin){
    // the version check reads this file: always from the network, never a saved copy (a saved one said "newest" forever)
    if(/\/sw\.js$/.test(url.pathname)) return;
    // the page asks for 'no-store' when it must know the network really answers (the update check): never a saved copy
    if(req.cache==='no-store' && req.mode!=='navigate') return;
    // the page: newest if the network answers within 4 s, otherwise the saved copy; with no saved copy, wait for the network
    if(req.mode==='navigate'){
      const net=fetch(req.url,{cache:'no-store'}).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(x=>x.put('index.html',c)) } return r });
      e.respondWith(timeout(net,4000).catch(()=>caches.match('index.html',{ignoreSearch:true}).then(hit=>hit||net)));
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

// every notification is also kept on this phone (the app's 🔔 inbox, newest 100) and counted on the app icon until read
const ibxDB=()=>new Promise((ok,no)=>{ const r=indexedDB.open('hk-inbox',1); r.onupgradeneeded=()=>r.result.createObjectStore('n',{keyPath:'id',autoIncrement:true}); r.onsuccess=()=>ok(r.result); r.onerror=()=>no(r.error) });
const ibxTx=(mode,fn)=>ibxDB().then(db=>new Promise((ok,no)=>{ const tx=db.transaction('n',mode), st=tx.objectStore('n'); let out; const q=st.getAll(); q.onsuccess=()=>{ out=fn(st,q.result) }; tx.oncomplete=()=>{ db.close(); ok(out) }; tx.onerror=()=>{ db.close(); no(tx.error) } }));
// add one, keep the newest 100, return how many are unread
const ibxAdd=d=>ibxTx('readwrite',(st,all)=>{ st.add({at:Date.now(), title:d.title||'ทริปฮ่องกง', body:d.body||'', tag:d.tag||'', read:false});
  all.sort((a,b)=>a.at-b.at).slice(0,Math.max(0,all.length+1-100)).forEach(x=>st.delete(x.id)); return all.filter(x=>!x.read).length+1 });
const ibxBadge=n=>{ try{ const nv=self.navigator||navigator; if(n>0){ if(nv.setAppBadge) return nv.setAppBadge(n).catch(()=>{}) } else if(nv.clearAppBadge) return nv.clearAppBadge().catch(()=>{}) }catch(e){} };

// push notifications from the trip server (meals, fireworks, flights, last train)
self.addEventListener('push', e=>{
  let d={}; try{ d=e.data ? e.data.json() : {} }catch(_){ d={body: e.data && e.data.text()} }
  const keep=ibxAdd(d).then(n=>ibxBadge(n)).catch(()=>{})
    .then(()=>self.clients.matchAll({type:'window', includeUncontrolled:true})).then(ws=>(ws||[]).forEach(c=>c.postMessage({inbox:1})));
  e.waitUntil(Promise.all([self.registration.showNotification(d.title||'ทริปฮ่องกง', {body:d.body||'', tag:d.tag, icon:'icon-192.png', badge:'icon-192.png', data:{url:d.url||'./'}}), keep]));
});
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(ws=>{
    // tapping a notification opens the app on the inbox
    for(const w of ws) if('focus' in w){ w.postMessage({openInbox:1}); return w.focus() }
    return self.clients.openWindow('./?inbox=1');
  }));
});
