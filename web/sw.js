/* De bouwstraat vult versie en bestanden in. Updates wachten op een bewuste tik. */
var VERSION = __VERSION__;
var FILES = __FILES__;
var CACHE = 'tafelberg-' + VERSION;
var ROOT = new URL('./', self.location.href).href;
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    var core = FILES.filter(function (path) { return !/\.(mp3|m4a|wav|ogg)$/i.test(path); });
    var audio = FILES.filter(function (path) { return /\.(mp3|m4a|wav|ogg)$/i.test(path); });
    return cache.addAll(core).then(function () {
      // Een ontbrekende opname mag de rest van het spel niet blokkeren.
      return Promise.all(audio.map(function (path) {
        return cache.add(path).catch(function () { return null; });
      }));
    });
  }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf('tafelberg-') === 0 && key !== CACHE; })
      .map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || event.request.url.indexOf(ROOT) !== 0) return;
  var url = new URL(event.request.url);
  // bron=app en eink=1 zijn weergavekeuzes, geen verschillende HTML-bestanden.
  var key = new URL(url.href);
  if (event.request.mode === 'navigate') {
    key.search = '';
    if (key.pathname.slice(-1) === '/') key.pathname += 'index.html';
  }
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(key.href).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (response) {
        if (response.ok && response.type !== 'opaque') {
          var copy = response.clone();
          event.waitUntil(cache.put(key.href, copy));
        }
        return response;
      }).catch(function () {
        if (event.request.mode === 'navigate') return cache.match(new URL('index.html', ROOT).href);
        return Response.error();
      });
    });
  }));
});
