/* 부스 체크 오프라인용 서비스 워커
   - 앱 파일(index.html 등): 인터넷이 되면 새 버전을 받고, 안 되거나 2.5초 넘게 걸리면 저장해 둔 것으로 열어요.
   - Firebase SDK·글꼴: 한 번 받아 두면 저장본을 써요.
   - 데이터 통신(로그인·동기화)은 건드리지 않아요. */
const VER = "bc-v1";
const CORE = ["./", "./index.html", "./firebase-config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(VER).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("bc-") && k !== VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

function fromCache(req){
  return caches.match(req, {ignoreSearch:true}).then(m=>m || (req.mode === "navigate" ? caches.match("./index.html").then(x=>x || caches.match("./")) : undefined));
}
function networkFirst(req){
  return new Promise(resolve=>{
    let done = false;
    const finish = r=>{ if(!done && r){ done = true; resolve(r); } };
    const timer = setTimeout(()=>{ fromCache(req).then(finish); }, 2500);
    fetch(req).then(res=>{
      if(res && res.ok){ const copy = res.clone(); caches.open(VER).then(c=>c.put(req, copy)); }
      clearTimeout(timer); finish(res);
    }).catch(()=>{
      clearTimeout(timer);
      fromCache(req).then(m=>{ if(!done){ done = true; resolve(m || Response.error()); } });
    });
  });
}
function cacheFirst(req){
  return caches.match(req).then(m=>m || fetch(req).then(res=>{
    if(res && (res.ok || res.type === "opaque")){ const copy = res.clone(); caches.open(VER).then(c=>c.put(req, copy)); }
    return res;
  }));
}
self.addEventListener("fetch", e=>{
  const req = e.request;
  if(req.method !== "GET") return;
  const u = new URL(req.url);
  if(u.origin === self.location.origin){ e.respondWith(networkFirst(req)); return; }
  if((u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com"){
    e.respondWith(cacheFirst(req));
  }
});
