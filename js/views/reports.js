import { esc, $, options, roomName, fullName, levelName, iso, fromIso, daysInMonth, thaiDate, todayIso,
  THAI_MONTHS, THAI_MONTHS_SHORT, STATUS } from '../util.js?v=2569.10.31-3';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.10.31-3';
import { getRoster, termMonths, termRange } from '../data.js?v=2569.10.31-3';
import { head, signs, termText } from './report-common.js?v=2569.10.31-3';
import { p5Report, gradesReport, achieveReport } from './report-grades.js?v=2569.10.31-3';
import { remedialReport } from './report-remedial.js?v=2569.10.31-3';
import { nutritionReport, traitReport } from './report-assess.js?v=2569.10.31-3';

const pref = { tab: 'month', room: null, ym: null, course: null, round: 1 };
const TABS = { month: 'เวลาเรียนประจำเดือน', term: 'สรุปเวลาเรียนภาคเรียน', course: 'เวลาเรียนรายวิชา (มส)', list: 'รายชื่อนักเรียน',
  p5: 'ปพ.5 รายวิชา', grades: 'ผลการเรียนรายชั้น', remedial: 'ติดตามแก้ 0 ร มส (ม.)', achieve: 'สรุปผลสัมฤทธิ์', nutrition: 'ภาวะโภชนาการ', traitsum: 'คุณลักษณะ/กิจกรรม' };
const COURSE_TABS = ['course', 'p5'];

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms : (ctx.myClassrooms.length ? ctx.myClassrooms : ctx.classrooms);
  const months = termMonths(ctx.term);
  if (!rooms.length || !months.length) { el.innerHTML = '<h1>รายงาน A4</h1><div class="empty">ยังไม่มีห้องเรียนหรือภาคเรียน</div>'; return; }
  if (!rooms.some((r) => r.id === pref.room)) pref.room = rooms[0].id;
  if (!pref.ym) {
    const now = new Date();
    const cur = months.find((m) => m.y === now.getFullYear() && m.m0 === now.getMonth()) || months.at(-1);
    pref.ym = `${cur.y}-${cur.m0}`;
  }
  const courses = ctx.isAdmin ? ctx.courses : [...new Set([...ctx.myCourses,
    ...ctx.courses.filter((k) => ctx.myClassrooms.some((c) => c.id === k.classroom_id))])];
  if (!courses.some((k) => k.id === pref.course)) pref.course = courses[0]?.id ?? null;
  const inFrame = window.self !== window.top;

  el.innerHTML = `
    <div class="page-head"><div><h1>รายงาน A4</h1><p>ดูตัวอย่างหน้ากระดาษ แล้วกดพิมพ์หรือบันทึกเป็น PDF</p></div>
    <div class="row no-print">
      ${COURSE_TABS.includes(pref.tab)
        ? `<label class="field">วิชา<select id="course">${options(courses, pref.course, ctx.courseLabel)}</select></label>`
        : `<label class="field">ห้อง<select id="room">${options(rooms, pref.room, (r) => `ห้อง ${roomName(r)}`)}</select></label>`}
      ${pref.tab === 'month' ? `<label class="field">เดือน<select id="ym">${months.map((m) => `<option value="${m.y}-${m.m0}" ${pref.ym === `${m.y}-${m.m0}` ? 'selected' : ''}>${THAI_MONTHS[m.m0]} ${m.y + 543}</option>`).join('')}</select></label>` : ''}
      ${pref.tab === 'nutrition' ? `<label class="field">ครั้งที่<select id="round">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${pref.round === n ? 'selected' : ''}>ครั้งที่ ${n}</option>`).join('')}</select></label>` : ''}
      <button class="btn btn-primary" id="print">พิมพ์ / บันทึก PDF</button>
      ${inFrame ? '<span class="print-note muted">หน้าทดลองนี้เปิดหน้าต่างพิมพ์ไม่ได้ เมื่อติดตั้งแอปจริงจะพิมพ์ได้ทันที</span>' : ''}
    </div></div>
    ${tabGroups([['ธุรการ', 'daily', ['month', 'term', 'course', 'list']], ['ปพ.5', 'scores', ['p5', 'grades', 'achieve', 'remedial']], ['สุขภาพ / คุณลักษณะ', 'health', ['nutrition', 'traitsum']]]
    .map(([label, ic, keys]) => ({ label, icon: ic, tabs: keys.map((k) => ({ key: k, label: esc(TABS[k]) })) })), pref.tab, 'tab', 'no-print')}
    <div class="card print-area" style="background:var(--paper)"><div class="a4-scroll" id="paper"><p class="muted">กำลังจัดหน้า…</p></div></div>`;

  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { pref.tab = b.dataset.tab; render(el, ctx); }));
  wireTabGroups(el);
  $('#room', el)?.addEventListener('change', (e) => { pref.room = e.target.value; render(el, ctx); });
  $('#ym', el)?.addEventListener('change', (e) => { pref.ym = e.target.value; render(el, ctx); });
  $('#course', el)?.addEventListener('change', (e) => { pref.course = e.target.value; render(el, ctx); });
  $('#round', el)?.addEventListener('change', (e) => { pref.round = Number(e.target.value); render(el, ctx); });
  $('#print', el).addEventListener('click', () => window.print());

  const paper = $('#paper', el);
  const room = ctx.classroomById[pref.room];
  if (pref.tab === 'month') paper.innerHTML = await monthReport(ctx, room);
  else if (pref.tab === 'term') paper.innerHTML = await termReport(ctx, room, months);
  else if (pref.tab === 'course') paper.innerHTML = pref.course ? await courseReport(ctx, ctx.courseById[pref.course]) : '<div class="empty">ยังไม่มีรายวิชา</div>';
  else if (pref.tab === 'p5') paper.innerHTML = pref.course ? await p5Report(ctx, ctx.courseById[pref.course]) : '<div class="empty">ยังไม่มีรายวิชา</div>';
  else if (pref.tab === 'grades') paper.innerHTML = await gradesReport(ctx, room);
  else if (pref.tab === 'remedial') paper.innerHTML = await remedialReport(ctx, room);
  else if (pref.tab === 'achieve') paper.innerHTML = await achieveReport(ctx, room);
  else if (pref.tab === 'nutrition') paper.innerHTML = await nutritionReport(ctx, room, pref.round);
  else if (pref.tab === 'traitsum') paper.innerHTML = await traitReport(ctx, room);
  else paper.innerHTML = await listReport(ctx, room);
}

// ---------- 1) เวลาเรียนประจำเดือน ----------
async function monthReport(ctx, room) {
  const [y, m0] = pref.ym.split('-').map(Number);
  const nd = daysInMonth(y, m0);
  const from = iso(new Date(y, m0, 1)); const to = iso(new Date(y, m0, nd));
  const [roster, rows] = await Promise.all([
    getRoster(ctx.db, room.id),
    ctx.db.select('daily_attendance', { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } }),
  ]);
  const mk = new Map(rows.map((r) => [`${r.student_id}|${r.date}`, r.status]));
  const schoolDays = [...new Set(rows.map((r) => r.date))].length;
  const days = Array.from({ length: nd }, (_, i) => iso(new Date(y, m0, i + 1)));
  const wk = (d) => [0, 6].includes(fromIso(d).getDay());
  let tot = { came: 0, sick: 0, leave: 0, absent: 0 };
  const body = roster.map((s) => {
    const c = { came: 0, sick: 0, leave: 0, absent: 0 };
    const cells = days.map((d) => { const st = mk.get(`${s.id}|${d}`); if (st) { if (st === 'present' || st === 'late') c.came++; else c[st]++; }
      return `<td style="${wk(d) ? 'background:#eee' : ''}">${st ? STATUS[st].mark : ''}</td>`; }).join('');
    Object.keys(tot).forEach((k) => { tot[k] += c[k]; });
    const pct = schoolDays ? (100 * c.came / schoolDays) : null;
    return `<tr class="${pct !== null && pct < 80 ? 'risk' : ''}"><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>${cells}
      <td>${c.came}</td><td>${c.sick}</td><td>${c.leave}</td><td>${c.absent}</td><td>${pct === null ? '-' : pct.toFixed(1)}</td></tr>`;
  }).join('');
  const dayTotals = days.map((d) => `<td>${roster.filter((s) => ['present', 'late'].includes(mk.get(`${s.id}|${d}`))).length || ''}</td>`).join('');
  return `<div class="a4 land" style="font-size:13px">
    ${head(ctx, `บันทึกเวลาเรียน ชั้น${levelName(room.level)}/${room.room}`, `ประจำเดือน${THAI_MONTHS[m0]} พ.ศ. ${y + 543} · ${termText(ctx)}`)}
    <table class="month"><colgroup><col style="width:7mm"><col style="width:46mm">${days.map(() => '<col>').join('')}<col style="width:8mm"><col style="width:8mm"><col style="width:8mm"><col style="width:8mm"><col style="width:11mm"></colgroup><thead><tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th><th colspan="${nd}">วันที่</th>
      <th rowspan="2">มา</th><th rowspan="2">ป่วย</th><th rowspan="2">ลา</th><th rowspan="2">ขาด</th><th rowspan="2">ร้อยละ</th></tr>
      <tr>${days.map((d, i) => `<th style="${wk(d) ? 'background:#eee' : ''}">${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${body}<tr><td colspan="2" class="l"><b>มาเรียน (คน)</b></td>${dayTotals}<td>${tot.came}</td><td>${tot.sick}</td><td>${tot.leave}</td><td>${tot.absent}</td><td></td></tr></tbody></table>
    <div class="legend">/ = มา · ส = สาย (นับว่ามา) · ป = ป่วย · ล = ลา · ข = ขาด · วันเปิดเรียนในเดือนนี้ ${schoolDays} วัน · แถวสีแดง = มาเรียนต่ำกว่าร้อยละ 80</div>
    ${signs(ctx, room, [{ name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' }])}
  </div>`;
}

// ---------- 2) สรุปเวลาเรียนภาคเรียน ----------
async function termReport(ctx, room, months) {
  const range = termRange(ctx.term);
  const [roster, rows, summary] = await Promise.all([
    getRoster(ctx.db, room.id),
    ctx.db.select('daily_attendance', { eq: { classroom_id: room.id }, gte: { date: range.from }, lte: { date: range.to } }),
    ctx.db.rpc('daily_attendance_summary', { cid: room.id, d_from: range.from, d_to: range.to }),
  ]);
  const sum = Object.fromEntries(summary.map((s) => [s.student_id, s]));
  const monthKey = (d) => d.slice(0, 7);
  const came = {};
  for (const r of rows) if (r.status === 'present' || r.status === 'late') {
    const k = `${r.student_id}|${monthKey(r.date)}`; came[k] = (came[k] || 0) + 1;
  }
  const ymKey = (m) => `${m.y}-${String(m.m0 + 1).padStart(2, '0')}`;
  const daysPerMonth = Object.fromEntries(months.map((m) => [ymKey(m), new Set(rows.filter((r) => monthKey(r.date) === ymKey(m)).map((r) => r.date)).size]));
  const risk = summary.filter((s) => s.pct !== null && s.pct < 80).length;
  return `<div class="a4">
    ${head(ctx, `สรุปเวลาเรียน ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <table><thead><tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th><th colspan="${months.length}">จำนวนวันมาเรียน</th><th colspan="3">รวมทั้งภาคเรียน</th></tr>
      <tr>${months.map((m) => `<th>${THAI_MONTHS_SHORT[m.m0]}</th>`).join('')}<th>เต็ม</th><th>มา</th><th>ร้อยละ</th></tr>
      <tr><td></td><td class="l">วันเปิดเรียน</td>${months.map((m) => `<td>${daysPerMonth[ymKey(m)] || '-'}</td>`).join('')}<td colspan="3"></td></tr></thead>
      <tbody>${roster.map((s) => { const x = sum[s.id] || {}; const c = (x.present || 0) + (x.late || 0);
        return `<tr class="${x.pct !== null && x.pct < 80 ? 'risk' : ''}"><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>
          ${months.map((m) => `<td>${came[`${s.id}|${ymKey(m)}`] || (daysPerMonth[ymKey(m)] ? 0 : '-')}</td>`).join('')}
          <td>${x.school_days ?? 0}</td><td>${c}</td><td>${x.pct == null ? '-' : Number(x.pct).toFixed(2)}</td></tr>`; }).join('')}</tbody></table>
    <div class="legend">นักเรียนมาเรียนต่ำกว่าร้อยละ 80: ${risk} คน (แถวสีแดง) · ข้อมูล ณ ${esc(thaiDate(todayIso()))}</div>
    ${signs(ctx, room, [{ name: ctx.settings.academic_head_name, role: 'หัวหน้างานวิชาการ' }, { name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' }])}
  </div>`;
}

// ---------- 3) เวลาเรียนรายวิชา ----------
async function courseReport(ctx, course) {
  const [roster, summary] = await Promise.all([
    getRoster(ctx.db, course.classroom_id),
    ctx.db.rpc('course_attendance_summary', { crs: course.id }),
  ]);
  const sum = Object.fromEntries(summary.map((s) => [s.student_id, s]));
  const total = summary[0]?.total_periods ?? 0;
  const bad = summary.filter((s) => s.below_80).length;
  const room = course.classroom;
  return `<div class="a4">
    ${head(ctx, 'สรุปเวลาเรียนรายวิชา', `${course.subject?.code} ${course.subject?.name} · ชั้น${levelName(room.level)}/${room.room} · ${termText(ctx)}`)}
    <table><thead><tr><th>ที่</th><th>เลขประจำตัว</th><th class="l">ชื่อ-สกุล</th><th>คาบที่มา</th><th>คาบทั้งหมด</th><th>ร้อยละ</th><th>ผล</th></tr></thead>
      <tbody>${roster.map((s) => { const x = sum[s.id] || {};
        return `<tr class="${x.below_80 ? 'risk' : ''}"><td>${s.number ?? ''}</td><td>${esc(s.student_code ?? '')}</td><td class="l">${esc(fullName(s))}</td>
          <td>${x.attended ?? 0}</td><td>${total}</td><td>${x.pct == null ? '-' : Number(x.pct).toFixed(2)}</td>
          <td>${total ? (x.below_80 ? 'มส' : 'มีสิทธิ์สอบ') : '-'}</td></tr>`; }).join('')}</tbody></table>
    <div class="legend">เกณฑ์: ต้องมีเวลาเรียนไม่น้อยกว่าร้อยละ 80 ของเวลาเรียนทั้งหมด · ไม่มีสิทธิ์สอบ (มส) ${bad} คน · เช็กชื่อแล้ว ${total} คาบ</div>
    ${signs(null, null, [...(course.teachers.length ? course.teachers : [{ full_name: '' }]).map((t) => ({ name: t.full_name, role: 'ครูผู้สอน' })),
      { name: ctx.settings.academic_head_name, role: 'หัวหน้างานวิชาการ' }])}
  </div>`;
}

// ---------- 4) รายชื่อนักเรียน ----------
async function listReport(ctx, room) {
  const roster = await getRoster(ctx.db, room.id);
  const boys = roster.filter((s) => s.gender === 'ช').length;
  return `<div class="a4">
    ${head(ctx, `รายชื่อนักเรียน ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <table><thead><tr><th style="width:9mm">ที่</th><th style="width:24mm">เลขประจำตัว</th><th class="l">ชื่อ-สกุล</th>${'<th style="width:9mm"></th>'.repeat(8)}</tr></thead>
      <tbody>${roster.map((s) => `<tr><td>${s.number ?? ''}</td><td>${esc(s.student_code ?? '')}</td><td class="l">${esc(fullName(s))}</td>${'<td></td>'.repeat(8)}</tr>`).join('')}</tbody></table>
    <div class="legend">ชาย ${boys} คน · หญิง ${roster.length - boys} คน · รวม ${roster.length} คน</div>
    ${signs(ctx, room)}
  </div>`;
}
