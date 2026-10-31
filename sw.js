// Service worker ของ WL Admin: เก็บไฟล์ของแอปไว้ในเครื่องให้เปิดเร็วและเปิดได้แม้สัญญาณหลุด
// - ข้อมูลจากฐานข้อมูล (Supabase) ไม่ผ่านที่นี่เลย จึงสดเสมอ
// - เลขเวอร์ชันด้านล่างเปลี่ยนพร้อม js/brand.js ทุกครั้ง (มีชุดทดสอบตรวจ) แคชเวอร์ชันเก่าจะถูกล้างอัตโนมัติ
const VERSION = '2569.10.31-10';
const APP = `wl-pp-${VERSION}`;
const EXT = 'wl-pp-ext';                                       // ไลบรารี/ฟอนต์จากภายนอก (เวอร์ชันตายตัว เก็บข้ามเวอร์ชันแอปได้)
const EXT_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const CORE = ['./', 'index.html', `css/app.css?v=${VERSION}`, `css/print.css?v=${VERSION}`, `js/app.js?v=${VERSION}`,
  'manifest.webmanifest', 'img/logo-64.png', 'img/logo-192.png'];
const OFFLINE = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WL Admin · ออฟไลน์</title><body style="font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6fbf6;color:#404940;text-align:center">
<div><h2 style="color:#0f5220">ยังไม่มีสัญญาณอินเทอร์เน็ต</h2><p>เปิดแอปครั้งแรกต้องมีอินเทอร์เน็ต<br>เชื่อมต่อแล้วลองใหม่อีกครั้ง</p>
<button onclick="location.reload()" style="padding:10px 22px;border-radius:99px;border:1px solid #0f5220;background:none;color:#0f5220;font-size:1rem">ลองใหม่</button></div></body></html>`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(CORE)));    // ไม่ skipWaiting เอง: แอปจะถามผู้ใช้ก่อนอัปเดต (ไม่ให้หน้าที่กำลังกรอกถูกรีเฟรช)
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== EXT) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

const ok = (r) => r && (r.ok || r.type === 'opaque');

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (ok(res)) (await caches.open(name)).put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (ok(res)) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
async function networkFirst(req) {
  const cache = await caches.open(APP);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]);
    if (ok(res)) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match('index.html')) || (await cache.match('./'))
      || new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
    if (url.searchParams.has('v')) return e.respondWith(cacheFirst(req, APP));      // ไฟล์ที่มีเลขเวอร์ชัน = เปลี่ยนเนื้อหาเมื่อเลขเปลี่ยนเท่านั้น
    return e.respondWith(staleWhileRevalidate(req, APP));
  }
  if (url.hostname === 'fonts.googleapis.com') return e.respondWith(staleWhileRevalidate(req, EXT));
  if (EXT_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, EXT));
  // อื่นๆ (ฐานข้อมูล ฯลฯ) ไม่ยุ่ง
});
