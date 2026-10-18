/* Service Worker — กสิกรรมไร้สารพิษ & สุขภาวะพึ่งตน
 * เปลี่ยนเลข VERSION ทุกครั้งที่แก้ไฟล์ HTML/JS เพื่อให้เครื่องผู้ใช้อัปเดต
 */
const VERSION = 'v1';
const APP_CACHE = 'app-' + VERSION;      // ไฟล์ของแอป (เปลี่ยนตามเวอร์ชัน)
const LIB_CACHE = 'libs-v1';             // ไลบรารี/ฟอนต์จาก CDN (เก็บข้ามเวอร์ชัน)

const APP_SHELL = [
  './',
  './index.html',
  './farm.html',
  './health.html',
  './pwa.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// ไลบรารีภายนอกที่หน้าเว็บเรียกใช้ — โหลดเก็บไว้ล่วงหน้าเพื่อให้ออฟไลน์ได้ทันทีหลังเปิดครั้งแรก
const CDN_LIBS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(APP_CACHE);
    await app.addAll(APP_SHELL);

    // CDN: พยายามเก็บให้ครบ แต่ถ้าบางตัวโหลดไม่ได้ก็ไม่ทำให้การติดตั้งล้มเหลว
    const libs = await caches.open(LIB_CACHE);
    await Promise.allSettled(CDN_LIBS.map(async (url) => {
      if (await libs.match(url)) return;
      const res = await fetch(new Request(url, { mode: 'no-cors' }));
      await libs.put(url, res);
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, LIB_CACHE];
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin) {
    event.respondWith(req.mode === 'navigate' ? navigate(req) : localAsset(req, event));
  } else {
    event.respondWith(cdnAsset(req));
  }
});

// หน้า HTML: ลองออนไลน์ก่อน (ได้เวอร์ชันล่าสุด) ถ้าช้าเกิน 4 วินาทีหรือออฟไลน์ ใช้จากแคช
async function navigate(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || (await cache.match('./index.html')) || Response.error();
  }
}

// ไฟล์ของแอป (ไอคอน, pwa.js ฯลฯ): ใช้แคชก่อน แล้วอัปเดตเบื้องหลัง
async function localAsset(req, event) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const refresh = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(refresh); return hit; }
  return (await refresh) || Response.error();
}

// ไลบรารี/ฟอนต์จาก CDN: ใช้แคชก่อน ไม่มีค่อยโหลดแล้วเก็บไว้ (รวมถึงไฟล์ฟอนต์ที่ CSS เรียกต่อ)
async function cdnAsset(req) {
  const cache = await caches.open(LIB_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}
