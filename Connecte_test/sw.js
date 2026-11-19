const CACHE='orientation-co-connected-v61';
const ASSETS=['./','./passages-core.js?v=2026.11.19.66','./passages.js?v=2026.11.19.66','./student-beacon-overview.js?v=2026.11.19.66','./result-pdf.js?v=2026.11.19.66','./archive-pdf.js?v=2026.11.19.66','./teacher-beacon-overview.js?v=2026.11.19.66','./index.html','./connected.js?v=2026.11.19.66','./vendor/qr-local.js','./vendor/jspdf.umd.min.js','./vendor/jspdf.plugin.autotable.min.js','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png',];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('orientation-co-connected-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./result-pdf.js?v=2026.11.19.66','./archive-pdf.js?v=2026.11.19.66','./teacher-beacon-overview.js?v=2026.11.19.66','./index.html'))));
});
