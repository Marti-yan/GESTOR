const CACHE='pronto-shell-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Pedidos, sessões e respostas de API nunca entram no cache.
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!url.pathname.startsWith('/assets/'))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
   const hit=await cache.match(event.request); if(hit)return hit;
   const response=await fetch(event.request);if(response.ok)cache.put(event.request,response.clone());return response;
 }));
});
