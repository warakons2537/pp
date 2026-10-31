import { esc, $, toast, options, roomName, fullName, iso, todayIso, thaiDate, daysInMonth,
  THAI_MONTHS, THAI_DOW } from '../util.js?v=2569.10.31-8';
import { attachSheet } from '../sheet.js?v=2569.10.31-8';
import { getRoster, termMonths } from '../data.js?v=2569.10.31-8';

// สถานะการทานอาหาร (ใช้สีเดียวกับเช็กชื่อ)
const MEAL = {
  ate: { label: 'ทาน', mark: '/', cls: 'st-present' },
  skip: { label: 'ไม่ทาน', mark: '×', cls: 'st-late' },
  absent: { label: 'ไม่มาเรียน', mark: '–', cls: 'st-sick' },
};
const MEAL_CYCLE = [null, 'ate', 'skip', 'absent'];
const nextMeal = (s) => MEAL_CYCLE[(MEAL_CYCLE.indexOf(s ?? null) + 1) % MEAL_CYCLE.length];
// จากเช็กชื่อประจำวัน: มา/สาย = ทาน · ป่วย/ลา/ขาด = ไม่มาเรียน
const FROM_DAILY = { present: 'ate', late: 'ate', sick: 'absent', leave: 'absent', absent: 'absent' };

const pref = { room: null, mode: null, ym: null, date: null };

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms
    : [...ctx.myClassrooms, ...ctx.classrooms.filter((c) => !ctx.myClassrooms.includes(c))];
  if (!rooms.length) { el.innerHTML = '<h1>เช็กอาหารกลางวัน</h1><div class="empty">ยังไม่มีห้องเรียนในภาคเรียนนี้</div>'; return; }
  if (!rooms.some((r) => r.id === pref.room)) pref.room = (ctx.myClassrooms[0] || rooms[0]).id;
  pref.mode ??= window.matchMedia('(max-width: 700px)').matches ? 'day' : 'month';
  pref.date ??= todayIso();
  const months = termMonths(ctx.term);
  const now = new Date();
  if (!pref.ym) {
    const cur = months.find((m) => m.y === now.getFullYear() && m.m0 === now.getMonth());
    pref.ym = cur ? `${cur.y}-${cur.m0}` : `${months.at(-1).y}-${months.at(-1).m0}`;
  }

  const room = ctx.classroomById[pref.room];
  const canEdit = ctx.isAdmin
    || ctx.classroomTeacherRows.some((x) => x.classroom_id === room.id && x.teacher_id === ctx.me.id);
  const roster = await getRoster(ctx.db, room.id);

  let from; let to;
  if (pref.mode === 'month') {
    const [y, m0] = pref.ym.split('-').map(Number);
    from = iso(new Date(y, m0, 1)); to = iso(new Date(y, m0, daysInMonth(y, m0)));
  } else { from = to = pref.date; }
  const rows = await ctx.db.select('meal_checks', { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } });
  const marks = new Map(rows.map((r) => [`${r.student_id}|${r.date}`, r]));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>เช็กอาหารกลางวัน</h1>
        <p>บันทึกว่านักเรียนทานอาหารกลางวันหรือไม่ · นำเข้าจากเช็กชื่อประจำวันได้ · ${canEdit ? '<span class="live">อัปเดตทันทีเมื่อครูคนอื่นบันทึก</span>' : 'ดูอย่างเดียว (ไม่ใช่ครูประจำชั้นห้องนี้)'}</p></div>
      <div class="row">
        <label class="field">ห้อง<select id="room">${options(rooms, room.id, (r) => `ห้อง ${roomName(r)}`)}</select></label>
        <div class="seg" role="group" aria-label="มุมมอง">
          <button id="m-day" class="${pref.mode === 'day' ? 'on st-present' : ''}">รายวัน</button>
          <button id="m-month" class="${pref.mode === 'month' ? 'on st-present' : ''}">ทั้งเดือน</button>
        </div>
        ${pref.mode === 'month'
          ? `<label class="field">เดือน<select id="ym">${months.map((m) => `<option value="${m.y}-${m.m0}" ${pref.ym === `${m.y}-${m.m0}` ? 'selected' : ''}>${THAI_MONTHS[m.m0]} ${m.y + 543}</option>`).join('')}</select></label>`
          : `<label class="field">วันที่<input type="date" id="date" value="${pref.date}"></label>`}
      </div>
    </div>
    <div class="small muted">${Object.values(MEAL).map((s) => `<span class="chip ${s.cls}">${s.mark} = ${s.label}</span>`).join(' ')}
      ${pref.mode === 'month' && canEdit ? ' · แตะช่องเพื่อเปลี่ยนสถานะ · แตะหัววันที่เพื่อให้ทุกคนที่ยังว่าง "ทาน"' : ''}</div>
    ${canEdit ? `<div class="row" style="margin:8px 0"><button class="btn" id="import">นำเข้าจากเช็กชื่อประจำวัน${pref.mode === 'month' ? 'ทั้งเดือน' : 'ของวันนี้'}</button>
      <span class="small muted">มา/สาย → ทาน · ป่วย/ลา/ขาด → ไม่มาเรียน · เติมเฉพาะช่องที่ยังว่าง ไม่ทับที่ครูบันทึกไว้แล้ว</span></div>` : ''}
    <div id="sheet"></div>`;

  const sheet = $('#sheet', el);
  if (!roster.length) { sheet.innerHTML = '<div class="empty">ห้องนี้ยังไม่มีนักเรียน — นำเข้ารายชื่อที่หน้า "นักเรียน"</div>'; }
  else if (pref.mode === 'month') drawMonth(sheet, roster, marks, canEdit);
  else drawDay(sheet, roster, marks, canEdit);

  // ---- บันทึก ----
  async function save(sid, date, status) {
    const key = `${sid}|${date}`;
    const prev = marks.get(key);
    if (status) marks.set(key, { ...(prev || {}), student_id: sid, date, status }); else marks.delete(key);
    paint(key);
    try {
      if (status) {
        const [r] = await ctx.db.upsert('meal_checks', [{ student_id: sid, classroom_id: room.id, date, status }], 'student_id,date');
        if (r) marks.set(key, r);
      } else if (prev) await ctx.db.remove('meal_checks', { student_id: sid, date });
    } catch (err) {
      if (prev) marks.set(key, prev); else marks.delete(key);
      paint(key); toast(err.message, 'err');
    }
  }

  function paint(key, flash = false) {
    const st = marks.get(key)?.status;
    if (pref.mode === 'month') {
      const b = sheet.querySelector(`[data-k="${key}"]`);
      if (!b) return;
      b.className = `cell ${st ? MEAL[st].cls : ''}`;
      b.textContent = st ? MEAL[st].mark : '';
      if (flash) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1300); }
      updateTotals(key.split('|')[0]);
    } else {
      sheet.querySelectorAll(`[data-k="${key}"] button`).forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.s === st);
        btn.classList.toggle(MEAL[btn.dataset.s].cls, btn.dataset.s === st);
      });
      if (flash) sheet.querySelector(`[data-k="${key}"]`)?.classList.add('flash');
      updateDayCount();
    }
  }

  function updateTotals(sid) {
    const tr = sheet.querySelector(`tr[data-sid="${sid}"]`);
    if (!tr) return;
    const c = { ate: 0, skip: 0, absent: 0 };
    for (const [k, r] of marks) if (k.startsWith(sid + '|')) c[r.status]++;
    tr.querySelector('.t-ate').textContent = c.ate || '';
    tr.querySelector('.t-skip').textContent = c.skip || '';
    tr.querySelector('.t-absent').textContent = c.absent || '';
  }

  function updateDayCount() {
    const out = $('#daycount', el);
    if (!out) return;
    const c = {}; let n = 0;
    for (const r of marks.values()) { c[r.status] = (c[r.status] || 0) + 1; n++; }
    out.innerHTML = `บันทึกแล้ว ${n}/${roster.length} คน · ${Object.entries(MEAL).map(([k, s]) => `${s.label} ${c[k] || 0}`).join(' · ')}`;
  }

  // ใช้กับลากคลุม/วาง/เติม/ลบ หลายช่อง: ตรวจค่าก่อน แล้วบันทึกครั้งเดียว (ค่าที่ไม่รู้จักจะไม่ถูกบันทึก)
  const LBL = Object.fromEntries(Object.entries(MEAL).flatMap(([k, v]) => [[v.label, k], [v.mark, k]]));
  const parseSt = (v) => { const t = String(v).trim(); return t === '' ? null : LBL[t]; };
  function saveMany(list) {
    const res = []; const ups = []; const dels = []; const olds = [];
    for (const { el, value } of list) {
      const st = parseSt(value);
      if (st === undefined) { res.push(false); continue; }
      res.push(true);
      const key = el.dataset.k; const [sid, date] = key.split('|'); const prev = marks.get(key);
      olds.push([key, prev]);
      if (st) { marks.set(key, { ...(prev || {}), student_id: sid, date, status: st }); ups.push({ student_id: sid, classroom_id: room.id, date, status: st }); }
      else { marks.delete(key); if (prev) dels.push({ student_id: sid, date }); }
      paint(key);
    }
    (async () => {
      try {
        if (ups.length) { const saved = await ctx.db.upsert('meal_checks', ups, 'student_id,date'); saved.forEach((r) => marks.set(`${r.student_id}|${r.date}`, r)); }
        for (let i = 0; i < dels.length; i += 10) await Promise.all(dels.slice(i, i + 10).map((d) => ctx.db.remove('meal_checks', d)));
      } catch (err) {
        olds.forEach(([k, p]) => { if (p) marks.set(k, p); else marks.delete(k); paint(k); });
        toast(err.message, 'err');
      }
    })();
    return res;
  }

  function drawMonth(box, students, m, edit) {
    const [y, m0] = pref.ym.split('-').map(Number);
    const days = Array.from({ length: daysInMonth(y, m0) }, (_, i) => new Date(y, m0, i + 1));
    const wk = (d) => d.getDay() === 0 || d.getDay() === 6;
    box.innerHTML = `<div class="tbl-wrap"><table class="reg">
      <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th>
        ${days.map((d) => `<th class="${wk(d) ? 'wk' : ''}" title="${esc(thaiDate(iso(d)))}">${edit ? `<button class="day" data-day="${iso(d)}">` : ''}${d.getDate()}<br><span style="font-weight:400">${THAI_DOW[d.getDay()]}</span>${edit ? '</button>' : ''}</th>`).join('')}
        <th>ทาน</th><th>ไม่ทาน</th><th>ไม่มา</th></tr></thead>
      <tbody>${students.map((s, ri) => `<tr data-sid="${esc(s.id)}"><td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td>
        ${days.map((d, ci) => { const k = `${s.id}|${iso(d)}`; const st = m.get(k)?.status;
          return `<td class="${wk(d) ? 'wk' : ''}"><button class="cell ${st ? MEAL[st].cls : ''}" data-k="${k}" data-r="${ri}" data-c="${ci}" ${edit ? '' : 'disabled'} aria-label="${esc(fullName(s))} ${d.getDate()}">${st ? MEAL[st].mark : ''}</button></td>`; }).join('')}
        <td class="tot t-ate st-present"></td><td class="tot t-skip"></td><td class="tot t-absent"></td></tr>`).join('')}
      </tbody></table></div>`;
    students.forEach((s) => updateTotals(s.id));
    attachSheet(box.querySelector('table'), { cell: 'button.cell', canEdit: edit, get: (el) => MEAL[marks.get(el.dataset.k)?.status]?.label ?? '', setBatch: saveMany });
    if (!edit) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button.cell');
      if (b) { const [sid, date] = b.dataset.k.split('|'); save(sid, date, nextMeal(m.get(b.dataset.k)?.status)); return; }
      const h = e.target.closest('button.day');
      if (h) fillDay(h.dataset.day);
    });
  }

  function drawDay(box, students, m, edit) {
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${esc(thaiDate(pref.date))}</b>
        ${edit ? '<button class="btn btn-primary" id="allin">ทุกคนที่ยังว่าง = ทาน</button>' : ''}
      </div>
      <div class="small muted" id="daycount"></div>
      <div class="roll">${students.map((s) => { const k = `${s.id}|${pref.date}`; const st = m.get(k)?.status;
        return `<div class="roll-row" data-k="${k}"><span class="muted tabular">${s.number ?? ''}</span><span class="nm">${esc(fullName(s))}</span>
          <div class="seg">${Object.entries(MEAL).map(([key, v]) => `<button data-s="${key}" class="${st === key ? `on ${v.cls}` : ''}" ${edit ? '' : 'disabled'}>${v.label}</button>`).join('')}</div></div>`; }).join('')}
      </div>`;
    updateDayCount();
    if (!edit) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) { const [sid, date] = b.closest('[data-k]').dataset.k.split('|'); const cur = m.get(`${sid}|${date}`)?.status;
        save(sid, date, cur === b.dataset.s ? null : b.dataset.s); }
    });
    $('#allin', box)?.addEventListener('click', () => fillDay(pref.date));
  }

  // เติมเฉพาะช่องที่ยังว่าง
  async function fillMany(items) {
    const fresh = items.filter((x) => !marks.get(`${x.student_id}|${x.date}`));
    if (!fresh.length) return 0;
    fresh.forEach((x) => { marks.set(`${x.student_id}|${x.date}`, { ...x }); paint(`${x.student_id}|${x.date}`); });
    try {
      const saved = await ctx.db.upsert('meal_checks', fresh.map((x) => ({ ...x, classroom_id: room.id })), 'student_id,date');
      saved.forEach((r) => marks.set(`${r.student_id}|${r.date}`, r));
    } catch (err) {
      fresh.forEach((x) => { marks.delete(`${x.student_id}|${x.date}`); paint(`${x.student_id}|${x.date}`); });
      throw err;
    }
    return fresh.length;
  }

  async function fillDay(date) {
    try {
      const n = await fillMany(roster.map((s) => ({ student_id: s.id, date, status: 'ate' })));
      toast(n ? `บันทึก "ทาน" ${n} คน (${thaiDate(date, true)})` : 'ทุกคนมีสถานะแล้ว');
    } catch (err) { toast(err.message, 'err'); }
  }

  $('#import', el)?.addEventListener('click', async () => {
    try {
      const att = await ctx.db.select('daily_attendance', { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } });
      if (!att.length) { toast('วันที่เลือกยังไม่มีการเช็กชื่อประจำวันให้นำเข้า', 'err'); return; }
      const n = await fillMany(att.filter((a) => FROM_DAILY[a.status]).map((a) => ({ student_id: a.student_id, date: a.date, status: FROM_DAILY[a.status] })));
      toast(n ? `นำเข้าจากเช็กชื่อประจำวัน ${n} ช่อง` : 'ไม่มีช่องว่างให้นำเข้า (มีข้อมูลแล้วทั้งหมด)');
    } catch (err) { toast(err.message, 'err'); }
  });

  // ---- ตัวควบคุม ----
  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; render(el, ctx); });
  $('#m-day', el).addEventListener('click', () => { pref.mode = 'day'; render(el, ctx); });
  $('#m-month', el).addEventListener('click', () => { pref.mode = 'month'; render(el, ctx); });
  $('#ym', el)?.addEventListener('change', (e) => { pref.ym = e.target.value; render(el, ctx); });
  $('#date', el)?.addEventListener('change', (e) => { if (e.target.value) { pref.date = e.target.value; render(el, ctx); } });

  // ---- เรียลไทม์ ----
  const byId = new Map(rows.map((r) => [r.id, `${r.student_id}|${r.date}`]));
  return ctx.db.subscribe('meal_checks', { col: 'classroom_id', val: room.id }, (ev) => {
    if (ev.type === 'DELETE') {
      const key = ev.old.student_id ? `${ev.old.student_id}|${ev.old.date}` : byId.get(ev.old.id);
      if (!key || !marks.has(key)) return;
      marks.delete(key); paint(key, true); return;
    }
    const r = ev.new;
    if (r.date < from || r.date > to) return;
    const key = `${r.student_id}|${r.date}`;
    byId.set(r.id, key);
    if (marks.get(key)?.status === r.status) { marks.set(key, r); return; }
    marks.set(key, r); paint(key, true);
  });
}
