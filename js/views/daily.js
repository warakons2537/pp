import { esc, $, toast, options, roomName, fullName, iso, todayIso, thaiDate, daysInMonth,
  THAI_MONTHS, THAI_DOW, STATUS, nextStatus } from '../util.js?v=2569.10.30-1';
import { getRoster, termMonths } from '../data.js?v=2569.10.30-1';

const pref = { room: null, mode: null, ym: null, date: null };

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms
    : [...ctx.myClassrooms, ...ctx.classrooms.filter((c) => !ctx.myClassrooms.includes(c))];
  if (!rooms.length) { el.innerHTML = '<h1>เช็กชื่อประจำวัน</h1><div class="empty">ยังไม่มีห้องเรียนในภาคเรียนนี้</div>'; return; }
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
  const rows = await ctx.db.select('daily_attendance', { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } });
  const marks = new Map(rows.map((r) => [`${r.student_id}|${r.date}`, r]));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>เช็กชื่อประจำวัน</h1>
        <p>บันทึกการมาเรียนประจำวัน ดูได้ทั้งรายวันและทั้งเดือน · ${canEdit ? '<span class="live">อัปเดตทันทีเมื่อครูคนอื่นบันทึก</span>' : 'ดูอย่างเดียว (ไม่ใช่ครูประจำชั้นห้องนี้)'}</p></div>
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
    <div class="small muted">${Object.entries(STATUS).map(([k, s]) => `<span class="chip ${s.cls}">${s.mark} = ${s.label}</span>`).join(' ')}
      ${pref.mode === 'month' && canEdit ? ' · แตะช่องเพื่อเปลี่ยนสถานะ · แตะหัววันที่เพื่อให้ทุกคนที่ยังว่าง "มา"' : ''}</div>
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
        const [r] = await ctx.db.upsert('daily_attendance', [{ student_id: sid, classroom_id: room.id, date, status }], 'student_id,date');
        if (r) marks.set(key, r);
      } else if (prev) await ctx.db.remove('daily_attendance', { student_id: sid, date });
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
      b.className = `cell ${st ? STATUS[st].cls : ''}`;
      b.textContent = st ? STATUS[st].mark : '';
      if (flash) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1300); }
      updateTotals(key.split('|')[0]);
    } else {
      sheet.querySelectorAll(`[data-k="${key}"] button`).forEach((btn) => {
        btn.classList.toggle('on', btn.dataset.s === st);
        btn.classList.toggle(STATUS[btn.dataset.s].cls, btn.dataset.s === st);
      });
      if (flash) sheet.querySelector(`[data-k="${key}"]`)?.classList.add('flash');
      updateDayCount();
    }
  }

  function updateTotals(sid) {
    const tr = sheet.querySelector(`tr[data-sid="${sid}"]`);
    if (!tr) return;
    const c = { came: 0, sick: 0, leave: 0, absent: 0 };
    for (const [k, r] of marks) if (k.startsWith(sid + '|')) { if (r.status === 'present' || r.status === 'late') c.came++; else c[r.status]++; }
    tr.querySelector('.t-came').textContent = c.came || '';
    tr.querySelector('.t-sick').textContent = c.sick || '';
    tr.querySelector('.t-leave').textContent = c.leave || '';
    tr.querySelector('.t-absent').textContent = c.absent || '';
  }

  function updateDayCount() {
    const out = $('#daycount', el);
    if (!out) return;
    const c = {}; let n = 0;
    for (const r of marks.values()) { c[r.status] = (c[r.status] || 0) + 1; n++; }
    out.innerHTML = `บันทึกแล้ว ${n}/${roster.length} คน · ${Object.entries(STATUS).map(([k, s]) => `${s.label} ${c[k] || 0}`).join(' · ')}`;
  }

  function drawMonth(box, students, m, edit) {
    const [y, m0] = pref.ym.split('-').map(Number);
    const nd = daysInMonth(y, m0);
    const days = Array.from({ length: nd }, (_, i) => new Date(y, m0, i + 1));
    const wk = (d) => d.getDay() === 0 || d.getDay() === 6;
    box.innerHTML = `<div class="tbl-wrap"><table class="reg">
      <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th>
        ${days.map((d) => `<th class="${wk(d) ? 'wk' : ''}" title="${esc(thaiDate(iso(d)))}">${edit ? `<button class="day" data-day="${iso(d)}">` : ''}${d.getDate()}<br><span style="font-weight:400">${THAI_DOW[d.getDay()]}</span>${edit ? '</button>' : ''}</th>`).join('')}
        <th>มา</th><th>ป่วย</th><th>ลา</th><th>ขาด</th></tr></thead>
      <tbody>${students.map((s) => `<tr data-sid="${esc(s.id)}"><td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td>
        ${days.map((d) => { const k = `${s.id}|${iso(d)}`; const st = m.get(k)?.status;
          return `<td class="${wk(d) ? 'wk' : ''}"><button class="cell ${st ? STATUS[st].cls : ''}" data-k="${k}" ${edit ? '' : 'disabled'} aria-label="${esc(fullName(s))} ${d.getDate()}">${st ? STATUS[st].mark : ''}</button></td>`; }).join('')}
        <td class="tot t-came st-present"></td><td class="tot t-sick"></td><td class="tot t-leave"></td><td class="tot t-absent" style="color:var(--red)"></td></tr>`).join('')}
      </tbody></table></div>`;
    students.forEach((s) => updateTotals(s.id));
    if (!edit) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button.cell');
      if (b) { const [sid, date] = b.dataset.k.split('|'); save(sid, date, nextStatus(m.get(b.dataset.k)?.status)); return; }
      const h = e.target.closest('button.day');
      if (h) fillDay(h.dataset.day);
    });
  }

  function drawDay(box, students, m, edit) {
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center">
        <b>${esc(thaiDate(pref.date))}</b>
        ${edit ? '<button class="btn btn-primary" id="allin">ทุกคนที่ยังว่าง = มา</button>' : ''}
      </div>
      <div class="small muted" id="daycount"></div>
      <div class="roll">${students.map((s) => { const k = `${s.id}|${pref.date}`; const st = m.get(k)?.status;
        return `<div class="roll-row" data-k="${k}"><span class="muted tabular">${s.number ?? ''}</span><span class="nm">${esc(fullName(s))}</span>
          <div class="seg">${Object.entries(STATUS).map(([key, v]) => `<button data-s="${key}" class="${st === key ? `on ${v.cls}` : ''}" ${edit ? '' : 'disabled'}>${v.label}</button>`).join('')}</div></div>`; }).join('')}
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

  async function fillDay(date) {
    const blank = roster.filter((s) => !marks.get(`${s.id}|${date}`));
    if (!blank.length) { toast('ทุกคนมีสถานะแล้ว'); return; }
    blank.forEach((s) => { marks.set(`${s.id}|${date}`, { student_id: s.id, date, status: 'present' }); paint(`${s.id}|${date}`); });
    try {
      const saved = await ctx.db.upsert('daily_attendance',
        blank.map((s) => ({ student_id: s.id, classroom_id: room.id, date, status: 'present' })), 'student_id,date');
      saved.forEach((r) => marks.set(`${r.student_id}|${r.date}`, r));
      toast(`บันทึก "มา" ${blank.length} คน (${thaiDate(date, true)})`);
    } catch (err) {
      blank.forEach((s) => { marks.delete(`${s.id}|${date}`); paint(`${s.id}|${date}`); });
      toast(err.message, 'err');
    }
  }

  // ---- ตัวควบคุม ----
  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; render(el, ctx); });
  $('#m-day', el).addEventListener('click', () => { pref.mode = 'day'; render(el, ctx); });
  $('#m-month', el).addEventListener('click', () => { pref.mode = 'month'; render(el, ctx); });
  $('#ym', el)?.addEventListener('change', (e) => { pref.ym = e.target.value; render(el, ctx); });
  $('#date', el)?.addEventListener('change', (e) => { if (e.target.value) { pref.date = e.target.value; render(el, ctx); } });

  // ---- เรียลไทม์ ----
  const byId = new Map(rows.map((r) => [r.id, `${r.student_id}|${r.date}`]));
  return ctx.db.subscribe('daily_attendance', { col: 'classroom_id', val: room.id }, (ev) => {
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
