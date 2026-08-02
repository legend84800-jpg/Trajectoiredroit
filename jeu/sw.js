/* Service worker du jeu Cassation. Coquille en cache, données réseau d'abord. */
var CACHE = "cassation-v1";
var COQUILLE = ["./", "jeu.css?v=1", "jeu.js?v=1", "manifest.webmanifest"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(COQUILLE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (rep) {
      var copie = rep.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copie); });
      return rep;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
