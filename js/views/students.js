import { esc, $, modal, toast, options, roomName, fullName, thaiDate, todayIso, LEVELS } from '../util.js?v=2569.11.1-15';
import { getRoster } from '../data.js?v=2569.11.1-15';
import { readDmcFile } from '../dmc.js?v=2569.11.1-15';
import { icon } from '../icons.js?v=2569.11.1-15';
import { sortableRows } from '../reorder.js?v=2569.11.1-15';
import { reorderPlan } from '../reorder-core.js?v=2569.11.1-15';

let selected = null;   // ห้องที่เลือกค้างไว้ระหว่างเปลี่ยนหน้า
let chipFilter = 'all';   // ตัวกรองสถานะ: all | active | left

// ไอคอนในป้ายสถานะ (ป้ายต้องมีไอคอนกำกับเสมอ ตามระบบดีไซน์ WL)
const SVG_OK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"></path></svg>';
const SVG_CLOCK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M8 4.8V8l2.2 1.6"></path></svg>';

export async function render(el, ctx) {
  const rooms = ctx.myClassrooms;
  if (!rooms.length) {
    el.innerHTML = `<div class="page-head"><div><h1>นักเรียน</h1></div></div>
      <div class="empty">คุณยังไม่ได้เป็นครูประจำชั้นห้องใด ${ctx.isAdmin ? '— สร้างห้องเรียนได้ที่ "ตั้งค่าระบบ" หรือนำเข้าไฟล์ DMC ทั้งโรงเรียนด้านล่าง' : 'กรุณาแจ้งผู้ดูแลระบบ'}</div>
      ${ctx.isAdmin ? '<div><label class="btn btn-primary">นำเข้าจาก DMC (ทั้งโรงเรียน)<input type="file" id="dmc-file" accept=".xls,.xlsx,.csv" hidden></label></div>' : ''}`;
    $('#dmc-file', el)?.addEventListener('change', (e) => importFlow(e.target, ctx, null, () => render(el, ctx)));
    return;
  }
  const focusSid = ctx.params?.student || null;
  if (ctx.params?.room && rooms.some((r) => r.id === ctx.params.room)) selected = ctx.params.room;
  if (ctx.params?.room || ctx.params?.student) ctx.params = {};
  if (!rooms.some((r) => r.id === selected)) selected = rooms[0].id;
  const room = ctx.classroomById[selected];
  const roster = await getRoster(ctx.db, selected, { includeLeft: true });
  const active = roster.filter((s) => s.enroll_status !== 'left');
  const shown = [...active, ...roster.filter((s) => s.enroll_status === 'left')];     // ที่ย้ายออกแล้วอยู่ท้ายรายการ (ลากเรียงเฉพาะที่ยังเรียนอยู่)
  const boys = active.filter((s) => s.gender === 'ช').length;

  const teachers = ctx.homeroomTeachers(room.id).map((t) => t.full_name).join(', ') || '—';
  const demo = ctx.db.mode === 'demo';
  const meta = (s) => `เลขที่ <span class="g-meta-no">${s.number ?? ''}</span> · รหัส ${esc(s.student_code ?? '–')}${s.gender ? ` · ${s.gender === 'ช' ? 'ชาย' : 'หญิง'}` : ''}`;
  const pill = (s) => (s.enroll_status === 'left'
    ? `<span class="g-pill g-warn">${SVG_CLOCK}<span>ย้ายออก ${esc(thaiDate(s.left_on, true))}</span></span>`
    : `<span class="g-pill g-ok">${SVG_OK}<span>กำลังเรียน</span></span>`);
  const chips = [['all', 'ทั้งหมด', roster.length], ['active', 'กำลังเรียน', active.length], ['left', 'ย้ายออก', roster.length - active.length]];

  el.innerHTML = `
    <div class="wl-g" id="wlg">
      <header class="g-hero">
        <span class="g-logo" aria-hidden="true"><img src="img/logo-64.png" alt="" width="42" height="42"></span>
        <div class="g-hero-text">
          <div class="g-eyebrow">WL Admin</div>
          <h1 class="g-title">รายชื่อนักเรียน ${esc(roomName(room))}</h1>
          <div class="g-sub">ครูประจำชั้น: ${esc(teachers)} · ปีการศึกษา ${esc(room.academic_year)}</div>
        </div>
        <div class="g-hero-side">
          <label class="g-select"><span class="g-sr">ห้อง</span><select id="room">${options(rooms, selected, (r) => `ห้อง ${roomName(r)}`)}</select></label>
          <span class="g-tag">${demo ? 'ข้อมูลตัวอย่าง ไม่ใช่รายชื่อจริง' : `รวม ${active.length} คน`}</span>
        </div>
      </header>

      <div class="g-toolbar">
        <label class="g-btn g-btn-cta g-top" id="g-dmc">นำเข้าจาก DMC<input type="file" id="dmc-file" accept=".xls,.xlsx,.csv" hidden></label>
        <button class="g-btn" id="add" type="button">เพิ่มนักเรียน</button>
        <button class="g-btn" id="renum" type="button">เรียงเลขที่ใหม่</button>
        <span class="g-muted g-small">ชาย ${boys} · หญิง ${active.length - boys} · รวม ${active.length} คน</span>
      </div>
      ${active.length > 1 ? `<div class="ord-bar g-muted g-small" id="ord-bar" role="status"><span id="ord-msg">${icon('grip')} ลากที่ไอคอนหน้าชื่อเพื่อเรียงลำดับ แล้วเลขที่จะเปลี่ยนตามทันที (ใช้ลูกศรขึ้น/ลงแทนการลากได้)</span>
        <button class="g-btn" id="ord-undo" type="button" hidden>เลิกทำ</button></div>` : ''}

      ${roster.length ? `
      <div class="g-chips" role="group" aria-label="กรองตามสถานะ">
        ${chips.map(([k, label, n]) => `<button class="g-chip" type="button" data-chip="${k}" aria-pressed="${chipFilter === k}"><span>${label}</span><span class="g-num" style="font-weight:700">${n}</span></button>`).join('')}
      </div>
      <div class="g-panel"><div class="g-scroll">
        <table class="g-tbl stu-tbl">
          <thead><tr><th class="g-c-chk"><label class="g-chkcell"><input class="g-chk" type="checkbox" id="g-all" aria-label="เลือกทั้งหมดที่แสดงอยู่"></label></th>
            <th class="drag-h g-c-drag"><span class="g-sr">เรียงลำดับ</span></th><th class="g-c-no n">เลขที่</th><th class="g-c-sid">เลขประจำตัว</th><th class="g-c-name">ชื่อ-สกุล</th>
            <th class="g-c-sex">เพศ</th><th class="g-c-status">สถานะ</th><th class="g-c-act"><span class="g-sr">จัดการ</span></th></tr></thead>
          <tbody>${shown.map((s) => { const left = s.enroll_status === 'left'; return `<tr data-sid="${esc(s.id)}" data-eid="${esc(s.enrollment_id)}" data-st="${left ? 'left' : 'active'}" ${left ? '' : 'data-sortable'}>
            <td class="g-c-chk"><label class="g-chkcell"><input class="g-chk" type="checkbox" data-sid="${esc(s.id)}" data-eid="${esc(s.enrollment_id)}" ${left ? 'disabled' : ''} aria-label="เลือก ${esc(fullName(s))}"></label></td>
            <td class="drag-cell g-c-drag">${left ? '' : `<button type="button" class="drag" title="ลากเพื่อเรียงลำดับ" aria-label="ย้ายลำดับของ ${esc(fullName(s))} (ลากหรือกดลูกศรขึ้นลง)">${icon('grip')}</button>`}</td>
            <td class="n g-c-no g-num">${s.number ?? ''}</td><td class="g-c-sid g-num">${esc(s.student_code ?? '')}</td>
            <td class="w g-c-name">${esc(fullName(s))}</td><td class="g-c-sex">${esc(s.gender ?? '')}</td>
            <td class="g-c-status">${pill(s)}</td>
            <td class="g-c-act stu-act"><button class="g-btn g-btn-sm" type="button" data-edit="${esc(s.id)}">แก้ไข</button><button class="g-btn g-btn-sm" type="button" data-info="${esc(s.id)}">ข้อมูล DMC</button></td>
            <td class="g-c-meta g-num">${meta(s)}</td></tr>`; }).join('')}</tbody>
        </table>
        <div class="g-empty g-muted" id="g-empty" hidden>ไม่มีนักเรียนในสถานะนี้</div>
      </div></div>
      <div class="g-muted g-small">แสดง <span class="g-num" id="g-shown">${roster.length}</span> จาก <span class="g-num">${roster.length}</span> คน</div>
      <div class="g-bulk" id="g-bulk" role="region" aria-label="จัดการรายการที่เลือก" hidden>
        <div class="g-bulk-top"><div>เลือกแล้ว <span class="g-num" id="g-sel">0</span> คน</div><button class="g-btn" id="g-clear" type="button">ล้างที่เลือก</button></div>
        <div class="g-bulk-actions"><button class="g-btn g-btn-cta" id="g-leave" type="button">ย้ายออก</button></div>
      </div>`
      : '<div class="empty">ห้องนี้ยังไม่มีนักเรียน — กด "นำเข้าจาก DMC" เพื่อนำเข้ารายชื่อทั้งห้องในครั้งเดียว</div>'}
    </div>`;

  const again = () => render(el, ctx);
  $('#room', el).addEventListener('change', (e) => { selected = e.target.value; again(); });
  if (focusSid) { const tr = el.querySelector(`tr[data-sid="${CSS.escape(focusSid)}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1800); } }
  $('#dmc-file', el).addEventListener('change', (e) => importFlow(e.target, ctx, room, again));
  wireReorder(el, ctx, active, again);
  wireSelection(el, ctx, again);
  $('#add', el).addEventListener('click', () => editStudent(ctx, room, null, active.length + 1, again));
  $('#renum', el).addEventListener('click', () => renumber(ctx, active, again));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
    editStudent(ctx, room, roster.find((s) => s.id === b.dataset.edit), null, again)));
  el.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => showDmc(ctx, b.dataset.info)));
}

// เลือกหลายคน + กรองตามสถานะ + แถบจัดการลอย (ย้ายออกทีละหลายคน)
function wireSelection(el, ctx, again) {
  const tbody = el.querySelector('.stu-tbl tbody'); if (!tbody) return;
  const wrap = $('#wlg', el); const bulk = $('#g-bulk', el); const all = $('#g-all', el);
  const rows = () => [...tbody.querySelectorAll('tr[data-sid]')];
  const boxes = () => [...tbody.querySelectorAll('input.g-chk:not(:disabled)')];
  const visible = () => boxes().filter((b) => !b.closest('tr').hidden);
  const checked = () => boxes().filter((b) => b.checked);
  const sync = () => {
    const sel = checked(); const vis = visible(); const n = vis.filter((b) => b.checked).length;
    $('#g-sel', el).textContent = sel.length; bulk.hidden = !sel.length; wrap.classList.toggle('g-sel-active', !!sel.length);
    rows().forEach((tr) => tr.classList.toggle('g-selected', !!tr.querySelector('.g-chk')?.checked));
    all.checked = vis.length > 0 && n === vis.length; all.indeterminate = n > 0 && n < vis.length;
  };
  const applyChip = () => {
    let n = 0;
    rows().forEach((tr) => { const show = chipFilter === 'all' || tr.dataset.st === chipFilter; tr.hidden = !show; if (show) n++; else { const b = tr.querySelector('.g-chk'); if (b) b.checked = false; } });
    el.querySelectorAll('[data-chip]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.chip === chipFilter)));
    $('#g-shown', el).textContent = n; $('#g-empty', el).hidden = n > 0; sync();
  };
  tbody.addEventListener('change', (e) => { if (e.target.matches('.g-chk')) sync(); });
  all.addEventListener('change', () => { visible().forEach((b) => { b.checked = all.checked; }); sync(); });
  $('#g-clear', el).addEventListener('click', () => { boxes().forEach((b) => { b.checked = false; }); sync(); });
  el.querySelectorAll('[data-chip]').forEach((c) => c.addEventListener('click', () => { chipFilter = c.dataset.chip; applyChip(); }));
  $('#g-leave', el).addEventListener('click', async () => {
    const list = checked(); if (!list.length) return;
    const r = await modal(`ย้ายออกระหว่างภาค (${list.length} คน)`, `<label>วันที่ออก<input type="date" name="d" value="${todayIso()}" required></label>
      <p class="muted small">ใช้วันที่เดียวกันกับทุกคนที่เลือก ประวัติเวลาเรียนเดิมยังอยู่ และจะนับในรายงาน "ออกระหว่างภาคเรียน" ของปก ปพ.5</p>`, { okText: 'ย้ายออก' });
    if (!r) return;
    try {
      for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map((b) => ctx.db.update('enrollments', { id: b.dataset.eid }, { status: 'left', left_on: r.d })));
      toast(`ย้ายออก ${list.length} คนแล้ว`); again();
    } catch (err) { toast(err.message, 'err'); again(); }
  });
  applyChip();
}

// ---------------------------------------------------------------------
async function editStudent(ctx, room, s, nextNo, done) {
  let priv = {};
  if (s) { try { priv = (await ctx.db.select('student_private', { eq: { student_id: s.id } }))[0] || {}; } catch { /* ไม่มีสิทธิ์ */ } }
  const r = await modal(s ? 'แก้ไขข้อมูลนักเรียน' : `เพิ่มนักเรียน ห้อง ${roomName(room)}`, `
    <div class="row">
      <label>เลขที่<input type="number" id="f-no" name="number" min="1" max="99" value="${esc(s?.number ?? nextNo ?? '')}" style="width:80px"></label>
      <label>เลขประจำตัวนักเรียน<input type="text" id="f-code" name="student_code" value="${esc(s?.student_code ?? '')}"></label>
    </div>
    <div class="row">
      <label>คำนำหน้า<select id="f-prefix" name="prefix">${options(['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว'].map((x) => ({ id: x, label: x })), s?.prefix)}</select></label>
      <label>ชื่อ<input type="text" id="f-first" name="first_name" required value="${esc(s?.first_name ?? '')}"></label>
      <label>นามสกุล<input type="text" id="f-last" name="last_name" value="${esc(s?.last_name ?? '')}"></label>
    </div>
    <div class="row">
      <label>เลขประจำตัวประชาชน<input type="text" id="f-cid" name="citizen_id" inputmode="numeric" maxlength="17" value="${esc(priv.citizen_id ?? '')}"></label>
      <label>วันเกิด<input type="date" id="f-birth" name="birth_date" value="${esc(priv.birth_date ?? '')}"></label>
    </div>
    <div class="row"><label>วันที่เข้าเรียน (กรอกเฉพาะคนที่เข้าระหว่างภาคเรียน)<input type="date" id="f-entered" name="entered_on" value="${esc(s?.entered_on ?? '')}"></label></div>`);
  if (!r) return;
  const gender = /ชาย|นาย/.test(r.prefix) ? 'ช' : 'ญ';
  const row = { student_code: r.student_code.trim() || null, prefix: r.prefix, first_name: r.first_name.trim(), last_name: r.last_name.trim(), gender };
  try {
    let id = s?.id;
    if (s) await ctx.db.update('students', { id }, row);
    else id = (await ctx.db.insert('students', [row]))[0].id;
    await ctx.db.upsert('enrollments', [{ student_id: id, classroom_id: room.id, number: Number(r.number) || null, status: s?.enroll_status ?? 'active', entered_on: r.entered_on || null }], 'student_id,classroom_id');
    await ctx.db.upsert('student_private', [{ student_id: id, citizen_id: r.citizen_id.replace(/\D/g, '') || null, birth_date: r.birth_date || null }], 'student_id');
    toast('บันทึกแล้ว'); done();
  } catch (err) { toast(err.message, 'err'); }
}

async function showDmc(ctx, sid) {
  let p;
  try { p = (await ctx.db.select('student_private', { eq: { student_id: sid } }))[0]; } catch { p = null; }
  if (!p) { toast('ไม่มีข้อมูลส่วนบุคคล หรือคุณไม่มีสิทธิ์ดู (เฉพาะครูประจำชั้นและผู้ดูแลระบบ)', 'err'); return; }
  const raw = p.dmc_raw || {};
  const keys = Object.keys(raw);
  await modal('ข้อมูลจากไฟล์ DMC', keys.length
    ? `<div class="tbl-wrap"><table class="tbl"><tbody>${keys.map((k) => `<tr><th>${esc(k)}</th><td>${esc(raw[k])}</td></tr>`).join('')}</tbody></table></div>`
    : `<p>วันเกิด: ${esc(thaiDate(p.birth_date))}<br>ศาสนา: ${esc(p.religion ?? '-')}</p><p class="muted small">นักเรียนคนนี้ไม่ได้นำเข้าจาก DMC</p>`,
  { okText: 'ปิด', cancelText: '', wide: true });
}

// ลากเรียงลำดับ: เปลี่ยนเลขที่ของคนที่ยังเรียนอยู่เป็น 1..N ตามลำดับใหม่ (เฉพาะคนที่เลขที่เปลี่ยนจริง) · เลิกทำได้
function wireReorder(el, ctx, active, again) {
  const tbody = el.querySelector('.stu-tbl tbody'); if (!tbody || active.length < 2) return;
  const bar = $('#ord-msg', el); const undoBtn = $('#ord-undo', el); const hint = bar.innerHTML;
  let busy = Promise.resolve(); let prev = null;
  const paint = (rows) => rows.forEach((r, i) => { const c = r.querySelector('td.n'); if (c) c.textContent = i + 1; const m = r.querySelector('.g-meta-no'); if (m) m.textContent = i + 1; });
  const apply = (changes, key) => {                                      // changes: [{ id, to }] · เขียนทีละกลุ่มเล็ก ๆ
    return (async () => { for (let i = 0; i < changes.length; i += 8) await Promise.all(changes.slice(i, i + 8).map((c) => ctx.db.update('enrollments', { id: c.id }, { number: c[key] }))); })();
  };
  sortableRows(tbody, {
    onMove: paint,
    say: (row, n) => { bar.textContent = `ย้าย ${row.querySelector('.w')?.textContent} ไปเลขที่ ${n}`; },
    onChange: (rows) => {
      const ids = rows.map((r) => r.dataset.eid);
      let plan; try { plan = reorderPlan(active, ids); } catch (err) { toast(err.message, 'err'); again(); return; }
      paint(rows);
      if (!plan.length) { bar.innerHTML = hint; return; }
      const done = plan.map((c) => ({ id: c.id, from: c.from, to: c.to }));
      busy = busy.then(async () => {
        try {
          await apply(done, 'to');
          const byEid = new Map(active.map((s) => [s.enrollment_id, s])); done.forEach((c) => { byEid.get(c.id).number = c.to; });   // ให้ปุ่มแก้ไข ฯลฯ ใช้เลขที่ใหม่
          prev = done; bar.textContent = `จัดลำดับใหม่แล้ว (เปลี่ยนเลขที่ ${done.length} คน)`; undoBtn.hidden = false;
        } catch (err) { toast(`บันทึกลำดับไม่สำเร็จ: ${err.message}`, 'err'); again(); }
      });
    },
  });
  undoBtn.addEventListener('click', () => {
    if (!prev) return; const back = prev; prev = null; undoBtn.hidden = true;
    busy = busy.then(async () => {
      try { await apply(back.map((c) => ({ id: c.id, from: c.to, to: c.from })), 'to'); toast('เลิกทำแล้ว'); } catch (err) { toast(err.message, 'err'); }
      again();
    });
  });
}

async function renumber(ctx, active, done) {
  const r = await modal('เรียงเลขที่ใหม่', `
    <label>เรียงตาม<select name="by" id="f-by">
      <option value="gender">ชายก่อน แล้วหญิง (ตามเลขประจำตัว)</option>
      <option value="code">เลขประจำตัวนักเรียน</option>
      <option value="name">ชื่อ (ก-ฮ)</option></select></label>
    <p class="muted small">เลขที่ใหม่จะใช้กับทุกรายงานทันที</p>`, { okText: 'เรียงใหม่' });
  if (!r) return;
  const code = (s) => String(s.student_code ?? '').padStart(10, '0');
  const list = [...active].sort((a, b) =>
    r.by === 'name' ? a.first_name.localeCompare(b.first_name, 'th')
      : r.by === 'code' ? code(a).localeCompare(code(b))
        : (a.gender === b.gender ? code(a).localeCompare(code(b)) : a.gender === 'ช' ? -1 : 1));
  try {
    for (const [i, s] of list.entries()) if (s.number !== i + 1) await ctx.db.update('enrollments', { id: s.enrollment_id }, { number: i + 1 });
    toast('เรียงเลขที่แล้ว'); done();
  } catch (err) { toast(err.message, 'err'); }
}

// ---------------------------------------------------------------------
//  นำเข้า DMC: ไฟล์เดียวมีหลายห้องได้ — ผู้ดูแลระบบสร้างห้องให้อัตโนมัติ
// ---------------------------------------------------------------------
async function importFlow(input, ctx, currentRoom, done) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  let parsed;
  try { parsed = await readDmcFile(file); } catch (err) { toast(err.message, 'err'); return; }
  const { records } = parsed;
  if (!records.length) { toast('ไม่พบรายชื่อนักเรียนในไฟล์', 'err'); return; }

  // จัดกลุ่มตามชั้น/ห้องในไฟล์
  const groups = {};
  for (const r of records) {
    const key = r.level ? `${r.level}/${r.room}` : '';
    (groups[key] ??= []).push(r);
  }
  const year = ctx.term?.academic_year;
  const plan = Object.entries(groups).map(([key, recs]) => {
    let target = null; let create = false; let ok = true; let note = '';
    if (!key) { target = currentRoom; note = currentRoom ? `ไม่ระบุชั้นในไฟล์ → ห้อง ${roomName(currentRoom)}` : 'ไม่ระบุชั้นในไฟล์'; ok = !!currentRoom; }
    else {
      const [level, room] = key.split('/');
      target = ctx.classrooms.find((c) => c.level === level && String(c.room) === room);
      if (!target) {
        if (ctx.isAdmin && LEVELS.includes(level)) { create = true; note = 'สร้างห้องใหม่'; target = { level, room: Number(room) }; }
        else { ok = false; note = ctx.isAdmin ? 'ระบุชั้นไม่ถูกต้อง' : 'ยังไม่มีห้องนี้ในระบบ'; }
      } else if (!ctx.isAdmin && !ctx.myClassrooms.some((c) => c.id === target.id)) { ok = false; note = 'ไม่ใช่ห้องที่คุณเป็นครูประจำชั้น'; }
    }
    return { key, recs, target, create, ok, note };
  });
  const okGroups = plan.filter((p) => p.ok);
  const res = await modal('นำเข้าข้อมูลจาก DMC', `
    <p class="small">พบนักเรียน ${records.length} คน ในไฟล์ <b>${esc(file.name)}</b> (ชีต ${esc(parsed.sheet)})</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชั้น/ห้องในไฟล์</th><th class="n">จำนวน</th><th>นำเข้าไปที่</th></tr></thead><tbody>
      ${plan.map((p) => `<tr><td>${esc(p.key || '—')}</td><td class="n">${p.recs.length}</td>
        <td>${p.ok ? `<span class="chip chip-ok">ห้อง ${esc(roomName(p.target))}</span> ${esc(p.create ? 'สร้างห้องใหม่' : '')}`
          : `<span class="chip chip-bad">ข้าม</span> <span class="small">${esc(p.note)}</span>`}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">นักเรียนที่มีเลขประจำตัวตรงกับในระบบจะถูก<b>อัปเดต</b> ไม่สร้างซ้ำ · เลขที่เรียงตามลำดับในไฟล์ (คนที่มีเลขที่อยู่แล้วคงเลขเดิม)
      · ข้อมูลส่วนบุคคล (เลขประชาชน ผู้ปกครอง ที่อยู่) เห็นเฉพาะครูประจำชั้นและผู้ดูแลระบบ</p>`,
  { okText: okGroups.length ? `นำเข้า ${okGroups.reduce((n, p) => n + p.recs.length, 0)} คน` : 'ปิด', wide: true });
  if (!res || !okGroups.length) return;

  try {
    let added = 0; let updated = 0;
    for (const g of okGroups) {
      let room = g.target;
      if (g.create) {
        room = (await ctx.db.insert('classrooms', [{ academic_year: year, level: g.target.level, room: g.target.room }]))[0];
      }
      const r = await importRoom(ctx.db, room.id, g.recs);
      added += r.added; updated += r.updated;
    }
    toast(`นำเข้าเรียบร้อย: เพิ่มใหม่ ${added} คน · อัปเดต ${updated} คน`);
    if (okGroups.some((g) => g.create)) await ctx.refresh();
    done();
  } catch (err) { toast(err.message, 'err'); }
}

export async function importRoom(db, classroomId, recs) {
  const codes = recs.map((r) => r.student.student_code).filter(Boolean);
  const existing = codes.length ? await db.select('students', { in: { student_code: codes } }) : [];
  const byCode = Object.fromEntries(existing.map((s) => [s.student_code, s]));
  const ens = await db.select('enrollments', { eq: { classroom_id: classroomId } });
  const enBySt = Object.fromEntries(ens.map((e) => [e.student_id, e]));
  let nextNo = Math.max(0, ...ens.map((e) => e.number || 0)) + 1;

  // 1) นักเรียนใหม่
  const fresh = recs.filter((r) => !byCode[r.student.student_code]);
  const inserted = fresh.length ? await db.insert('students', fresh.map((r) => r.student)) : [];
  fresh.forEach((r, i) => { r.id = inserted[i].id; });
  recs.forEach((r) => { if (!r.id) r.id = byCode[r.student.student_code].id; });

  // 2) ลงทะเบียนเข้าห้อง (ทำก่อน เพื่อให้ครูประจำชั้นมีสิทธิ์แก้ข้อมูลนักเรียนคนนั้น)
  await db.upsert('enrollments', recs.map((r) => ({
    student_id: r.id, classroom_id: classroomId, status: 'active',
    number: enBySt[r.id]?.number ?? nextNo++,
  })), 'student_id,classroom_id');

  // 3) อัปเดตนักเรียนเดิม + ข้อมูลส่วนบุคคล
  const old = recs.filter((r) => byCode[r.student.student_code]);
  for (const r of old) await db.update('students', { id: r.id }, r.student);
  await db.upsert('student_private', recs.map((r) => ({ student_id: r.id, ...r.private })), 'student_id');
  return { added: fresh.length, updated: old.length };
}
