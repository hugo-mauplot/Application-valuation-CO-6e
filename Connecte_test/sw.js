const CACHE='orientation-co-connected-v63';
const ASSETS=['./','./student-touch.js?v=2026.11.20.68','./completion-core.js?v=2026.11.20.68','./passages-core.js?v=2026.11.20.68','./passages.js?v=2026.11.20.68','./student-beacon-overview.js?v=2026.11.20.68','./result-pdf.js?v=2026.11.20.68','./archive-pdf.js?v=2026.11.20.68','./teacher-beacon-overview.js?v=2026.11.20.68','./index.html','./connected.js?v=2026.11.20.68','./vendor/qr-local.js','./vendor/jspdf.umd.min.js','./vendor/jspdf.plugin.autotable.min.js','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png',];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('orientation-co-connected-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./result-pdf.js?v=2026.11.20.68','./archive-pdf.js?v=2026.11.20.68','./teacher-beacon-overview.js?v=2026.11.20.68','./index.html'))));
});
