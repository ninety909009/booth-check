/* 부스 체크 오프라인용 서비스 워커
   - 앱 파일(index.html·app.css·js/): 인터넷이 되면 새 버전을 받고, 안 되거나 2.5초 넘게 걸리면 저장해 둔 것으로 열어요.
     파일이 여러 개라 버전이 섞이지 않게, 한 화면(페이지)이 index.html을 어디서 받았는지(인터넷/저장본) 기억했다가
     그 화면의 css·js도 같은 쪽에서 가져와요. 새 index.html을 받으면 거기 적힌 css·js도 함께 저장해 둬요.
   - Firebase SDK·글꼴: 한 번 받아 두면 저장본을 써요.
   - firebase-config.js: 항상 인터넷에서 새로 받아요. 인터넷이 아예 안 될 때만 저장본을 써요.
   - 데이터 통신(로그인·동기화)은 건드리지 않아요. */
const VER = "bc-v5"; // v5: 앱을 index.html + app.css + js/ 여러 파일로 나눔
const CORE = [
  "./",
  "./index.html",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];
/* index.html이 불러오는 앱 파일 (app.css, js/*.js) */
const ASSET_RE = /(?:src|href)="((?:js\/[\w.-]+\.js|app\.css)(?:\?[^"]*)?)"/g;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VER)
      .then((c) =>
        Promise.all(CORE.map((u) => c.add(u).catch(() => {}))).then(() =>
          c.match("./index.html").then((r) => (r ? r.text().then((html) => saveAssets(html, c)) : null))
        )
      )
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith("bc-") && k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 인터넷에서 받을 때는 브라우저 캐시를 다시 확인(no-cache)해서, 새 index.html과 옛 js가 섞이지 않게 함 */
function fresh(req) {
  return fetch(
    req.mode === "navigate"
      ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" })
      : new Request(req, { cache: "no-cache" })
  );
}
function put(req, res) {
  const copy = res.clone();
  return caches.open(VER).then((c) => c.put(req, copy));
}
/* index.html에 적힌 css·js를 저장 (이미 같은 주소가 있으면 건너뜀) */
function saveAssets(html, c) {
  const urls = [...String(html).matchAll(ASSET_RE)].map((m) => new URL(m[1], self.registration.scope).href);
  return Promise.all(
    urls.map((u) =>
      fetch(u, { cache: "no-cache" })
        .then((res) => (res.ok ? c.put(u, res) : null))
        .catch(() => {})
    )
  );
}
function fromCache(req) {
  return caches
    .match(req, { ignoreSearch: true })
    .then((m) => m || (req.mode === "navigate" ? caches.match("./index.html").then((x) => x || caches.match("./")) : undefined));
}
/* 화면별로 index.html을 어디서 받았는지: "net"(인터넷) / "cache"(저장본) */
const MODE = new Map();
function setMode(id, m) {
  if (!id) return;
  MODE.set(id, m);
  if (MODE.size > 50) MODE.delete(MODE.keys().next().value);
}
function networkFirst(req, clientId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r, m) => {
      if (!done && r) {
        done = true;
        setMode(clientId, m);
        resolve(r);
      }
    };
    const timer = setTimeout(() => {
      fromCache(req).then((r) => finish(r, "cache"));
    }, 2500);
    fresh(req)
      .then((res) => {
        if (res && res.ok) {
          put(req, res);
          if (req.mode === "navigate")
            res
              .clone()
              .text()
              .then((html) => caches.open(VER).then((c) => saveAssets(html, c)));
        }
        clearTimeout(timer);
        finish(res, "net");
      })
      .catch(() => {
        clearTimeout(timer);
        fromCache(req).then((m) => {
          if (!done) {
            done = true;
            setMode(clientId, "cache");
            resolve(m || Response.error());
          }
        });
      });
  });
}
/* 앱 파일(css·js): 그 화면의 index.html과 같은 쪽에서 */
function appAsset(req, clientId) {
  const m = MODE.get(clientId);
  if (m === "cache") return fromCache(req).then((r) => r || fresh(req));
  if (m === "net")
    return fresh(req)
      .then((res) => {
        if (res && res.ok) put(req, res);
        return res;
      })
      .catch(() => fromCache(req).then((r) => r || Response.error()));
  return networkFirst(req, "");
}
function configFirst(req) {
  return fetch(req, { cache: "no-cache" })
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(VER).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => fromCache(req).then((m) => m || Response.error()));
}
function cacheFirst(req) {
  /* cors 요청에 opaque 저장본을 주면 브라우저가 거부하므로 그런 저장본은 건너뜀 */
  return caches.match(req).then((m) =>
    m && !(m.type === "opaque" && req.mode === "cors")
      ? m
      : fetch(req).then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(VER).then((c) => c.put(req, copy));
          }
          return res;
        })
  );
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === self.location.origin) {
    if (/firebase-config\.js$/.test(u.pathname)) e.respondWith(configFirst(req));
    else if (req.mode === "navigate") e.respondWith(networkFirst(req, e.resultingClientId));
    else if (/(\/js\/[\w.-]+\.js|\/app\.css)$/.test(u.pathname)) e.respondWith(appAsset(req, e.clientId));
    else e.respondWith(networkFirst(req, ""));
    return;
  }
  if (
    (u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) ||
    u.hostname === "fonts.googleapis.com" ||
    u.hostname === "fonts.gstatic.com"
  ) {
    e.respondWith(cacheFirst(req));
  }
});
