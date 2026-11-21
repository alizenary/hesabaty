// Service Worker: بيخزن ملفات التطبيق عشان يفتح من غير نت.
// غيّر رقم النسخة مع كل تحديث عشان الأجهزة تنزّل الملفات الجديدة.
const VERSION = 'v0.3.0';
const CACHE = `hesabaty-${VERSION}`;
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/calc.js', './js/util.js', './js/i18n.js', './js/ui.js',
  './js/store.js', './js/txform.js', './js/views.js', './js/export.js', './js/icons.js', './js/filters.js', './js/sync.js',
  './vendor/dexie.mjs', './vendor/xlsx.mjs',
  './fonts/alexandria-arabic-wght-normal.woff2', './fonts/alexandria-latin-wght-normal.woff2', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hesabaty-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// الملفات من الكاش الأول، ولو مش موجودة من النت
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
