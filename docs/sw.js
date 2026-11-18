/* Mythras Tools offline app shell. Character saves stay in localStorage. */
const BUILD = {"version":"2e9da98661dba9aa578c","files":["134.01207e31cf7d6f29.js","222.76c6e9bc445adcf2.js","301.22fd7949b8ea2f6c.js","34.2f288a031708dcc5.js","3rdpartylicenses.txt","433.660e9dfda9cf571d.js","636.2448c8cb9a8c0b94.js","650.fb11f31851728bc4.js","756.836b370369953f0d.js","770.ed0bc62e423517dc.js","777.80a980f3282ec923.js","91.4ee86541780a91ed.js","919.0902f40111b53006.js","BaskervilleMTStd-Bold_m.bd8d33e0dcfbf3f8.woff","BaskervilleMTStd-Regular_o.0129f46778ee482c.woff","BaskervilleMTStd-Regular_o_1.5aa7cb0b1b476ba6.woff","Behistun_w.facac3b9d1b36d25.woff","MinionPro-Cn_u.90a6c1d6e57e2828.woff","MinionPro-Regular_s.29ccab3da6d759ad.woff","SavaPro-Medium_q.dd5b448617045b11.woff","assets/1/1.svg","assets/1/img/1.jpg","assets/2/2.svg","assets/2/img/1.png","assets/2/img/2.png","assets/2/img/3.png","assets/2/img/4.png","assets/2/img/5.png","assets/2/img/6.png","assets/2/img/7.png","assets/2/img/8.png","assets/2/img/9.png","assets/fonts/BaskervilleMTStd-Bold_m.woff","assets/fonts/BaskervilleMTStd-Regular_o.woff","assets/fonts/BaskervilleMTStd-Regular_o_1.woff","assets/fonts/Behistun_w.woff","assets/fonts/MinionPro-Cn_u.woff","assets/fonts/MinionPro-Regular_s.woff","assets/fonts/SavaPro-Medium_q.woff","assets/icons/adventure.svg","assets/icons/apple-touch-icon.png","assets/icons/favicon-32.png","assets/icons/icon-192.png","assets/icons/icon-512.png","assets/icons/icon-maskable-512.png","assets/tennla/sea-voyage.svg","assets/tennla/solar-city.svg","assets/ui/laurel.svg","assets/ui/sheet-icons.svg","assets/vendor/bootstrap-LICENSE.txt","assets/vendor/bootstrap.min.css","assets/vendor/bootstrap.min.js","assets/vendor/material-icons-LICENSE.txt","assets/vendor/material-icons-c22ca6e4738d.ttf","assets/vendor/material-icons.css","assets/vendor/roboto-5639371f108f.ttf","assets/vendor/roboto-LICENSE.txt","assets/vendor/roboto-c14c6f78e26d.ttf","assets/vendor/roboto-d8dc5a5f3c90.ttf","assets/vendor/roboto.css","common.fa00755aad07d78f.js","favicon.ico","index.html","main.d9654cbeeecee2d2.js","manifest.webmanifest","polyfills.e0deddc167a73452.js","runtime.ab1ca862b6027ff5.js","sea-voyage.25e58f5496b8344d.svg","solar-city.e53c804143957b06.svg","styles.f4bb807d7d6232ef.css"]};
const SCOPE = new URL(self.registration.scope);
const PREFIX = 'mythras-shell-' + encodeURIComponent(SCOPE.pathname) + '-';
const CACHE = PREFIX + BUILD.version;
const SHELL = new URL('index.html', SCOPE).href;
const FILES = new Set(BUILD.files.map(file => new URL(file, SCOPE).href));

self.addEventListener('install', event => {
  // Do not activate an update in the middle of a character-editing session.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...FILES].map(url => new Request(url,{cache:'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain the preceding shell for another tab still running its older bundles.
    const previous=(await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
    for (const key of previous.slice(0,-1)) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request=event.request;
  const url=new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(SHELL)).then(response => response || fetch(request)));
  } else if (FILES.has(url.href)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(response => response || fetch(request)));
  } else if (/\.(js|css|woff2?|ttf|png|svg)$/.test(url.pathname)) {
    event.respondWith((async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX)) {
        const response=await (await caches.open(key)).match(request);
        if (response) return response;
      }
      return fetch(request);
    })());
  }
});
