import { esc, $, toast, options, fullName, todayIso, thaiDate, STATUS } from '../util.js?v=2569.10.27-14';
import { getRoster } from '../data.js?v=2569.10.27-14';

const pref = { course: null, date: null, period: 1 };

export async function render(el, ctx) {
  const list = ctx.myCourses;
  if (ctx.params?.course) { pref.course = ctx.params.course; ctx.params = {}; }
  if (!list.length) {
    el.innerHTML = `<div class="page-head"><div><h1>เช็กชื่อรายคาบ</h1></div></div>
      <div class="empty">ยังไม่มีวิชาที่คุณสอนในภาคเรียนนี้ ${ctx.isAdmin ? '— เพิ่มรายวิชาและครูผู้สอนได้ที่ "ตั้งค่าระบบ"' : '— กรุณาแจ้งฝ่ายวิชาการให้กำหนดครูผู้สอน'}</div>`;
    return;
  }
  if (!list.some((k) => k.id === pref.course)) pref.course = list[0].id;
  pref.date ??= todayIso();
  const course = ctx.courseById[pref.course];
  const canEdit = ctx.isAdmin || course.teachers.some((t) => t.id === ctx.me.id);
  const [roster, rows, summary] = await Promise.all([
    getRoster(ctx.db, course.classroom_id),
    ctx.db.select('period_attendance', { eq: { course_id: course.id } }),
    ctx.db.rpc('course_attendance_summary', { crs: course.id }),
  ]);
  const marks = new Map(rows.filter((r) => r.date === pref.date && r.period === Number(pref.period))
    .map((r) => [r.student_id, r]));
  const sessions = [...new Set(rows.map((r) => `${r.date}#${r.period}`))].sort().reverse();
  const sum = Object.fromEntries(summary.map((s) => [s.student_id, s]));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>เช็กชื่อรายคาบ</h1><p>บันทึกการเข้าเรียนรายคาบ และดูเวลาเรียนสะสมของวิชา · <span class="live">อัปเดตทันที</span></p></div>
      <div class="row">
        <label class="field">วิชา<select id="course">${options(list, course.id, ctx.courseLabel)}</select></label>
        <label class="field">วันที่<input type="date" id="date" value="${pref.date}"></label>
        <label class="field">คาบที่<select id="period">${options(Array.from({ length: 10 }, (_, i) => ({ id: i + 1, label: `คาบ ${i + 1}` })), pref.period)}</select></label>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:start" id="cols">
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center">
          <b>${esc(thaiDate(pref.date))} · คาบ ${pref.period}</b>
          ${canEdit ? '<button class="btn btn-primary" id="allin">ทุกคนที่ยังว่าง = มา</button>' : ''}
        </div>
        <div class="small muted" id="count"></div>
        ${roster.length ? `<div class="roll">${roster.map((s) => { const st = marks.get(s.id)?.status;
          return `<div class="roll-row" data-sid="${esc(s.id)}"><span class="muted tabular">${s.number ?? ''}</span><span class="nm">${esc(fullName(s))}</span>
            <div class="seg">${Object.entries(STATUS).map(([k, v]) => `<button data-s="${k}" class="${st === k ? `on ${v.cls}` : ''}" ${canEdit ? '' : 'disabled'}>${v.label}</button>`).join('')}</div></div>`; }).join('')}</div>`
          : '<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'}
      </div>
      <div class="card">
        <h3>เวลาเรียนสะสมวิชานี้</h3>
        <p class="small muted">ต่ำกว่า 80% มีสิทธิ์ได้ มส · นับจาก ${sessions.length} คาบที่เช็กชื่อแล้ว</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">ที่</th><th>ชื่อ</th><th class="n">มา/คาบ</th><th class="n">%</th></tr></thead>
          <tbody id="sum">${roster.map((s) => sumRow(s, sum[s.id])).join('')}</tbody></table></div>
        ${sessions.length ? `<details class="small"><summary>คาบที่เช็กแล้ว</summary>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${sessions.slice(0, 40).map((x) => { const [d, p] = x.split('#');
            return `<button class="btn btn-sm" data-go="${x}">${esc(thaiDate(d, true))} ค.${p}</button>`; }).join('')}</div></details>` : ''}
      </div>
    </div>`;
  if (window.matchMedia('(max-width: 860px)').matches) $('#cols', el).style.gridTemplateColumns = 'minmax(0,1fr)';

  function sumRow(s, x) {
    const bad = x?.below_80;
    return `<tr><td class="n">${s.number ?? ''}</td><td>${esc(s.first_name)}</td>
      <td class="n">${x ? `${x.attended}/${x.total_periods}` : '-'}</td>
      <td class="n">${x?.pct == null ? '-' : `<span class="chip ${bad ? 'chip-bad' : 'chip-ok'}">${x.pct}</span>`}</td></tr>`;
  }
  let sumTimer;
  const refreshSummary = () => {
    clearTimeout(sumTimer);
    sumTimer = setTimeout(async () => {
      const s2 = await ctx.db.rpc('course_attendance_summary', { crs: course.id });
      const m = Object.fromEntries(s2.map((s) => [s.student_id, s]));
      const tb = $('#sum', el); if (tb) tb.innerHTML = roster.map((s) => sumRow(s, m[s.id])).join('');
    }, 400);
  };
  const count = () => {
    const c = {}; for (const r of marks.values()) c[r.status] = (c[r.status] || 0) + 1;
    const out = $('#count', el);
    if (out) out.textContent = `บันทึกแล้ว ${marks.size}/${roster.length} คน · ${Object.entries(STATUS).map(([k, s]) => `${s.label} ${c[k] || 0}`).join(' · ')}`;
  };
  const paint = (sid, flash) => {
    const row = el.querySelector(`.roll-row[data-sid="${sid}"]`); if (!row) return;
    const st = marks.get(sid)?.status;
    row.querySelectorAll('button').forEach((b) => { b.className = b.dataset.s === st ? `on ${STATUS[st].cls}` : ''; });
    if (flash) { row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1300); }
    count();
  };
  count();

  const key = { course_id: course.id, date: pref.date, period: Number(pref.period) };
  async function save(sid, status) {
    const prev = marks.get(sid);
    if (status) marks.set(sid, { student_id: sid, status }); else marks.delete(sid);
    paint(sid);
    try {
      if (status) await ctx.db.upsert('period_attendance', [{ ...key, student_id: sid, status }], 'course_id,student_id,date,period');
      else await ctx.db.remove('period_attendance', { ...key, student_id: sid });
      refreshSummary();
    } catch (err) { if (prev) marks.set(sid, prev); else marks.delete(sid); paint(sid); toast(err.message, 'err'); }
  }

  el.querySelector('.roll')?.addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b || !canEdit) return;
    const sid = b.closest('[data-sid]').dataset.sid;
    save(sid, marks.get(sid)?.status === b.dataset.s ? null : b.dataset.s);
  });
  $('#allin', el)?.addEventListener('click', async () => {
    const blank = roster.filter((s) => !marks.has(s.id));
    if (!blank.length) { toast('ทุกคนมีสถานะแล้ว'); return; }
    blank.forEach((s) => { marks.set(s.id, { student_id: s.id, status: 'present' }); paint(s.id); });
    try {
      await ctx.db.upsert('period_attendance', blank.map((s) => ({ ...key, student_id: s.id, status: 'present' })), 'course_id,student_id,date,period');
      toast(`บันทึก "มา" ${blank.length} คน`); refreshSummary();
    } catch (err) { blank.forEach((s) => { marks.delete(s.id); paint(s.id); }); toast(err.message, 'err'); }
  });
  $('#course', el).addEventListener('change', (e) => { pref.course = e.target.value; render(el, ctx); });
  $('#date', el).addEventListener('change', (e) => { if (e.target.value) { pref.date = e.target.value; render(el, ctx); } });
  $('#period', el).addEventListener('change', (e) => { pref.period = Number(e.target.value); render(el, ctx); });
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const [d, p] = b.dataset.go.split('#'); pref.date = d; pref.period = Number(p); render(el, ctx);
  }));

  const ids = new Map(rows.map((r) => [r.id, r]));
  return ctx.db.subscribe('period_attendance', { col: 'course_id', val: course.id }, (ev) => {
    const r = ev.type === 'DELETE' ? (ev.old.student_id ? ev.old : ids.get(ev.old.id)) : ev.new;
    if (!r) return;
    if (ev.type !== 'DELETE') ids.set(r.id, r);
    refreshSummary();
    if (r.date !== pref.date || Number(r.period) !== Number(pref.period)) return;
    if (ev.type === 'DELETE') { if (!marks.has(r.student_id)) return; marks.delete(r.student_id); }
    else { if (marks.get(r.student_id)?.status === r.status) return; marks.set(r.student_id, r); }
    paint(r.student_id, true);
  });
}

