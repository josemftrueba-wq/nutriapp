// ════════════════════════════════════════════════════════════
//  NutriApp — Service Worker (PWA)
// ════════════════════════════════════════════════════════════

const CACHE = 'nutriapp-v4';
const STATIC = [
  '/',
  '/index.html',
  '/app.html',
  '/css/styles.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Serif+Display:ital@0;1&display=swap',
];

// Instalar: cachear archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activar: limpiar cachés viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para estáticos, network-first para API
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // No cachear llamadas a Supabase ni a Claude API
  if (url.hostname.includes('supabase.co') || url.hostname.includes('anthropic.com')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first para recursos estáticos locales
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      // Cachear solo recursos válidos
      if (res && res.status === 200 && res.type === 'basic') {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return res;
    })).catch(() => {
      // Offline fallback para páginas HTML
      if (e.request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});
