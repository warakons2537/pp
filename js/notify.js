// ---------- การแจ้งเตือน "ตั้งค่าระบบยังไม่ครบ" (เห็นเฉพาะผู้ดูแลระบบ) ----------
// เพิ่มเรื่องใหม่: เพิ่มออบเจ็กต์ใน ITEMS 1 รายการ — แท็บการแจ้งเตือน จุดแดง และรายการค้าง ใช้ตามนี้เองทั้งหมด
// check(ctx) คืนข้อความเมื่อค้าง หรือ null เมื่อครบแล้ว · tab = แท็บในหน้าตั้งค่าระบบที่ต้องไปแก้
import { esc, roomName } from './util.js?v=2569.10.30-1';
import { loadGrowthRef } from './data.js?v=2569.10.30-1';

const few = (names) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} และอีก ${names.length - 3}` : names.join(', '));

export const ITEMS = [
  { key: 'users', tab: 'users', label: 'ผู้ใช้รออนุมัติ',
    check: (ctx) => { const n = ctx.profiles.filter((p) => p.role === 'pending').length; return n ? `มีผู้ใช้รออนุมัติ ${n} คน` : null; } },
  { key: 'homeroom', tab: 'rooms', label: 'ห้องเรียนที่ยังไม่มีครูประจำชั้น',
    check: (ctx) => { const r = (ctx.classrooms || []).filter((c) => !ctx.homeroomTeachers(c.id).length);
      return r.length ? `ห้องเรียน ${r.length} ห้องยังไม่มีครูประจำชั้น (${few(r.map(roomName))})` : null; } },
  { key: 'course_teacher', tab: 'subjects', label: 'รายวิชาที่ยังไม่มีครูผู้สอน',
    check: (ctx) => { const k = (ctx.courses || []).filter((x) => !x.teachers.length);
      return k.length ? `รายวิชาที่เปิดสอน ${k.length} รายการยังไม่มีครูผู้สอน` : null; } },
  { key: 'approve_date', tab: 'terms', label: 'วันที่อนุมัติผลการเรียน (ภาคเรียนปัจจุบัน)',
    check: (ctx) => (ctx.term && !ctx.term.approve_date ? `ภาคเรียนที่ ${ctx.term.term}/${ctx.term.academic_year} ยังไม่ได้กำหนดวันที่อนุมัติผลการเรียน` : null) },
  { key: 'signers', tab: 'school', label: 'ชื่อผู้อำนวยการและหัวหน้างานวิชาการ',
    check: (ctx) => { const s = ctx.settings;
      const m = [['director_name', 'ชื่อผู้อำนวยการ'], ['academic_head_name', 'ชื่อหัวหน้างานวิชาการ']].filter(([k]) => !s[k]).map(([, l]) => l);
      return m.length ? `ยังไม่ได้กรอก${m.join(' และ ')}` : null; } },
  { key: 'growth', tab: 'growth', label: 'ตารางโภชนาการ',
    check: async (ctx) => ((await loadGrowthRef(ctx.db, ctx.settings.growth_ref_set || 'excel')).size ? null : 'ยังไม่ได้โหลดตารางโภชนาการ') },
];

// ค่าที่บันทึกใน school_settings.notify = { all: true/false, off: [key ที่ปิดไว้] } · เรื่องใหม่จะเปิดเองโดยอัตโนมัติ
export const notifyConfig = (ctx) => {
  const n = ctx.settings.notify || {};
  return { all: n.all !== false, off: Array.isArray(n.off) ? n.off : [] };
};

// รายการที่ค้าง [{ key, tab, label, text }] ตามที่เปิดแจ้งเตือนไว้
export async function computeAlerts(ctx) {
  if (!ctx.isAdmin) return [];
  const cfg = notifyConfig(ctx);
  if (!cfg.all) return [];
  const out = [];
  for (const it of ITEMS) {
    if (cfg.off.includes(it.key)) continue;
    try { const text = await it.check(ctx); if (text) out.push({ key: it.key, tab: it.tab, label: it.label, text }); }
    catch (err) { console.error(err); }
  }
  return out;
}

export const badge = (n) => (n ? `<span class="nbadge" aria-label="ค้าง ${n} เรื่อง">${n > 99 ? '99+' : n}</span>` : '');

// แผงรายการค้าง → เลือกเรื่องเพื่อไปยังแท็บที่ต้องแก้
export function showAlerts(alerts, go) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="ตั้งค่าระบบที่ยังไม่ครบ">
    <h3>ตั้งค่าระบบยังไม่ครบ ${alerts.length} เรื่อง</h3>
    <div class="alert-list">${alerts.map((a) => `<button type="button" data-tab="${esc(a.tab)}"><span class="dot"></span><span>${esc(a.text)}</span><span aria-hidden="true">›</span></button>`).join('')}</div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>ปิด</button>
      <button type="button" class="btn btn-primary" data-tab="">ไปที่ตั้งค่าระบบ</button></div></div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b || e.target === wrap || e.target.closest('[data-x]')) wrap.remove();
    if (b) go(b.dataset.tab);
  });
  wrap.querySelector('.alert-list button')?.focus();
}
