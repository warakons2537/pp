// แถบเมนูล่างสำหรับจอแคบ + แผง "เพิ่มเติม" + จัดแถบเมนูเอง
// เลือกเมนูหลักได้ 4 อัน จำเฉพาะเครื่องนี้ (localStorage) ไม่ใช้ฐานข้อมูล
import { icon } from './icons.js?v=2569.10.27-15';
import { esc, toast } from './util.js?v=2569.10.27-15';
import { badge } from './notify.js?v=2569.10.27-15';

const KEY = 'wl-bnav', MAX = 4, DEFAULT = ['home', 'daily', 'scores', 'students'];
// ชื่อเมนูที่มีจุดตัดบรรทัด (\u200b) → ห่อแต่ละท่อนไม่ให้ตัดกลางคำ
export const labelHtml = (t) => t.split('\u200b').map((w) => `<span class="w">${esc(w)}</span>`).join('\u200b');
let cur = null;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cur?.close(); });

function load(ok) {
  let a = null;
  try { a = JSON.parse(localStorage.getItem(KEY)); } catch { /* ใช้ค่าเริ่มต้น */ }
  a = Array.isArray(a) ? [...new Set(a)].filter((v) => ok.includes(v)) : [];
  return a.length === MAX ? a : DEFAULT.filter((v) => ok.includes(v));
}
const save = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* เครื่องไม่ให้จำค่า */ } };

export function mountNav(host, { labels, ok, version }) {
  let bar = load(ok), view = 'home', open = false, edit = false;
  const badges = {};   // จุดแดงจำนวนเรื่องค้าง { view: n }
  const link = (v) => `<a href="#${v}" data-v="${v}">${icon(v)}<span>${labelHtml(labels[v])}</span>${badge(badges[v])}</a>`;
  const pick = (v) => `<button type="button" class="pick${bar.includes(v) ? ' on' : ''}" data-pick="${v}" aria-pressed="${bar.includes(v)}">${icon(v)}<span>${labelHtml(labels[v])}</span></button>`;

  function draw() {
    const body = edit
      ? `<h3>จัดแถบเมนู</h3>
         <p class="small muted" style="margin:0">เลือกเมนูที่ใช้บ่อย 4 อัน (เลือกแล้ว ${bar.length}/${MAX}) · จำเฉพาะเครื่องนี้</p>
         <div class="sheet-list">${ok.map(pick).join('')}</div>
         <div class="sheet-foot"><span></span><button type="button" class="btn btn-primary" data-act="done">เสร็จสิ้น</button></div>`
      : `<div class="sheet-list">${ok.filter((v) => !bar.includes(v)).map(link).join('')}</div>
         <div class="sheet-foot"><button type="button" class="btn btn-sm" data-act="edit">จัดแถบเมนู</button><small class="muted">เวอร์ชัน ${esc(version)}</small></div>`;
    host.innerHTML = `
      <nav class="bnav no-print" aria-label="เมนูหลัก">
        ${bar.map(link).join('')}
        <button type="button" data-act="more" aria-haspopup="dialog" aria-expanded="${open}">${icon('more')}<span>เพิ่มเติม</span>${badge(ok.filter((v) => !bar.includes(v)).reduce((n, v) => n + (badges[v] || 0), 0))}</button>
      </nav>
      <div class="sheet-wrap no-print"${open ? '' : ' hidden'}>
        <div class="sheet" role="dialog" aria-modal="true" aria-label="${edit ? 'จัดแถบเมนู' : 'เมนูทั้งหมด'}"><div class="sheet-grip"></div>${body}</div>
      </div>`;
    mark();
  }
  function mark() {
    host.querySelectorAll('[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
    host.querySelector('[data-act="more"]')?.classList.toggle('on', !bar.includes(view));
  }
  function setOpen(v) {
    open = v;
    if (!v) { edit = false; if (bar.length !== MAX) bar = load(ok); }
    draw();
    if (v) host.querySelector('.sheet a, .sheet button')?.focus();
  }
  function toggle(v) {
    if (bar.includes(v)) bar = bar.filter((x) => x !== v);
    else if (bar.length < MAX) bar = ok.filter((x) => bar.includes(x) || x === v);
    else return toast('เลือกได้ไม่เกิน 4 เมนู — ยกเลิกเมนูอื่นก่อน');
    if (bar.length === MAX) save(bar);
    draw();
  }
  host.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('sheet-wrap')) return setOpen(false);
    const p = t.closest('[data-pick]'); if (p) return toggle(p.dataset.pick);
    const b = t.closest('[data-act]');
    if (!b) { if (t.closest('.sheet a')) setOpen(false); return; }
    if (b.dataset.act === 'more') setOpen(!open);
    else if (b.dataset.act === 'edit') { edit = true; draw(); }
    else if (b.dataset.act === 'done') { if (bar.length !== MAX) return toast('ต้องเลือกให้ครบ 4 เมนู'); edit = false; draw(); }
  });
  draw();
  const ctl = { setView(v) { view = v; mark(); }, setBadge(v, n) { if ((badges[v] || 0) !== n) { badges[v] = n; draw(); } }, close() { if (open) setOpen(false); } };
  cur = ctl;
  return ctl;
}
