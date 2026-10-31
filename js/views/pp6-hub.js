// =====================================================================
//  ปพ.6: ตารางรายชื่อ (ล็อกการพิมพ์เมื่อเกรดยังไม่ครบ) · หน้าเกรดรายคน · สรุปเกรด (Excel)
//  ใช้ข้อมูลชุดเดียวกับหน้าพิมพ์ ปพ.6 (loadRoomYear) ไม่มีการเขียนฐานข้อมูล
// =====================================================================
import { esc, $, roomName, fullName, levelName, modal } from '../util.js?v=2569.10.31-7';
import { fmtGrade, distribution, GRADE_LABELS, weightOf } from '../grading.js?v=2569.10.31-7';
import { ACTIVITIES } from '../assess.js?v=2569.10.31-7';
import { icon } from '../icons.js?v=2569.10.31-7';
import { Sheet, buildXlsx, safeSheetName, downloadBytes } from '../xlsx-write.js?v=2569.10.31-7';

const termTxt = (t) => `ภาคเรียนที่ ${t.term} ปีการศึกษา ${t.academic_year}`;
const g2 = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(2));
const unitTxt = (s) => (s?.credits != null ? `${Number(s.credits)} นก.` : s?.hours_per_year ? `${s.hours_per_year} ชม.` : '');

// ภาคเรียนที่ใช้ตามช่วงข้อมูลที่เลือก (เหมือนหน้าพิมพ์ ปพ.6)
export const termsOf = (ctx, d, scope) => (scope === 'year' ? d.terms : d.terms.filter((t) => t.id === ctx.term.id));

// วิชาที่ยังไม่มีเกรด หรือคะแนนยังไม่ครบ ของนักเรียน 1 คน
export function missingOf(d, terms, s) {
  const out = [];
  for (const t of terms) {
    for (const r of d.perTerm[t.id].results) {
      const x = r.res[s.id];
      if (x.grade === null) out.push({ t, k: r.course, why: 'ยังไม่มีคะแนน' });
    }
  }
  return out;
}
const courseCount = (d, terms) => terms.reduce((a, t) => a + d.perTerm[t.id].results.length, 0);

export function showMissing(s, miss, multiTerm) {
  return modal('ไม่สามารถพิมพ์ ปพ.6 ได้', `
    <p style="margin:0">นักเรียน: <b>${esc(fullName(s))}</b></p>
    <p style="margin:0" class="muted">ยังไม่ได้ส่งเกรด/ให้คะแนน ${miss.length} วิชา ดังนี้</p>
    <ul class="miss-list">${miss.map((m) => `<li>${icon('lock')}<span><span><b>${esc(m.k.subject?.code ?? '')}</b> ${esc(m.k.subject?.name ?? '')}${multiTerm ? ` · ภาค ${m.t.term}` : ''}</span>
      <small>${esc(m.why)}</small></span></li>`).join('')}</ul>`,
  { okText: 'รับทราบ', cancelText: '' });
}

// ---------------------------------------------------------------------
//  ตารางรายชื่อ
// ---------------------------------------------------------------------
export function listView(box, ctx, d, { scope, onView, onPrint, onPrintAll }) {
  const terms = termsOf(ctx, d, scope);
  const nCourse = courseCount(d, terms);
  const rows = d.roster.map((s) => ({ s, miss: missingOf(d, terms, s) }));
  const locked = rows.filter((x) => x.miss.length).length;
  let q = '';

  box.innerHTML = `
    <div class="card pp6-list">
      <div class="pp6-bar">
        <div class="card-title">${icon('students')}รายชื่อนักเรียนในห้อง ${esc(roomName(d.room))} <span class="chip">${d.roster.length} คน</span></div>
        <div class="row" style="gap:8px">
          <button class="btn btn-success btn-pill" id="xl" ${nCourse ? '' : 'disabled'}>${icon('excel')}สรุปเกรด (Excel)</button>
          ${!nCourse ? `<button class="btn btn-pill" disabled>${icon('lock')}ไม่พบรายวิชาเรียน</button>`
            : locked ? `<button class="btn btn-dark btn-pill" id="all">${icon('lock')}พิมพ์ทั้งห้อง (ค้าง ${locked} คน)</button>`
            : `<button class="btn btn-success btn-pill" id="all">${icon('print')}พิมพ์ทั้งห้อง</button>`}
        </div>
      </div>
      <label class="pp6-search">${icon('search')}<input type="text" id="q" placeholder="ค้นหาชื่อหรือรหัสนักเรียน" aria-label="ค้นหาชื่อหรือรหัสนักเรียน"></label>
      <div class="tbl-wrap" style="box-shadow:none"><table class="tbl pp6-tbl"><thead><tr><th class="c">เลขที่</th><th>รหัสประจำตัว</th><th>ชื่อ - นามสกุล</th>
        <th class="c">ดูข้อมูล/ตรวจสอบเกรด</th><th class="c">พิมพ์ ปพ.6</th></tr></thead><tbody id="rows"></tbody></table></div>
    </div>`;

  const draw = () => {
    const k = q.trim().toLowerCase();
    const list = rows.filter(({ s }) => !k || fullName(s).toLowerCase().includes(k) || String(s.student_code ?? '').includes(k));
    $('#rows', box).innerHTML = list.map(({ s, miss }) => `<tr>
      <td class="c">${s.number ?? ''}</td><td class="tabular">${esc(s.student_code ?? '')}</td><td>${esc(fullName(s))}</td>
      <td class="c"><button class="btn btn-sm btn-info btn-pill" data-view="${esc(s.id)}">${icon('search')}ดูข้อมูล/เกรด</button></td>
      <td class="c">${!nCourse ? `<button class="btn btn-sm btn-pill" disabled>${icon('lock')}ไม่พบรายวิชาเรียน</button>`
        : miss.length ? `<button class="btn btn-sm btn-warn btn-pill" data-miss="${esc(s.id)}">${icon('lock')}ขาด ${miss.length} วิชา</button>`
        : `<button class="btn btn-sm btn-success btn-pill" data-print="${esc(s.id)}">${icon('print')}พิมพ์ ปพ.6</button>`}</td></tr>`).join('')
      || '<tr><td colspan="5" class="c muted">ไม่พบนักเรียน</td></tr>';
  };
  draw();

  const byId = Object.fromEntries(rows.map((x) => [x.s.id, x]));
  $('#q', box).addEventListener('input', (e) => { q = e.target.value; draw(); });
  $('#rows', box).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.view) onView(b.dataset.view);
    else if (b.dataset.print) onPrint(byId[b.dataset.print].s);
    else if (b.dataset.miss) { const x = byId[b.dataset.miss]; showMissing(x.s, x.miss, terms.length > 1); }
  });
  $('#xl', box)?.addEventListener('click', () => exportGrades(ctx, d, terms));
  $('#all', box)?.addEventListener('click', () => {
    if (!locked) return onPrintAll();
    modal('ยังพิมพ์ทั้งห้องไม่ได้', `<p style="margin:0" class="muted">นักเรียน ${locked} คน ยังมีวิชาที่ไม่มีเกรดหรือคะแนนไม่ครบ</p>
      <ul class="miss-list">${rows.filter((x) => x.miss.length).map(({ s, miss }) => `<li>${icon('lock')}<span><span><b>${s.number ?? ''}</b> ${esc(fullName(s))}</span>
        <small>ขาด ${miss.length} วิชา: ${esc(miss.map((m) => m.k.subject?.code ?? '').join(', '))}</small></span></li>`).join('')}</ul>`,
    { okText: 'รับทราบ', cancelText: '' });
  });
}

// ---------------------------------------------------------------------
//  หน้าเกรดรายคน
// ---------------------------------------------------------------------
const GRADE_COLOR = { 4: '#16a34a', 3.5: '#22c55e', 3: '#0ea5e9', 2.5: '#3b82f6', 2: '#8b5cf6', 1.5: '#f59e0b', 1: '#f97316', 0: '#dc2626', ร: '#eab308', มส: '#991b1b' };
const gClass = (g) => (g === null || g === undefined ? 'g-none' : g === 'ร' ? 'g-warn' : g === 'มส' ? 'g-bad'
  : g >= 3.5 ? 'g-hi' : g >= 2.5 ? 'g-mid' : g >= 1 ? 'g-warn' : 'g-bad');

function donut(grades) {
  const dist = distribution(grades);
  const total = GRADE_LABELS.reduce((a, g) => a + dist[g], 0);
  const pending = grades.filter((g) => g === null || g === undefined).length;
  let at = 0; const segs = [];
  for (const g of GRADE_LABELS) if (dist[g]) { const w = 360 * dist[g] / (total + pending); segs.push(`${GRADE_COLOR[g]} ${at}deg ${at + w}deg`); at += w; }
  if (pending) segs.push(`#64748b ${at}deg 360deg`);
  const legend = GRADE_LABELS.filter((g) => dist[g]).map((g) => `<span><i style="background:${GRADE_COLOR[g]}"></i>${/^\d/.test(g) ? 'เกรด ' : ''}${g} · ${dist[g]} วิชา</span>`).join('')
    + (pending ? `<span><i style="background:#64748b"></i>ยังไม่มีเกรด · ${pending} วิชา</span>` : '');
  return `<div class="donut-box"><div class="donut" style="background:conic-gradient(${segs.join(',') || '#64748b 0deg 360deg'})"></div><div class="legend">${legend || '<span>ยังไม่มีรายวิชา</span>'}</div></div>`;
}

export function studentView(box, ctx, d, sid, { scope, onBack, onPrint }) {
  const s = d.roster.find((x) => x.id === sid);
  if (!s) { onBack(); return; }
  const terms = termsOf(ctx, d, scope);
  const miss = missingOf(d, terms, s);
  const nCourse = courseCount(d, terms);
  const room = d.room;

  const termBlock = (t) => {
    const pt = d.perTerm[t.id]; const st = pt.stu[s.id];
    const credits = pt.results.reduce((a, r) => a + weightOf(r.course.subject), 0);
    const cards = pt.results.map((r) => {
      const x = r.res[s.id]; const k = r.course; const g = x.grade;
      const pct = x.total === null ? 0 : Math.max(0, Math.min(100, x.total));
      return `<div class="subj ${gClass(g)}">
        <div class="ic">${icon('book')}</div>
        <div class="meta"><b>${esc(k.subject?.name ?? '')}</b> <span class="chip">${esc(k.subject?.code ?? '')}</span>
          <div class="small muted">${esc(k.teachers.map((p) => p.full_name).join(' / ') || 'ยังไม่กำหนดครูผู้สอน')} · ${esc(unitTxt(k.subject))} · ${esc(k.subject?.subject_type ?? '')}</div></div>
        <div class="bar"><div class="small muted">คะแนนรวม <b class="tabular" style="color:var(--ink)">${x.total === null ? '-' : x.total}</b> / 100</div>
          <div class="track"><i style="width:${pct}%"></i></div>
          <div class="small muted tabular">ระหว่างภาค ${x.mid ?? '-'} / ${k.midterm_ratio} · ปลายภาค ${x.final ?? '-'} / ${k.final_ratio}${x.incomplete ? ` · <span style="color:var(--amber)">ยังไม่ครบ ${x.missing} ช่อง</span>` : ''}</div></div>
        <div class="grade"><small>ผลการเรียน</small><b>${g === null ? '-' : esc(fmtGrade(g))}</b></div>
      </div>`;
    }).join('') || '<div class="empty">ยังไม่มีรายวิชาในภาคเรียนนี้</div>';
    const acts = Object.entries(ACTIVITIES).map(([a, label]) => { const v = st.acts[a]?.passed;
      return `<div class="act"><span>${esc(label)}${a === 'club' && st.acts.club?.club_name ? ` <small class="muted">(${esc(st.acts.club.club_name)})</small>` : ''}</span>
        <span class="chip ${v === true ? 'chip-ok' : v === false ? 'chip-bad' : ''}">${v === true ? 'ผ' : v === false ? 'มผ' : '-'}</span></div>`; }).join('');
    return `
      <section class="gpa-banner">
        <div class="gpa-ring"><small>เกรดเฉลี่ย</small><b>${g2(st.gpa)}</b></div>
        <div class="gpa-info"><h2>${esc(termTxt(t))}</h2>
          <p>${pt.results.length} วิชา · ${credits} หน่วยกิต · ลำดับที่ ${st.gpaRank ?? '-'} จาก ${d.roster.length} คน</p></div>
        ${donut(pt.results.map((r) => r.res[s.id].grade))}
      </section>
      <div class="card-title" style="margin-top:4px">${icon('book')}รายวิชาพื้นฐานและเพิ่มเติม</div>
      <div class="subj-list">${cards}</div>
      <div class="card-title">${icon('traits')}กิจกรรมพัฒนาผู้เรียน</div>
      <div class="acts">${acts}</div>`;
  };

  box.innerHTML = `
    <div class="stu-head card">
      <button class="btn btn-pill" id="back">${icon('back')}กลับไปรายชื่อ</button>
      <div class="who"><b>${esc(fullName(s))}</b>
        <span class="small muted">รหัสประจำตัว ${esc(s.student_code ?? '-')} · ชั้น${esc(levelName(room.level))}/${room.room} · เลขที่ ${s.number ?? '-'}</span></div>
      ${!nCourse ? `<button class="btn btn-pill" disabled>${icon('lock')}ไม่พบรายวิชาเรียน</button>`
        : miss.length ? `<button class="btn btn-warn btn-pill" id="pr">${icon('lock')}ขาด ${miss.length} วิชา</button>`
        : `<button class="btn btn-success btn-pill" id="pr">${icon('print')}พิมพ์ ปพ.6</button>`}
    </div>
    ${terms.length > 1 ? `<div class="card" style="flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <b>ผลการเรียนเฉลี่ยตลอดปีการศึกษา ${room.academic_year}</b><span class="stat" style="text-align:right"><b>${g2(d.yearGpa[s.id])}</b><span>ลำดับที่ ${d.yearRank[s.id] ?? '-'} จาก ${d.roster.length} คน</span></span></div>` : ''}
    ${terms.map(termBlock).join('')}`;

  $('#back', box).addEventListener('click', onBack);
  $('#pr', box)?.addEventListener('click', () => (miss.length ? showMissing(s, miss, terms.length > 1) : onPrint(s)));
}

// ---------------------------------------------------------------------
//  สรุปเกรด (Excel): ต่อภาคเรียน 2 แผ่น — ใบรายงานผล (เก็บ/สอบ/รวม/เวลาเรียน/เกรด) และ สรุปเกรด (เกรด + GPA + อันดับ)
// ---------------------------------------------------------------------
const F = { name: 'Tahoma', sz: 10 };
const S = {
  title: { font: { ...F, sz: 14, b: true }, align: { h: 'center', v: 'center' } },
  head: { font: { ...F, b: true }, fill: 'D9EAD3', border: 'thin', align: { h: 'center', v: 'center', wrap: true } },
  c: { font: F, border: 'thin', align: { h: 'center', v: 'center' } },
  l: { font: F, border: 'thin', align: { v: 'center' } },
  g: { font: F, border: 'thin', align: { h: 'center', v: 'center' }, numFmt: '0.0' },
  gpa: { font: { ...F, b: true, color: '9C2A00' }, fill: 'FFF2CC', border: 'thin', align: { h: 'center', v: 'center' }, numFmt: '0.00' },
  gpaHead: { font: { ...F, b: true, color: '9C2A00' }, fill: 'FFF2CC', border: 'thin', align: { h: 'center', v: 'center', wrap: true } },
};
const gradeVal = (g) => (g === null || g === undefined ? null : g);

function sheetBase(name, lastCol) {
  const sh = new Sheet(name);
  sh.page = { paper: 9, orientation: 'landscape', left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, hCenter: true, fitToWidth: 1, fitToHeight: 0 };
  sh.freeze = { c: 4, r: 4 }; sh.printTitles = { rows: [1, 3] };
  sh.width(1, 6).width(2, 11).width(3, 26);
  sh.height(1, 24);
  return sh;
}
function studentCols(sh, r, s) {
  sh.set(1, r, s.number ?? null, S.c).set(2, r, s.student_code ?? '', S.c).set(3, r, fullName(s), S.l);
}
function leftHead(sh) {
  [['เลขที่', 1], ['รหัสประจำตัว', 2], ['ชื่อ - นามสกุล', 3]].forEach(([t, c]) => { sh.set(c, 2, t, S.head).style(c, 3, S.head).merge(c, 2, c, 3); });
}

export function exportGrades(ctx, d, terms) {
  const used = new Set(); const sheets = [];
  const room = d.room; const label = `ชั้น${levelName(room.level)}/${room.room}`;
  for (const t of terms) {
    const pt = d.perTerm[t.id]; const res = pt.results; const tag = terms.length > 1 ? ` ภาค ${t.term}` : '';
    // ใบรายงานผล
    const last = 3 + res.length * 5 + 1;
    const a = sheetBase(safeSheetName(`ใบรายงานผล${tag}`, used), last);
    a.set(1, 1, `สรุปผลการเรียนและเกรดเฉลี่ย ${label} ${termTxt(t)}`, S.title).merge(1, 1, last, 1);
    leftHead(a); a.height(2, 36);
    res.forEach((r, i) => {
      const c = 4 + i * 5; const k = r.course;
      a.set(c, 2, `${k.subject?.code ?? ''} ${k.subject?.name ?? ''} (${unitTxt(k.subject)})`, S.head).merge(c, 2, c + 4, 2);
      ['เก็บ', 'สอบ', 'รวม', 'เวลาเรียน', 'เกรด'].forEach((h, j) => { a.set(c + j, 3, h, S.head).width(c + j, j === 3 ? 9 : 6); if (j) a.style(c + j, 2, S.head); });
    });
    a.set(last, 2, 'เกรดเฉลี่ย (GPA)', S.gpaHead).style(last, 3, S.gpaHead).merge(last, 2, last, 3).width(last, 10);
    d.roster.forEach((s, n) => {
      const row = 4 + n; studentCols(a, row, s);
      res.forEach((r, i) => {
        const c = 4 + i * 5; const x = r.res[s.id]; const at = r.data.att[s.id];
        a.set(c, row, x.mid ?? null, S.c).set(c + 1, row, x.final ?? null, S.c).set(c + 2, row, x.total ?? null, S.c)
          .set(c + 3, row, at && at.total_periods ? `${at.attended}/${at.total_periods}` : '', S.c)
          .set(c + 4, row, gradeVal(x.grade), S.g);
      });
      a.set(last, row, pt.stu[s.id].gpa ?? null, S.gpa);
    });
    sheets.push(a);

    // สรุปเกรด
    const lastB = 3 + res.length + 2;
    const b = sheetBase(safeSheetName(`สรุปเกรด${tag}`, used), lastB);
    b.set(1, 1, `สรุปเฉพาะเกรด ${label} ${termTxt(t)}`, S.title).merge(1, 1, lastB, 1);
    leftHead(b); b.height(2, 30); b.height(3, 30);
    res.forEach((r, i) => {
      const c = 4 + i; const k = r.course;
      b.set(c, 2, k.subject?.code ?? '', S.head).set(c, 3, `(${unitTxt(k.subject)})`, S.head).width(c, 8);
    });
    b.set(lastB - 1, 2, 'เกรดเฉลี่ย (GPA)', S.gpaHead).style(lastB - 1, 3, S.gpaHead).merge(lastB - 1, 2, lastB - 1, 3).width(lastB - 1, 10);
    b.set(lastB, 2, 'อันดับ', S.head).style(lastB, 3, S.head).merge(lastB, 2, lastB, 3).width(lastB, 7);
    d.roster.forEach((s, n) => {
      const row = 4 + n; studentCols(b, row, s);
      res.forEach((r, i) => b.set(4 + i, row, gradeVal(r.res[s.id].grade), S.g));
      b.set(lastB - 1, row, pt.stu[s.id].gpa ?? null, S.gpa).set(lastB, row, pt.stu[s.id].gpaRank ?? null, S.c);
    });
    sheets.push(b);
  }
  const name = `สรุปเกรด ${roomName(room).replace('/', '-')} ${terms.length > 1 ? `ปี ${room.academic_year}` : `${terms[0].term}-${terms[0].academic_year}`}.xlsx`;
  downloadBytes(buildXlsx(sheets, { defaultFont: F, title: name.replace(/\.xlsx$/, '') }), name.replace(/[\\/:*?"<>|]+/g, '-'));
}
