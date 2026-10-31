// ค้นหาด่วน (Ctrl+K หรือปุ่มแว่นขยายบนแถบบน): พิมพ์ชื่อหน้า นักเรียน หรือรายวิชา แล้วข้ามไปทันที
import { esc, fullName, roomName } from './util.js?v=2569.10.31-10';
import { getRoster } from './data.js?v=2569.10.31-10';
import { NAV, plain, MENU_ORDER } from './menus.js?v=2569.10.31-10';
import { rank } from './search-core.js?v=2569.10.31-10';
import { openPrefs } from './prefs.js?v=2569.10.31-10';

const SYN = { daily: 'เช็กชื่อ มาเรียน ขาด ลา', meals: 'อาหาร ข้าวกลางวัน', health: 'น้ำหนัก ส่วนสูง โภชนาการ', traits: 'คุณลักษณะ กิจกรรม อ่านคิดวิเคราะห์',
  period: 'เช็กชื่อ รายคาบ', scores: 'คะแนน เกรด ปพ.5', remedial: 'แก้ 0 ร มส ซ่อม', reports: 'รายงาน พิมพ์ A4', print: 'ปพ.6 ปพ.5 ใบรับรอง เอกสาร', students: 'ทะเบียน รายชื่อ', setup: 'ผู้ใช้ ห้อง ครู วิชา' };
let rosterCache = null;                                    // นักเรียนที่โหลดแล้ว (ทั้งแอปใช้ร่วมกัน)
let open = false;

async function loadStudents(ctx) {
  if (rosterCache?.ctx === ctx) return rosterCache.items;
  const items = [];
  for (const room of ctx.myClassrooms.slice(0, 40)) {
    try {
      for (const s of await getRoster(ctx.db, room.id)) items.push({ kind: 'student', label: fullName(s), hay: `${s.student_code ?? ''} ${s.number ?? ''}`, sub: `ห้อง ${roomName(room)} · เลขที่ ${s.number ?? '-'}`, room: room.id, sid: s.id });
    } catch { /* ข้ามห้องที่โหลดไม่ได้ */ }
  }
  rosterCache = { ctx, items };
  return items;
}

export function openSearch(ctx, { logout } = {}) {
  if (open) return;
  open = true;
  const pages = MENU_ORDER.filter((v) => v !== 'home' && ctx.menus.has(v)).map((v) => ({ kind: 'page', v, label: plain(v), hay: SYN[v] || '', sub: 'ไปที่หน้า' }));
  pages.unshift({ kind: 'page', v: 'home', label: 'วันนี้ (หน้าแรก)', hay: 'หน้าแรก home', sub: 'ไปที่หน้า' });
  const courses = ctx.menus.has('scores') ? ctx.myCourses.map((k) => ({ kind: 'course', label: ctx.courseLabel(k), hay: 'คะแนน', sub: 'เปิดคะแนนรายวิชา', id: k.id })) : [];
  const acts = [{ kind: 'prefs', label: 'ตั้งค่าการแสดงผล (ธีมมืด / ขนาดตัวอักษร)', hay: 'โหมดมืด สว่าง ตัวอักษรใหญ่ ธีม', sub: 'การตั้งค่า' },
    { kind: 'logout', label: 'ออกจากระบบ', hay: 'logout', sub: 'บัญชี' }];
  let students = []; let results = []; let idx = 0;

  const wrap = document.createElement('div');
  wrap.className = 'cmdk-wrap';
  wrap.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="ค้นหาด่วน">
    <input class="cmdk-in" type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" placeholder="พิมพ์ชื่อหน้า นักเรียน หรือรายวิชา…" autocomplete="off" spellcheck="false">
    <ul class="cmdk-list" id="cmdk-list" role="listbox"></ul>
    <div class="cmdk-foot small muted">↑↓ เลือก · Enter เปิด · Esc ปิด</div></div>`;
  document.body.appendChild(wrap);
  const input = wrap.querySelector('input'); const list = wrap.querySelector('ul');

  const draw = () => {
    results = rank([...pages, ...courses, ...students, ...acts], input.value, 9);
    idx = Math.min(idx, Math.max(0, results.length - 1));
    list.innerHTML = results.length ? results.map((r, i) => `<li role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === idx}" class="${i === idx ? 'on' : ''}">
        <span class="cmdk-k k-${r.kind}"></span><span class="cmdk-t">${esc(r.label)}</span><span class="cmdk-s small muted">${esc(r.sub || '')}</span></li>`).join('')
      : '<li class="cmdk-empty muted">ไม่พบรายการที่ตรงกับที่พิมพ์</li>';
    input.setAttribute('aria-activedescendant', results.length ? `cmdk-${idx}` : '');
  };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey, true); open = false; };
  const choose = (r) => {
    if (!r) return;
    close();
    if (r.kind === 'page') location.hash = r.v;
    else if (r.kind === 'course') ctx.go('scores', { course: r.id });
    else if (r.kind === 'student') ctx.go('students', { room: r.room, student: r.sid });
    else if (r.kind === 'prefs') openPrefs();
    else if (r.kind === 'logout') logout?.();
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(results.length - 1, idx + 1); draw(); list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[idx]); }
  }
  document.addEventListener('keydown', onKey, true);
  input.addEventListener('input', () => { idx = 0; draw(); });
  list.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) choose(results[Number(li.dataset.i)]); });
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  draw(); input.focus();
  if (ctx.menus.has('students')) loadStudents(ctx).then((s) => { if (open) { students = s; draw(); } });
}

export function initSearchKey(getCtx, logout) {
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey)) {
      const ctx = getCtx(); if (!ctx?.menus) return;
      e.preventDefault(); openSearch(ctx, { logout });
    }
  });
}
