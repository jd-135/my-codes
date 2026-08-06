// PCDP OTP Service Worker
const CACHE_NAME = 'pcdp-otp-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  // Network first for API calls, Cache fallback for static assets
  if (e.request.url.includes('/api/otp') || e.request.url.includes('/.netlify/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
