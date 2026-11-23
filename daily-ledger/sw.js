const CACHE='daily-ledger-v5';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg','./og.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('daily-ledger-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}
    catch {return await cache.match(event.request)||(event.request.mode==='navigate'&&await cache.match('./index.html'))||Response.error();}
  })());
});
