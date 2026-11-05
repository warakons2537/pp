import { attachSheet } from '../sheet.js?v=2569.11.1-32';
import { esc, $, toast, modal, options, fullName, confirmBox, levelName } from '../util.js?v=2569.11.1-32';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.11.1-32';
import { courseRoster } from '../data.js?v=2569.11.1-32';
import { loadCourse, computeStudent, fmtGrade, ROUNDING } from '../grading.js?v=2569.11.1-32';
import { exportAchievement, readAchievementFile, planImport, applyImport } from '../achievement-io.js?v=2569.11.1-32';
import { normIndicatorCode, indKey, levelMismatch, parseIndicatorLines, syncCourse, syncSubject, syncableCourses } from '../indicators.js?v=2569.11.1-32';

const pref = { course: null, tab: 'scores', termId: null, level: '', subject: '' };
const KIND = { score: 'คะแนนเก็บระหว่างภาค', final: 'สอบปลายภาค', indicator: 'ตัวชี้วัด (ผ/มผ)' };

// เลือกหลายแถวแล้วลบพร้อมกัน: ช่องติ๊กแถว [data-sel=<กลุ่ม>] + ช่องเลือกทั้งหมด [data-selall=<กลุ่ม>] + ปุ่ม [data-delsel=<กลุ่ม>]
const selTh = (grp, can) => (can ? `<th style="width:34px"><input type="checkbox" data-selall="${grp}" aria-label="เลือกทั้งหมด"></th>` : '');
const selTd = (grp, id, can) => (can ? `<td data-l="เลือก"><input type="checkbox" data-sel="${grp}" value="${id}" aria-label="เลือกแถวนี้"></td>` : '');
const selBar = (grp, can, n) => (can && n ? `<button class="btn btn-sm btn-danger" data-delsel="${grp}" disabled>ลบที่เลือก</button>` : '');
function wireSelect(pane, grp, onDelete) {
  const rows = () => [...pane.querySelectorAll(`[data-sel="${grp}"]`)];
  const all = pane.querySelector(`[data-selall="${grp}"]`); const btn = pane.querySelector(`[data-delsel="${grp}"]`);
  if (!btn) return;
  const picked = () => rows().filter((c) => c.checked).map((c) => c.value);
  const sync = () => { const n = picked().length; btn.disabled = !n; btn.textContent = n ? `ลบที่เลือก (${n})` : 'ลบที่เลือก';
    if (all) { all.checked = n > 0 && n === rows().length; all.indeterminate = n > 0 && n < rows().length; } };
  rows().forEach((c) => c.addEventListener('change', sync));
  all?.addEventListener('change', () => { rows().forEach((c) => { c.checked = all.checked; }); sync(); });
  btn.addEventListener('click', () => onDelete(picked()));
}

// มุมมองของภาคเรียนที่เลือก: ภาคปัจจุบันใช้ข้อมูลกลางของแอป ภาคอื่น/ปีอื่นอ่านห้องและรายวิชาจากฐานข้อมูล
// คืน ctx สำเนาที่ term / classrooms / courses / myCourses เป็นของภาคนั้น (หน้าอื่นที่รับ ctx ไปใช้ต่อได้เหมือนเดิม)
async function viewCtx(real, termObj) {
  if (termObj.id === real.term?.id) return real;
  const rooms = termObj.academic_year === real.term?.academic_year ? real.classrooms : await real.db.select('classrooms', { eq: { academic_year: termObj.academic_year } });
  const byRoom = Object.fromEntries(rooms.map((c) => [c.id, c]));
  const order = (c) => ['อ', 'ป', 'ม'].indexOf(c.level[0]) * 100 + Number(c.level.split('.')[1]) * 10 + c.room;
  const rows = await real.db.select('courses', { eq: { term_id: termObj.id } });
  const courses = rows.filter((k) => byRoom[k.classroom_id]).map((k) => ({ ...k, subject: real.subjectById[k.subject_id], classroom: byRoom[k.classroom_id],
    teachers: real.courseTeacherRows.filter((x) => x.course_id === k.id).map((x) => real.profileById[x.teacher_id]).filter(Boolean) }))
    .sort((a, b) => order(a.classroom) - order(b.classroom) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return { ...real, term: termObj, classrooms: rooms, courses, courseById: Object.fromEntries(courses.map((k) => [k.id, k])),
    myCourses: real.isAdmin ? courses : courses.filter((k) => k.teachers.some((t) => t.id === real.me.id)) };
}
const termPicker = (real, termObj) => `<label class="field">ภาคเรียน<select id="sc-term">${[...real.terms].sort((a, b) => b.academic_year - a.academic_year || b.term - a.term)
  .map((t) => `<option value="${esc(t.id)}" ${t.id === termObj.id ? 'selected' : ''}>ภาคเรียนที่ ${t.term}/${t.academic_year}${t.id === real.term?.id ? ' (ปัจจุบัน)' : ''}</option>`).join('')}</select></label>`;

export async function render(el, real) {
  if (real.params?.course) { pref.course = real.params.course; if (real.params.tab) pref.tab = real.params.tab; real.params = {}; }
  const termObj = real.terms.find((t) => t.id === pref.termId) || real.term;
  if (termObj.id !== pref.termId) pref.termId = termObj.id;
  const ctx = await viewCtx(real, termObj);
  const list = ctx.myCourses;
  const wireTerm = () => $('#sc-term', el)?.addEventListener('change', (e) => { pref.termId = e.target.value; pref.course = null; render(el, real); });
  if (!list.length) {
    el.innerHTML = `<div class="page-head"><div><h1>คะแนนรายวิชา</h1></div><div class="row">${termPicker(real, termObj)}</div></div>
      <div class="empty">ยังไม่มีวิชาที่คุณสอนในภาคเรียนที่ ${termObj.term}/${termObj.academic_year} ${ctx.isAdmin ? '— เปิดสอนวิชาได้ที่ "ตั้งค่าระบบ → รายวิชา" หรือเลือกภาคเรียนอื่นด้านบน' : '— เลือกภาคเรียนอื่นด้านบน หรือแจ้งผู้ดูแลระบบ'}</div>`;
    wireTerm();
    return;
  }
  // ตัวกรอง: ระดับชั้น → วิชา (ตัวเลือกวิชาแคบลงตามระดับชั้นที่เลือก) แล้วจึงเลือกห้อง/วิชาที่จะกรอก
  const levels = [...new Set(list.map((k) => k.classroom.level))];
  if (!levels.includes(pref.level)) pref.level = '';
  const byLevel = pref.level ? list.filter((k) => k.classroom.level === pref.level) : list;
  const subjOf = new Map(byLevel.map((k) => [k.subject_id, `${k.subject?.code ?? ''} ${k.subject?.name ?? ''}`.trim()]));
  if (pref.subject && !subjOf.has(pref.subject)) pref.subject = '';
  const shown = pref.subject ? byLevel.filter((k) => k.subject_id === pref.subject) : byLevel;
  if (!shown.some((k) => k.id === pref.course)) pref.course = shown[0].id;
  const course = ctx.courseById[pref.course];
  const canEdit = ctx.isAdmin || course.teachers.some((t) => t.id === ctx.me.id);
  const rounding = ctx.settings.score_rounding || 'floor';
  let [roster, data] = await Promise.all([courseRoster(ctx, course), loadCourse(ctx.db, course)]);
  // ตัวชี้วัดกลางของรายวิชา: ใส่ตัวที่ห้องนี้ยังไม่มี (ยังไม่ได้รัน schema ใหม่ = ข้ามไป)
  const master = await ctx.db.select('subject_indicators', { eq: { subject_id: course.subject_id } }).catch(() => []);
  if (canEdit && await syncCourse(ctx.db, course.id, master, data.items).catch(() => 0)) data = await loadCourse(ctx.db, course);
  const items = data.items;
  const byKind = (k) => items.filter((i) => i.kind === k);
  if (!items.length && pref.tab !== 'items') pref.tab = 'items';

  el.innerHTML = `
    <div class="page-head">
      <div><h1>คะแนนรายวิชา</h1>
        <p>กรอกคะแนน ตัดเกรด และประเมินตัวชี้วัดรายวิชา · ${esc(course.subject?.credits ? `${course.subject.credits} หน่วยกิต` : course.subject?.hours_per_year ? `${course.subject.hours_per_year} ชม./ปี` : '')}
          · ระหว่างภาค:ปลายภาค ${course.midterm_ratio}:${course.final_ratio} · <span class="live">อัปเดตทันที</span></p></div>
      <div class="row">${termPicker(real, termObj)}
        <label class="field">ระดับชั้น<select id="f-level"><option value="">ทุกระดับชั้น</option>${levels.map((l) => `<option value="${esc(l)}" ${pref.level === l ? 'selected' : ''}>${esc(levelName(l))}</option>`).join('')}</select></label>
        <label class="field">กรองตามวิชา<select id="f-subj"><option value="">ทุกวิชา</option>${[...subjOf].sort((a, b) => a[1].localeCompare(b[1], 'th')).map(([id, n]) => `<option value="${esc(id)}" ${pref.subject === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="field">วิชา/ห้อง${shown.length !== list.length ? ` (${shown.length}/${list.length})` : ''}<select id="course">${options(shown, course.id, ctx.courseLabel)}</select></label>
        <button class="btn" id="xls" ${items.length ? '' : 'disabled'} title="ไฟล์ Excel แบบบันทึกผลสัมฤทธิ์ (แผ่นงานผลสัมฤทธิ์) มีสูตรคำนวณ แก้ต่อใน Excel ได้">ส่งออก Excel</button></div>
    </div>
    ${tabGroups([
      { label: 'บันทึกผล', icon: 'scores', tabs: [{ key: 'scores', label: 'คะแนนและเกรด', disabled: !items.length }, { key: 'indicators', label: 'ตัวชี้วัด (ผ/มผ)' }] },
      { label: 'ตั้งค่า', icon: 'setup', tabs: [{ key: 'items', label: 'ตั้งค่าช่องคะแนน' }] }], pref.tab)}
    <div id="pane"></div>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { pref.tab = b.dataset.tab; render(el, real); }));
  wireTabGroups(el); wireTerm();
  $('#f-level', el).addEventListener('change', (e) => { pref.level = e.target.value; pref.subject = ''; pref.course = null; render(el, real); });
  $('#f-subj', el).addEventListener('change', (e) => { pref.subject = e.target.value; pref.course = null; render(el, real); });
  $('#course', el).addEventListener('change', (e) => { pref.course = e.target.value; render(el, real); });
  const pane = $('#pane', el);
  const again = () => render(el, real);
  $('#xls', el).addEventListener('click', () => exportDialog(ctx, course));

  if (pref.tab === 'items') return itemsTab(pane, ctx, course, data.items, canEdit, again, master);
  if (!roster.length) { pane.innerHTML = '<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'; return; }
  if (pref.tab === 'indicators' && !byKind('indicator').length) {
    pane.innerHTML = `<div class="card"><h3>วิชานี้ยังไม่มีตัวชี้วัด</h3><p class="small">เพิ่มรหัสตัวชี้วัดก่อน (เช่น ท 1.1 ม.1/1) แล้วจึงบันทึกผ่าน/ไม่ผ่านรายคนได้</p>
      ${canEdit ? '<button class="btn btn-primary" id="to-items">ไปเพิ่มตัวชี้วัด</button>' : '<p class="small muted">ให้ครูผู้สอนหรือผู้ดูแลระบบเพิ่มตัวชี้วัด</p>'}</div>`;
    $('#to-items', pane)?.addEventListener('click', () => { pref.tab = 'items'; render(el, real); });
    return;
  }
  return pref.tab === 'indicators'
    ? indicatorsTab(pane, ctx, course, roster, data, canEdit)
    : scoresTab(pane, ctx, course, roster, data, canEdit, rounding, again);
}

// =====================================================================
//  แท็บคะแนน: ตารางแบบ Excel
// =====================================================================
function scoresTab(pane, ctx, course, roster, data, canEdit, rounding, again) {
  const scoreItems = data.items.filter((i) => i.kind === 'score');
  const finalItems = data.items.filter((i) => i.kind === 'final');
  const cols = [...scoreItems, ...finalItems];          // ช่องที่กรอกได้ เรียงซ้ายไปขวา
  const rawMax = scoreItems.reduce((s, i) => s + Number(i.max_score || 0), 0);
  const finMax = finalItems.reduce((s, i) => s + Number(i.max_score || 0), 0);

  const calc = (sid) => {
    const res = data.results[sid] || {};
    return computeStudent(data.items, (itemId) => data.scoreMap.get(`${itemId}|${sid}`), {
      midRatio: course.midterm_ratio, finalRatio: course.final_ratio, rounding,
      special: res.special || null, msWaived: !!res.ms_waived, below80: !!data.att[sid]?.below_80,
    });
  };
  const gradeChip = (r) => {
    if (r.grade === null) return '<span class="muted">–</span>';
    const g = fmtGrade(r.grade);
    const cls = r.grade === 'มส' || r.grade === 0 ? 'chip-bad' : r.grade === 'ร' ? 'chip-warn' : r.grade >= 3 ? 'chip-ok' : 'chip-info';
    const tip = [r.reason, r.incomplete ? `ยังไม่มีคะแนน ${r.missing} ช่อง (นับเป็น 0)` : ''].filter(Boolean).join(' · ');
    return `<span class="chip ${cls}" title="${esc(tip)}">${g}${r.incomplete ? '<sup>*</sup>' : ''}</span>`;
  };
  const specialSel = (sid) => {
    const res = data.results[sid] || {};
    const below = !!data.att[sid]?.below_80;
    const v = res.special || (res.ms_waived ? 'waive' : '');
    return `<select class="sp" data-sid="${sid}" ${canEdit ? '' : 'disabled'} aria-label="หมายเหตุ">
      <option value="">${below ? 'มส อัตโนมัติ' : 'ปกติ'}</option><option value="ร" ${v === 'ร' ? 'selected' : ''}>ร (รอผล)</option>
      <option value="มส" ${v === 'มส' ? 'selected' : ''}>มส (กำหนดเอง)</option>
      ${below ? `<option value="waive" ${v === 'waive' ? 'selected' : ''}>ยกเว้น มส</option>` : ''}</select>`;
  };
  const att = (sid) => { const a = data.att[sid]; return a?.total_periods ? `<span class="${a.below_80 ? 'chip chip-bad' : 'muted'}">${Number(a.pct).toFixed(0)}%</span>` : '<span class="muted">–</span>'; };

  pane.innerHTML = `
    <div class="small muted">กรอกแล้วบันทึกอัตโนมัติ · ลูกศร/Enter เลื่อนช่อง · คัดลอกคะแนนจาก Excel มาวางได้ทั้งคอลัมน์หรือทั้งตาราง ·
      ปัดเศษ: ${esc(ROUNDING[rounding]?.label)} · มส คิดจากเวลาเรียนรายคาบต่ำกว่า 80% · <b>*</b> = ยังมีช่องคะแนนว่าง (นับเป็น 0)</div>
    <div class="tbl-wrap"><table class="reg sheet" id="grid">
      <thead><tr><th class="no" rowspan="2">ที่</th><th class="name" rowspan="2">ชื่อ-สกุล</th>
        ${scoreItems.map((i) => `<th class="ih" title="${esc(i.title || '')}">${esc(i.title || i.code || '')}</th>`).join('')}
        <th class="calc">เก็บ</th><th class="calc">ระหว่างภาค</th>
        ${finalItems.map((i) => `<th class="ih">${esc(i.title || 'ปลายภาค')}</th>`).join('')}
        <th class="calc">ปลายภาค</th><th class="calc">รวม</th><th class="calc">เกรด</th><th>เวลาเรียน</th><th>หมายเหตุ</th></tr>
        <tr>${scoreItems.map((i) => `<th class="mx">${Number(i.max_score)}</th>`).join('')}
          <th class="mx">${rawMax}</th><th class="mx">${course.midterm_ratio}</th>
          ${finalItems.map((i) => `<th class="mx">${Number(i.max_score)}</th>`).join('')}
          <th class="mx">${course.final_ratio}</th><th class="mx">100</th><th></th><th></th><th></th></tr></thead>
      <tbody>${roster.map((s, r) => { const x = calc(s.id); return `<tr data-sid="${s.id}">
        <td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td>
        ${cols.map((it, c) => { const v = data.scoreMap.get(`${it.id}|${s.id}`)?.score;
          const cell = `<td><input class="sc" data-r="${r}" data-c="${c}" data-item="${it.id}" data-sid="${s.id}" inputmode="decimal" autocomplete="off"
            value="${v === null || v === undefined ? '' : Number(v)}" ${canEdit ? '' : 'readonly'} aria-label="${esc(it.title)} ${esc(s.first_name)}"></td>`;
          return c === scoreItems.length ? `<td class="calc c-raw">${x.rawSum}</td><td class="calc c-mid">${x.mid ?? ''}</td>${cell}` : cell; }).join('')}
        ${!finalItems.length ? `<td class="calc c-raw">${x.rawSum}</td><td class="calc c-mid">${x.mid ?? ''}</td>` : ''}
        <td class="calc c-fin">${x.final ?? ''}</td><td class="calc c-tot"><b>${x.total ?? ''}</b></td><td class="calc c-grade">${gradeChip(x)}</td>
        <td class="c-att">${att(s.id)}</td><td>${specialSel(s.id)}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td></td><td class="name"><b>เฉลี่ย</b></td>${cols.map((it, c) => `${c === scoreItems.length ? '<td></td><td class="calc f-mid"></td>' : ''}<td class="calc f-col" data-c="${c}"></td>`).join('')}
        ${!finalItems.length ? '<td></td><td class="calc f-mid"></td>' : ''}<td class="calc f-fin"></td><td class="calc f-tot"></td><td colspan="3" class="f-dist small"></td></tr></tfoot>
    </table></div>`;

  const grid = $('#grid', pane);
  const input = (r, c) => grid.querySelector(`input.sc[data-r="${r}"][data-c="${c}"]`);

  const refreshRow = (sid, flash) => {
    const tr = grid.querySelector(`tr[data-sid="${sid}"]`); if (!tr) return;
    const x = calc(sid);
    tr.querySelector('.c-raw').textContent = x.rawSum;
    tr.querySelector('.c-mid').textContent = x.mid ?? '';
    tr.querySelector('.c-fin').textContent = x.final ?? '';
    tr.querySelector('.c-tot').innerHTML = `<b>${x.total ?? ''}</b>`;
    tr.querySelector('.c-grade').innerHTML = gradeChip(x);
    if (flash) { tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1300); }
    refreshFooter();
  };
  const refreshFooter = () => {
    const avg = (arr) => { const v = arr.filter((n) => n !== null && n !== undefined); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : ''; };
    cols.forEach((it, c) => { grid.querySelector(`.f-col[data-c="${c}"]`).textContent = avg(roster.map((s) => { const v = data.scoreMap.get(`${it.id}|${s.id}`)?.score; return v === null || v === undefined ? null : Number(v); })); });
    const xs = roster.map((s) => calc(s.id));
    grid.querySelector('.f-mid').textContent = avg(xs.map((x) => x.mid));
    grid.querySelector('.f-fin').textContent = avg(xs.map((x) => x.final));
    grid.querySelector('.f-tot').textContent = avg(xs.map((x) => x.total));
    const d = {}; xs.forEach((x) => { if (x.grade !== null) { const g = fmtGrade(x.grade); d[g] = (d[g] || 0) + 1; } });
    grid.querySelector('.f-dist').textContent = Object.entries(d).sort((a, b) => (parseFloat(b[0]) || -1) - (parseFloat(a[0]) || -1)).map(([g, n]) => `${g}: ${n}`).join(' · ');
  };
  refreshFooter();

  // ---- บันทึกคะแนน ----
  const parse = (txt, it) => {
    const t = String(txt).trim();
    if (t === '' || t === '-') return { ok: true, v: null };
    const v = Number(t.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return { ok: false, msg: `"${t}" ไม่ใช่ตัวเลข` };
    if (v > Number(it.max_score)) return { ok: false, msg: `${v} เกินคะแนนเต็ม ${Number(it.max_score)} (${it.title})` };
    return { ok: true, v };
  };
  const itemById = Object.fromEntries(cols.map((i) => [i.id, i]));
  let queue = []; let timer = null;
  const flush = async () => {
    const batch = queue; queue = []; if (!batch.length) return;
    try { await ctx.db.upsert('item_scores', batch, 'item_id,student_id'); }
    catch (err) { toast(err.message, 'err'); }
  };
  const commit = (inp, raw) => {
    const it = itemById[inp.dataset.item]; const sid = inp.dataset.sid;
    const p = parse(raw ?? inp.value, it);
    if (!p.ok) { inp.classList.add('bad'); toast(p.msg, 'err'); return false; }
    inp.classList.remove('bad');
    const key = `${it.id}|${sid}`;
    const prev = data.scoreMap.get(key)?.score;
    inp.value = p.v === null ? '' : p.v;
    if ((prev === null || prev === undefined ? null : Number(prev)) === p.v) return true;
    data.scoreMap.set(key, { ...(data.scoreMap.get(key) || {}), item_id: it.id, student_id: sid, score: p.v });
    queue = queue.filter((q) => !(q.item_id === it.id && q.student_id === sid));
    queue.push({ item_id: it.id, student_id: sid, score: p.v });
    clearTimeout(timer); timer = setTimeout(flush, 250);
    refreshRow(sid);
    return true;
  };

  attachSheet(grid, { cell: 'input.sc', canEdit, get: (el) => el.value, set: (el, v) => commit(el, v) });
  if (canEdit) {
    grid.addEventListener('focusin', (e) => { if (e.target.matches('input.sc')) e.target.select(); });
    grid.addEventListener('change', (e) => { if (e.target.matches('input.sc')) commit(e.target); });
    grid.addEventListener('keydown', (e) => {
      const inp = e.target.closest('input.sc'); if (!inp) return;
      const r = Number(inp.dataset.r); const c = Number(inp.dataset.c);
      const move = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
      if (!move) return;
      e.preventDefault();
      const next = input(r + move[0], c + move[1]);
      if (next) next.focus(); else inp.blur();
    });
    grid.addEventListener('paste', (e) => {
      const inp = e.target.closest('input.sc'); if (!inp) return;
      const text = e.clipboardData.getData('text');
      if (!/[\t\n]/.test(text.trim())) return;            // ค่าเดียว ใช้การวางปกติ
      e.preventDefault();
      const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
      const r0 = Number(inp.dataset.r); const c0 = Number(inp.dataset.c);
      let n = 0; let bad = 0;
      rows.forEach((line, i) => line.forEach((val, j) => {
        const target = input(r0 + i, c0 + j);
        if (!target) return;
        if (commit(target, val)) n++; else bad++;
      }));
      toast(bad ? `วางแล้ว ${n} ช่อง · มีปัญหา ${bad} ช่อง (สีแดง)` : `วางคะแนนแล้ว ${n} ช่อง`, bad ? 'err' : 'ok');
    });
    grid.addEventListener('change', async (e) => {
      const sel = e.target.closest('select.sp'); if (!sel) return;
      const sid = sel.dataset.sid; const v = sel.value;
      const row = { course_id: course.id, student_id: sid, special: ['ร', 'มส'].includes(v) ? v : null, ms_waived: v === 'waive' };
      data.results[sid] = row; refreshRow(sid);
      try { await ctx.db.upsert('course_results', [row], 'course_id,student_id'); toast('บันทึกหมายเหตุแล้ว'); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  // ---- เรียลไทม์ ----
  const ids = new Set(data.items.map((i) => i.id));
  const offs = [
    ctx.db.subscribe('item_scores', null, (ev) => {
      const s = ev.type === 'DELETE' ? ev.old : ev.new;
      if (!ids.has(s.item_id)) return;
      const key = `${s.item_id}|${s.student_id}`;
      const cur = data.scoreMap.get(key)?.score;
      if (ev.type !== 'DELETE' && (cur === null || cur === undefined ? null : Number(cur)) === (s.score === null ? null : Number(s.score))) return;
      if (ev.type === 'DELETE') data.scoreMap.delete(key); else data.scoreMap.set(key, s);
      const inp = grid.querySelector(`input.sc[data-item="${s.item_id}"][data-sid="${s.student_id}"]`);
      if (inp && document.activeElement !== inp) inp.value = s.score === null || s.score === undefined || ev.type === 'DELETE' ? '' : Number(s.score);
      refreshRow(s.student_id, true);
    }),
    ctx.db.subscribe('course_results', { col: 'course_id', val: course.id }, (ev) => {
      if (ev.type === 'DELETE') return;
      data.results[ev.new.student_id] = ev.new;
      const sel = grid.querySelector(`select.sp[data-sid="${ev.new.student_id}"]`);
      if (sel) sel.value = ev.new.special || (ev.new.ms_waived ? 'waive' : '');
      refreshRow(ev.new.student_id, true);
    }),
    ctx.db.subscribe('assessment_items', { col: 'course_id', val: course.id }, () => {
      toast('ครูอีกท่านแก้ไขช่องคะแนนของวิชานี้ หน้าจอจึงโหลดใหม่'); setTimeout(again, 600);
    }),
  ];
  return () => { flush(); offs.forEach((f) => f()); };
}

// =====================================================================
//  แท็บตัวชี้วัด: ผ / มผ
// =====================================================================
function indicatorsTab(pane, ctx, course, roster, data, canEdit) {
  const inds = data.items.filter((i) => i.kind === 'indicator');
  const val = (it, sid) => data.scoreMap.get(`${it.id}|${sid}`)?.passed;
  const mark = (p) => (p === true ? 'ผ' : p === false ? 'มผ' : '');
  const summary = (sid) => {
    let p = 0; let f = 0; inds.forEach((it) => { const v = val(it, sid); if (v === true) p++; else if (v === false) f++; });
    return { p, f, res: p + f === 0 ? '' : f ? 'มผ' : 'ผ' };
  };
  pane.innerHTML = `
    <div class="small muted">แตะช่องเพื่อสลับ ผ → มผ → ว่าง · แตะหัวคอลัมน์ = ทุกคนที่ยังว่างเป็น "ผ" · แตะชื่อนักเรียน = ทุกตัวชี้วัดที่ยังว่างของคนนั้นเป็น "ผ" · ถ้ามี มผ แม้ตัวเดียว ผลรวมจะเป็น มผ</div>
    ${canEdit ? '<div class="row" style="margin:6px 0"><button class="btn btn-sm" id="ind-allpass">ทุกช่องที่ว่าง = ผ ทั้งห้อง</button><button class="btn btn-sm btn-danger" id="ind-clear">ล้างผลตัวชี้วัดทั้งห้อง</button></div>' : ''}
    <div class="tbl-wrap"><table class="reg" id="ind">
      <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th>
        ${inds.map((it) => `<th class="ih" title="${esc(it.title || '')}">${canEdit ? `<button class="day" data-all="${it.id}">` : ''}${esc(it.code || it.title)}${canEdit ? '</button>' : ''}</th>`).join('')}
        <th>ผ</th><th>มผ</th><th>ผล</th></tr></thead>
      <tbody>${roster.map((s) => { const m = summary(s.id); return `<tr data-sid="${s.id}"><td class="no">${s.number ?? ''}</td><td class="name">${canEdit ? `<button class="day" data-row="${s.id}" title="ให้ทุกตัวชี้วัดที่ยังว่างของคนนี้เป็น ผ">${esc(fullName(s))}</button>` : esc(fullName(s))}</td>
        ${inds.map((it) => { const p = val(it, s.id); return `<td><button class="cell ${p === false ? 'st-absent' : p ? 'st-present' : ''}" data-item="${it.id}" data-sid="${s.id}" ${canEdit ? '' : 'disabled'}>${mark(p)}</button></td>`; }).join('')}
        <td class="tot s-p">${m.p}</td><td class="tot s-f" style="color:var(--red)">${m.f || ''}</td><td class="tot s-r">${m.res}</td></tr>`; }).join('')}</tbody>
    </table></div>`;
  const grid = $('#ind', pane);
  const paint = (itemId, sid, flash) => {
    const b = grid.querySelector(`button.cell[data-item="${itemId}"][data-sid="${sid}"]`); if (!b) return;
    const p = val({ id: itemId }, sid);
    b.textContent = mark(p); b.className = `cell ${p === false ? 'st-absent' : p ? 'st-present' : ''}`;
    if (flash) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1300); }
    const tr = grid.querySelector(`tr[data-sid="${sid}"]`); const m = summary(sid);
    tr.querySelector('.s-p').textContent = m.p; tr.querySelector('.s-f').textContent = m.f || ''; tr.querySelector('.s-r').textContent = m.res;
  };
  const save = async (rows) => {
    rows.forEach((r) => { data.scoreMap.set(`${r.item_id}|${r.student_id}`, r); paint(r.item_id, r.student_id); });
    try { await ctx.db.upsert('item_scores', rows, 'item_id,student_id'); } catch (err) { toast(err.message, 'err'); }
  };
  if (canEdit) grid.addEventListener('click', (e) => {
    const b = e.target.closest('button.cell');
    if (b) { const p = val({ id: b.dataset.item }, b.dataset.sid); save([{ item_id: b.dataset.item, student_id: b.dataset.sid, passed: p === undefined || p === null ? true : p === true ? false : null }]); return; }
    const rw = e.target.closest('[data-row]');
    if (rw) { const rows = inds.filter((it) => val(it, rw.dataset.row) == null).map((it) => ({ item_id: it.id, student_id: rw.dataset.row, passed: true }));
      if (rows.length) save(rows); return; }
    const h = e.target.closest('[data-all]');
    if (h) { const rows = roster.filter((s) => val({ id: h.dataset.all }, s.id) == null).map((s) => ({ item_id: h.dataset.all, student_id: s.id, passed: true }));
      if (rows.length) { save(rows); toast(`ผ ${rows.length} คน`); } }
  });
  if (canEdit) {
    $('#ind-allpass', pane).addEventListener('click', () => {
      const rows = roster.flatMap((s) => inds.filter((it) => val(it, s.id) == null).map((it) => ({ item_id: it.id, student_id: s.id, passed: true })));
      if (rows.length) { save(rows); toast(`ผ ${rows.length} ช่อง`); } else toast('ไม่มีช่องว่าง');
    });
    $('#ind-clear', pane).addEventListener('click', async () => {
      if (!await confirmBox('ล้างผลตัวชี้วัด (ผ/มผ) ของทุกคนในวิชานี้?')) return;
      const rows = roster.flatMap((s) => inds.filter((it) => val(it, s.id) != null).map((it) => ({ item_id: it.id, student_id: s.id, passed: null })));
      if (rows.length) { save(rows); toast(`ล้าง ${rows.length} ช่อง`); }
    });
  }
  const ids = new Set(inds.map((i) => i.id));
  return ctx.db.subscribe('item_scores', null, (ev) => {
    const s = ev.type === 'DELETE' ? ev.old : ev.new; if (!ids.has(s.item_id)) return;
    if (data.scoreMap.get(`${s.item_id}|${s.student_id}`)?.passed === s.passed && ev.type !== 'DELETE') return;
    if (ev.type === 'DELETE') data.scoreMap.delete(`${s.item_id}|${s.student_id}`); else data.scoreMap.set(`${s.item_id}|${s.student_id}`, s);
    paint(s.item_id, s.student_id, true);
  });
}

// =====================================================================
//  แท็บตั้งค่าช่องคะแนน
// =====================================================================
function itemsTab(pane, ctx, course, items, canEdit, again, master = []) {
  const g = (k) => items.filter((i) => i.kind === k);
  const sum = (k) => g(k).reduce((s, i) => s + Number(i.max_score || 0), 0);
  const others = ctx.myCourses.filter((k) => k.id !== course.id);
  const table = (k) => `
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center">
      <h3>${KIND[k]}</h3><span class="row">${selBar(k, canEdit, g(k).length)}</span>${k !== 'indicator' ? `<span class="small muted">คะแนนเต็มรวม ${sum(k)}${k === 'final' && g(k).length && sum(k) !== course.final_ratio ? ` (จะถูกแปลงเป็น ${course.final_ratio})` : ''}</span>` : ''}</div>
      ${g(k).length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr>${selTh(k, canEdit)}<th>${k === 'indicator' ? 'รหัสตัวชี้วัด' : 'ชื่อช่องคะแนน'}</th>${k === 'indicator' ? '<th>คำอธิบาย</th>' : '<th class="n">คะแนนเต็ม</th>'}<th></th></tr></thead><tbody>
        ${g(k).map((it, i, arr) => `<tr>${selTd(k, it.id, canEdit)}<td class="tc-ttl">${esc(k === 'indicator' ? it.code : it.title)}</td><td class="${k === 'indicator' ? 'small' : 'n'}" data-l="${k === 'indicator' ? 'คำอธิบาย' : 'คะแนนเต็ม'}">${esc(k === 'indicator' ? it.title ?? '' : Number(it.max_score))}</td>
          <td class="n tc-act" style="white-space:nowrap">${canEdit ? `<button class="btn btn-sm btn-ghost" data-up="${it.id}" ${i ? '' : 'disabled'} aria-label="เลื่อนขึ้น">↑</button><button class="btn btn-sm btn-ghost" data-down="${it.id}" ${i < arr.length - 1 ? '' : 'disabled'} aria-label="เลื่อนลง">↓</button>
            <button class="btn btn-sm" data-edit="${it.id}">แก้ไข</button> <button class="btn btn-sm btn-danger" data-del="${it.id}">ลบ</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">ยังไม่มี${KIND[k]}</div>`}
      ${canEdit ? `<div class="row"><button class="btn btn-sm" data-add="${k}">เพิ่มทีละช่อง</button><button class="btn btn-sm" data-bulk="${k}">เพิ่มหลายช่อง (วางจาก Excel)</button></div>` : ''}
    </div>`;

  pane.innerHTML = `
    ${canEdit ? `<div class="card"><div class="row" style="align-items:center;justify-content:space-between">
      <div><h3>นำเข้าจากไฟล์ผลสัมฤทธิ์เดิม</h3>
        <p class="small muted" style="margin:0">ไฟล์ Excel ที่มีแผ่นงาน "ผลสัมฤทธิ์" (.xlsb / .xlsx) ระบบจะสร้างช่องคะแนนตามไฟล์และใส่คะแนนให้ทุกคน · ตรวจผลก่อนบันทึกได้</p></div>
      <label class="btn btn-sm">เลือกไฟล์…<input type="file" id="imp" accept=".xlsb,.xlsx,.xls,.xlsm" hidden></label></div></div>` : ''}
    ${!items.length && canEdit ? `<div class="card"><h3>เริ่มต้นวิชานี้</h3>
      <p class="small">ยังไม่มีช่องคะแนน เลือกวิธีเริ่มได้เลย แล้วแก้ไขต่อภายหลังได้</p>
      <div class="row"><button class="btn btn-primary" id="tpl">สร้างแบบตัวอย่าง (งาน 1–4 · กลางภาค · ปลายภาค)</button>
        ${others.length ? `<label class="field">หรือคัดลอกจากวิชา<select id="copy-src"><option value="">— เลือก —</option>${options(others, null, ctx.courseLabel)}</select></label>` : ''}</div></div>` : ''}
    <div class="card"><div class="row" style="align-items:center;justify-content:space-between">
      <h3>สัดส่วนคะแนน</h3>
      <form class="row" id="ratio"><label class="field">ระหว่างภาค<input type="number" id="r-mid" name="mid" min="0" max="100" value="${course.midterm_ratio}" style="width:90px" ${canEdit ? '' : 'disabled'}></label>
        <label class="field">ปลายภาค<input type="number" id="r-fin" name="fin" min="0" max="100" value="${course.final_ratio}" style="width:90px" ${canEdit ? '' : 'disabled'}></label>
        ${canEdit ? '<button class="btn btn-sm" type="submit">บันทึกสัดส่วน</button>' : ''}</form></div>
      <p class="small muted">คะแนนระหว่างภาค = คะแนนเก็บรวม ÷ (คะแนนเต็มรวม ÷ ${course.midterm_ratio}) แล้วปัดเศษตามที่โรงเรียนตั้งไว้ · รวมกับคะแนนปลายภาคได้เต็ม 100</p></div>
    ${table('score')}${table('final')}${masterCard(course, master, canEdit)}${table('indicator')}`;
  if (!canEdit) return;

  const nextOrder = () => items.reduce((m, i) => Math.max(m, i.sort_order || 0), 0) + 1;
  const run = async (fn, msg = 'บันทึกแล้ว') => { try { await fn(); toast(msg); again(); } catch (err) { toast(err.message, 'err'); } };
  const form = (k, it = {}) => modal(it.id ? 'แก้ไขช่องคะแนน' : `เพิ่ม${KIND[k]}`, k === 'indicator' ? `
      <label>รหัสตัวชี้วัด<input type="text" id="i-code" name="code" required value="${esc(it.code ?? '')}" placeholder="ท 1.1 ม.1/1"></label>
      <label>คำอธิบาย (ไม่บังคับ)<input type="text" id="i-title" name="title" value="${esc(it.title ?? '')}"></label>` : `
      <label>ชื่อช่องคะแนน<input type="text" id="i-title" name="title" required value="${esc(it.title ?? (k === 'final' ? 'สอบปลายภาค' : ''))}"></label>
      <label>คะแนนเต็ม<input type="number" id="i-max" name="max" step="0.5" min="0.5" required value="${it.max_score ?? (k === 'final' ? course.final_ratio : 10)}" style="width:110px"></label>`);
  const row = (k, r) => (k === 'indicator' ? { code: normIndicatorCode(r.code), title: r.title?.trim() || null, max_score: null }
    : { title: r.title.trim(), max_score: Number(r.max) });

  pane.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.add; const r = await form(k); if (!r) return;
    run(() => ctx.db.insert('assessment_items', [{ course_id: course.id, kind: k, sort_order: nextOrder(), ...row(k, r) }]));
  }));
  pane.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', async () => {
    const k = b.dataset.bulk;
    const r = await modal(`เพิ่ม${KIND[k]}หลายช่อง`, `<label>${k === 'indicator' ? 'รหัสตัวชี้วัด บรรทัดละ 1 ตัว (คั่นคำอธิบายด้วยแท็บได้)' : 'บรรทัดละ 1 ช่อง: ชื่อ ตามด้วยแท็บหรือเว้นวรรค แล้วคะแนนเต็ม'}
      <textarea id="bulk" name="text" rows="8" placeholder="${k === 'indicator' ? 'ท 1.1 ม.1/1\nท 1.1 ม.1/2' : 'งาน 1\t10\nงาน 2\t10\nกลางภาค\t20'}"></textarea></label>`, { okText: 'เพิ่ม' });
    if (!r) return;
    const rows = []; let order = nextOrder();
    for (const line of r.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (k === 'indicator') { const [code, title] = line.split('\t'); rows.push({ course_id: course.id, kind: k, code: normIndicatorCode(code), title: title?.trim() || null, sort_order: order++ }); }
      else { const m = line.match(/^(.*?)[\t ]+([\d.]+)$/); if (!m) { toast(`อ่านบรรทัด "${line}" ไม่ได้ ต้องมีคะแนนเต็มท้ายบรรทัด`, 'err'); return; }
        rows.push({ course_id: course.id, kind: k, title: m[1].trim(), max_score: Number(m[2]), sort_order: order++ }); }
    }
    if (rows.length) run(() => ctx.db.insert('assessment_items', rows), `เพิ่มแล้ว ${rows.length} ช่อง`);
  }));
  pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const it = items.find((i) => i.id === b.dataset.edit); const r = await form(it.kind, it); if (!r) return;
    run(() => ctx.db.update('assessment_items', { id: it.id }, row(it.kind, r)));
  }));
  pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const it = items.find((i) => i.id === b.dataset.del);
    const n = (await ctx.db.select('item_scores', { eq: { item_id: it.id } })).filter((s) => s.score !== null || s.passed !== null).length;
    if (!await confirmBox(`ลบช่อง "${it.title || it.code}"?${n ? ` คะแนนที่กรอกไว้ ${n} คนจะหายไปด้วย` : ''}`, 'ลบ')) return;
    run(() => ctx.db.remove('assessment_items', { id: it.id }), 'ลบแล้ว');
  }));
  for (const k of ['score', 'final', 'indicator']) wireSelect(pane, k, async (ids) => {
    const n = (await Promise.all(ids.map((id) => ctx.db.select('item_scores', { eq: { item_id: id } })))).flat().filter((x) => x.score !== null || x.passed !== null).length;
    if (!await confirmBox(`ลบ${KIND[k]} ${ids.length} ช่อง?${n ? ` ผลที่กรอกไว้ ${n} รายการจะหายไปด้วย` : ''}`, 'ลบ')) return;
    run(async () => { for (const id of ids) await ctx.db.remove('assessment_items', { id }); }, `ลบแล้ว ${ids.length} ช่อง`);
  });
  const swap = async (id, dir) => {
    const it = items.find((i) => i.id === id); const same = g(it.kind); const j = same.indexOf(it) + dir; const other = same[j];
    if (!other) return;
    const a = it.sort_order === other.sort_order ? it.sort_order + dir : other.sort_order;
    run(async () => { await ctx.db.update('assessment_items', { id: it.id }, { sort_order: a }); await ctx.db.update('assessment_items', { id: other.id }, { sort_order: it.sort_order }); }, 'เลื่อนแล้ว');
  };
  pane.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => swap(b.dataset.up, -1)));
  pane.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => swap(b.dataset.down, 1)));
  wireMaster(pane, ctx, course, master, run, again);
  $('#ratio', pane)?.addEventListener('submit', (e) => {
    e.preventDefault();
    const mid = Number($('#r-mid', pane).value); const fin = Number($('#r-fin', pane).value);
    if (mid + fin !== 100) { toast('สัดส่วนต้องรวมกันได้ 100', 'err'); return; }
    run(async () => { await ctx.db.update('courses', { id: course.id }, { midterm_ratio: mid, final_ratio: fin }); await ctx.refresh(); });
  });
  $('#tpl', pane)?.addEventListener('click', () => run(() => ctx.db.insert('assessment_items', [
    ...['งาน 1', 'งาน 2', 'งาน 3', 'งาน 4'].map((t, i) => ({ course_id: course.id, kind: 'score', title: t, max_score: 10, sort_order: i + 1 })),
    { course_id: course.id, kind: 'score', title: 'สอบกลางภาค', max_score: 20, sort_order: 5 },
    { course_id: course.id, kind: 'final', title: 'สอบปลายภาค', max_score: course.final_ratio, sort_order: 6 },
  ]), 'สร้างช่องคะแนนแล้ว'));
  $('#imp', pane)?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try { await importDialog(ctx, course, items, file); again(); }
    catch (err) { toast(err.message, 'err'); }
  });
  $('#copy-src', pane)?.addEventListener('change', async (e) => {
    if (!e.target.value) return;
    const src = await ctx.db.select('assessment_items', { eq: { course_id: e.target.value } });
    if (!src.length) { toast('วิชาที่เลือกยังไม่มีช่องคะแนน', 'err'); return; }
    run(() => ctx.db.insert('assessment_items', src.map(({ kind, code, title, max_score, sort_order }) => ({ course_id: course.id, kind, code, title, max_score, sort_order }))),
      `คัดลอกแล้ว ${src.length} ช่อง`);
  });
}

// =====================================================================
//  ส่งออก / นำเข้า ไฟล์ Excel แบบบันทึกผลสัมฤทธิ์
// =====================================================================
async function exportDialog(ctx, course) {
  const room = ctx.courses.filter((k) => k.classroom_id === course.classroom_id);
  let list = [course];
  if (room.length > 1) {
    const r = await modal('ส่งออก Excel (แบบบันทึกผลสัมฤทธิ์)', `
      <p class="small">ได้ไฟล์ .xlsx แผ่นงาน "ผลสัมฤทธิ์" เหมือนไฟล์เดิมของโรงเรียน มีสูตรคำนวณครบ เปิดใน Excel แล้วพิมพ์หรือแก้คะแนนต่อได้</p>
      <label>ส่งออก<select name="scope">
        <option value="one">เฉพาะวิชานี้ (${esc(course.subject?.name ?? '')})</option>
        <option value="room">ทุกวิชาของห้อง ${esc(course.classroom ? `${course.classroom.level}/${course.classroom.room}` : '')} (${room.length} วิชา · 1 วิชา = 1 แผ่นงาน)</option>
      </select></label>`, { okText: 'ดาวน์โหลด' });
    if (!r) return;
    if (r.scope === 'room') list = room;
  }
  try { const name = await exportAchievement(ctx, list); toast(`ดาวน์โหลดแล้ว: ${name}`); }
  catch (err) { toast(err.message, 'err'); }
}

async function importDialog(ctx, course, items, file) {
  const parsed = await readAchievementFile(file);
  const roster = await courseRoster(ctx, course);
  const plan = planImport(parsed, roster, fullName);
  const old = items.filter((i) => i.kind === 'score' || i.kind === 'final');
  const oldScores = old.length ? (await ctx.db.select('item_scores', { in: { item_id: old.map((i) => i.id) } })).filter((x) => x.score !== null).length : 0;
  if (!plan.matched.length) throw new Error(`ไม่พบนักเรียนในไฟล์ที่ตรงกับรายชื่อห้องนี้ (ไฟล์มี ${parsed.students.length} คน)`);
  const li = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join('');
  // เตือนเมื่อชื่อวิชา/ระดับชั้นในไฟล์ไม่ตรงกับวิชาที่กำลังนำเข้า
  const flat = (t) => String(t ?? '').replace(/\s+/g, '');
  const subjOk = !parsed.line2 || [course.subject?.name, course.subject?.code].filter(Boolean).some((t) => flat(parsed.line2).includes(flat(t)));
  const lv = course.classroom ? levelName(course.classroom.level) : '';
  const levelOk = !parsed.line1 || !lv || flat(parsed.line1).includes(flat(lv));
  const ok = await modal(`นำเข้า: ${file.name}`, `
    <div class="small">
      <p><b>${esc(parsed.line2 || 'ไม่ระบุวิชา')}</b> · ${esc(parsed.line1)}</p>
      ${!subjOk || !levelOk ? `<p class="chip chip-bad" style="display:block;white-space:normal">${!subjOk ? `ชื่อวิชาในไฟล์ไม่ตรงกับวิชา ${esc(course.subject?.name ?? '')} ` : ''}${!levelOk ? `ระดับชั้นในไฟล์ไม่ตรงกับ ${esc(lv)}` : ''} — ตรวจว่าเลือกไฟล์ถูกก่อนนำเข้า</p>` : ''}
      <p>สัดส่วน ระหว่างภาค:ปลายภาค <b>${parsed.midRatio}:${parsed.finalRatio}</b>${course.midterm_ratio !== parsed.midRatio ? ` (เดิมในระบบ ${course.midterm_ratio}:${course.final_ratio} จะเปลี่ยนตามไฟล์)` : ''}</p>
      <p>ช่องคะแนนเก็บ ${parsed.items.length} ช่อง: ${esc(parsed.items.map((i) => `${i.title} (${i.max})`).join(', '))} + สอบปลายภาค (${parsed.finalRatio})</p>
      <p>จับคู่นักเรียนได้ <b>${plan.matched.length}</b> จาก ${parsed.students.length} คนในไฟล์${plan.matched.some((r) => r.how === 'number') ? ` (จับคู่ด้วยเลขที่ ${plan.matched.filter((r) => r.how === 'number').length} คน เพราะชื่อสะกดต่างกัน — โปรดตรวจ)` : ''}</p>
      ${plan.matched.some((r) => r.how === 'number') ? `<ul>${li(plan.matched.filter((r) => r.how === 'number').map((r) => `ในไฟล์ "${r.p.name}" → ในระบบ "${fullName(r.s)}"`))}</ul>` : ''}
      ${plan.unmatched.length ? `<p style="color:var(--red)">ไม่พบในห้องนี้ ${plan.unmatched.length} คน (จะข้าม):</p><ul>${li(plan.unmatched.map((r) => r.p.name))}</ul>` : ''}
      ${plan.missing.length ? `<p>นักเรียนในห้องที่ไม่มีในไฟล์ ${plan.missing.length} คน: ${esc(plan.missing.map(fullName).join(', '))}</p>` : ''}
      ${plan.overs.length ? `<p style="color:var(--red)">คะแนนเกินคะแนนเต็ม ${plan.overs.length} ช่อง จะบันทึกเท่าคะแนนเต็ม:</p><ul>${li(plan.overs)}</ul>` : ''}
      ${parsed.warnings.length ? `<ul>${li(parsed.warnings)}</ul>` : ''}
      ${old.length ? `<p class="chip chip-warn" style="display:block;white-space:normal">ช่องคะแนนเก็บและปลายภาคเดิมของวิชานี้ ${old.length} ช่อง${oldScores ? ` พร้อมคะแนนที่กรอกไว้ ${oldScores} ช่อง` : ''} จะถูกแทนที่ด้วยข้อมูลจากไฟล์ (ตัวชี้วัดไม่เปลี่ยน)</p>` : ''}
    </div>`, { okText: 'นำเข้า', wide: true });
  if (!ok) return;
  const r = await applyImport(ctx, course, plan, items);
  if (course.midterm_ratio !== parsed.midRatio) await ctx.refresh();
  toast(`นำเข้าแล้ว: ${r.items} ช่องคะแนน · ${r.students} คน · ${r.scores} คะแนน`);
  pref.tab = 'scores';
}

// =====================================================================
//  ตัวชี้วัดกลางของรายวิชา (ใช้ร่วมกับทุกห้องที่เปิดสอนรหัสวิชานี้)
// =====================================================================
function masterCard(course, master, canEdit) {
  const list = [...master].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return `
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center">
      <h3>ตัวชี้วัดกลางของรายวิชา ${esc(course.subject?.code ?? '')}</h3><span class="row">${selBar('master', canEdit, list.length)}<span class="small muted">${list.length} ตัว</span></span></div>
      <p class="small muted">ใช้ร่วมกับทุกห้องที่เปิดสอนรหัสวิชานี้ ระบบเพิ่มตัวที่ห้องยังไม่มีให้เอง ไม่ลบหรือแทนของเดิม · รหัสจัดรูปแบบให้อัตโนมัติ (เช่น ม 3/3 → ม.3/3)
        · ถ้าจะเอาตัวชี้วัดออกจากห้อง ให้ลบจากรายการนี้ก่อน มิฉะนั้นจะถูกเพิ่มกลับเมื่อเปิดหน้านี้</p>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr>${selTh('master', canEdit)}<th>รหัสตัวชี้วัด</th><th>คำอธิบาย</th><th></th></tr></thead><tbody>
        ${list.map((m) => `<tr>${selTd('master', m.id, canEdit)}<td class="tc-ttl">${esc(m.code)}</td><td class="small" data-l="คำอธิบาย">${esc(m.title ?? '')}</td>
          <td class="n tc-act" style="white-space:nowrap">${canEdit ? `<button class="btn btn-sm" data-medit="${m.id}">แก้ไข</button> <button class="btn btn-sm btn-danger" data-mdel="${m.id}">ลบ</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty">ยังไม่มีตัวชี้วัดกลาง</div>'}
      ${canEdit ? '<div class="row"><button class="btn btn-sm" data-madd>เพิ่มตัวชี้วัดกลาง (วางจาก Excel ได้)</button></div>' : ''}
    </div>`;
}

function wireMaster(pane, ctx, course, master, run, again) {
  const sid = course.subject_id;
  const warnLevel = (codes) => {
    const bad = levelMismatch(codes, course.subject);
    return bad.length ? confirmBox(`รหัสต่อไปนี้ชั้นไม่ตรงกับวิชา: ${bad.join(', ')} บันทึกตามนี้หรือไม่?`, 'บันทึก') : true;
  };
  const done = (r, n) => `เพิ่มตัวชี้วัดกลาง ${n} ตัว${r.added ? ` · ใส่ลง ${r.rooms} ห้อง (${r.added} ช่อง)` : ''}`;

  $('[data-madd]', pane)?.addEventListener('click', async () => {
    const r = await modal('เพิ่มตัวชี้วัดกลาง', `<label>รหัสตัวชี้วัด บรรทัดละ 1 ตัว (คั่นคำอธิบายด้วยแท็บได้) · ตัวที่มีอยู่แล้วจะข้ามไป
      <textarea id="m-bulk" name="text" rows="8" placeholder="ท 1.1 ม.3/1\nท 1.1 ม.3/2"></textarea></label>`, { okText: 'เพิ่ม' });
    if (!r) return;
    const { rows, dup } = parseIndicatorLines(r.text, master);
    if (!rows.length) { toast(dup.length ? 'ทุกตัวมีอยู่แล้ว' : 'ไม่มีรหัสที่จะเพิ่ม', 'err'); return; }
    if (!await warnLevel(rows.map((x) => x.code))) return;
    let order = master.reduce((m, x) => Math.max(m, x.sort_order || 0), 0);
    try {
      await ctx.db.insert('subject_indicators', rows.map((x) => ({ subject_id: sid, ...x, sort_order: ++order })));
      const res = await syncSubject(ctx, sid);
      toast(done(res, rows.length) + (dup.length ? ` · ข้ามที่มีแล้ว ${dup.length} ตัว` : '')); again();
    } catch (err) { toast(err.message, 'err'); }
  });

  pane.querySelectorAll('[data-medit]').forEach((b) => b.addEventListener('click', async () => {
    const m = master.find((x) => x.id === b.dataset.medit);
    const r = await modal('แก้ไขตัวชี้วัดกลาง', `
      <label>รหัสตัวชี้วัด<input type="text" id="m-code" name="code" required value="${esc(m.code)}"></label>
      <label>คำอธิบาย (ไม่บังคับ)<input type="text" id="m-title" name="title" value="${esc(m.title ?? '')}"></label>
      <p class="small muted">ตัวชี้วัดเดียวกันในห้องที่คุณแก้ได้จะถูกแก้ตามด้วย ผล ผ/มผ ที่กรอกไว้ไม่หาย</p>`);
    if (!r) return;
    const code = normIndicatorCode(r.code); if (!code) return;
    if (indKey(code) !== indKey(m.code) && master.some((x) => indKey(x.code) === indKey(code))) { toast(`มีรหัส ${code} อยู่แล้ว`, 'err'); return; }
    if (!await warnLevel([code])) return;
    const patch = { code, title: r.title?.trim() || null };
    run(async () => {
      await ctx.db.update('subject_indicators', { id: m.id }, patch);
      const ids = syncableCourses(ctx, sid).map((k) => k.id);
      const its = ids.length ? await ctx.db.select('assessment_items', { in: { course_id: ids } }) : [];
      for (const it of its) if (it.kind === 'indicator' && indKey(it.code || '') === indKey(m.code)) await ctx.db.update('assessment_items', { id: it.id }, patch);
      await syncSubject(ctx, sid);
    });
  }));

  wireSelect(pane, 'master', async (ids) => {
    if (!await confirmBox(`ลบตัวชี้วัดกลาง ${ids.length} ตัว? ลบเฉพาะรายการกลาง ตัวชี้วัดและผล ผ/มผ ในแต่ละห้องยังอยู่ (ลบในห้องได้ที่ตารางตัวชี้วัดด้านล่าง)`, 'ลบ')) return;
    run(async () => { for (const id of ids) await ctx.db.remove('subject_indicators', { id }); }, `ลบแล้ว ${ids.length} ตัว`);
  });
  pane.querySelectorAll('[data-mdel]').forEach((b) => b.addEventListener('click', async () => {
    const m = master.find((x) => x.id === b.dataset.mdel);
    if (!await confirmBox(`ลบ "${m.code}" จากตัวชี้วัดกลาง? ลบเฉพาะรายการกลาง ตัวชี้วัดและผล ผ/มผ ในแต่ละห้องยังอยู่ (ลบในห้องได้ที่ตารางตัวชี้วัดด้านล่าง)`, 'ลบ')) return;
    run(() => ctx.db.remove('subject_indicators', { id: m.id }), 'ลบแล้ว');
  }));
}
