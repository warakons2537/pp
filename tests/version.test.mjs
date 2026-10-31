// เลขเวอร์ชันต้องตรงกันทุกที่ (brand.js · sw.js · index.html · ?v= ในทุกไฟล์) ไม่งั้นแคชของ service worker จะค้างของเก่า
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION } from '../js/brand.js';

assert.match(VERSION, /^2569\.\d+\.\d+-\d+$/);
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.equal(/const VERSION = '([^']+)'/.exec(sw)[1], VERSION, 'sw.js ไม่ตรงกับ brand.js');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.includes(`app.css?v=${VERSION}`) && html.includes(`app.js?v=${VERSION}`), 'index.html ไม่ตรงเวอร์ชัน');

const root = new URL('..', import.meta.url).pathname;
const stale = [];
const walk = (d) => { for (const n of readdirSync(d)) {
  if (['.git', 'node_modules', 'tests', 'docs'].includes(n)) continue;
  const p = join(d, n); if (statSync(p).isDirectory()) { walk(p); continue; }
  if (!/\.(js|html|css)$/.test(n)) continue;
  for (const m of readFileSync(p, 'utf8').matchAll(/\?v=(\d{4}\.\d+\.\d+-\d+)/g)) if (m[1] !== VERSION) stale.push(`${p.replace(root, '')}: ${m[1]}`);
} };
walk(root);
assert.deepEqual(stale, [], 'มี ?v= เวอร์ชันเก่าค้าง');

// manifest: มีไอคอน maskable และทางลัด
const mf = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
assert.ok(mf.icons.some((i) => i.purpose === 'maskable') && mf.shortcuts.length >= 2);
for (const i of mf.icons) readFileSync(new URL(`../${i.src}`, import.meta.url));
console.log('version ok');
