// ทดสอบกติกาแคชของ sw.js ด้วยสภาพแวดล้อมจำลอง (ไม่ต้องเปิดเบราว์เซอร์)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const store = new Map();                                    // ชื่อแคช → Map(url → Response)
const mkCache = (name) => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name);
  return { addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, 'https://x.test/pp/').href, { ok: true, body: u })),
    put: async (req, res) => { m.set(req.url ?? req, res); }, match: async (req) => m.get(req.url ?? new URL(req, 'https://x.test/pp/').href),
    keys: async () => [...m.keys()] }; };
const caches = { open: async (n) => mkCache(n), keys: async () => [...store.keys()], delete: async (n) => store.delete(n),
  match: async (req) => { for (const m of store.values()) { const h = m.get(req.url ?? new URL(req, 'https://x.test/pp/').href); if (h) return h; } } };
let online = true; let hits = 0; const handlers = {};
class Response { constructor(body, init = {}) { this.body = body; this.ok = true; this.init = init; } clone() { return this; } static error() { return { ok: false, error: true }; } }
const fetch = async (req) => { if (!online) throw new Error('offline'); hits++; return { ok: true, type: 'basic', url: req.url, clone() { return this; } }; };
const self = { addEventListener: (t, f) => { handlers[t] = f; }, clients: { claim: async () => {} }, skipWaiting() {} };
const ctx = vm.createContext({ self, caches, fetch, Response, URL, Promise, setTimeout, location: { origin: 'https://x.test' }, console });
vm.runInContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), ctx);

const waits = [];
const run = (ev) => { let p; handlers[ev.type]({ ...ev, waitUntil: (x) => waits.push(x), respondWith: (x) => { p = x; } }); return p; };
const get = (url, extra = {}) => run({ type: 'fetch', request: { method: 'GET', url, mode: 'cors', ...extra } });

store.set('wl-pp-old-version', new Map());
await run({ type: 'install' }); await Promise.all(waits.splice(0));
await run({ type: 'activate' }); await Promise.all(waits.splice(0));
assert.ok(!store.has('wl-pp-old-version'), 'ต้องล้างแคชเวอร์ชันเก่า');
assert.ok([...store.keys()].some((k) => k.startsWith('wl-pp-2569')));

// ไฟล์มีเลขเวอร์ชัน: ดึงครั้งเดียว ครั้งต่อไปมาจากแคช (ใช้ได้ตอนออฟไลน์)
const u = 'https://x.test/pp/js/foo.js?v=2569.1.1-1';
await get(u); const h1 = hits; await get(u); assert.equal(hits, h1, 'ต้องมาจากแคช');
online = false; assert.ok((await get(u)).ok, 'ออฟไลน์ต้องยังได้ไฟล์ที่เก็บไว้');
// เปิดหน้าตอนออฟไลน์: ได้ index.html ที่เก็บไว้ · ถ้าไม่มีอะไรเลยได้หน้าแจ้งออฟไลน์
const nav = await get('https://x.test/pp/', { mode: 'navigate' }); assert.ok(nav, 'ต้องตอบหน้าได้');
online = true;
// ฐานข้อมูล/การเขียน: ไม่ยุ่ง
assert.equal(get('https://abc.supabase.co/rest/v1/students'), undefined);
assert.equal(run({ type: 'fetch', request: { method: 'POST', url: 'https://x.test/pp/js/a.js?v=1', mode: 'cors' } }), undefined);
assert.equal(get('https://x.test/pp/sw.js'), undefined);
// ไลบรารีภายนอกเก็บในแคชแยก
await get('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1');
assert.ok(store.get('wl-pp-ext').size >= 1);
console.log('sw ok');
