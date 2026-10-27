import { esc, $, modal, toast, options, roomName, LEVELS, confirmBox, thaiDate } from '../util.js?v=2569.10.27-8';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.10.27-8';
import { ROUNDING } from '../grading.js?v=2569.10.27-8';
import { excelRefToRows } from '../assess.js?v=2569.10.27-8';
import { ITEMS, notifyConfig, badge } from '../notify.js?v=2569.10.27-8';
import { clearGrowthRef } from '../data.js?v=2569.10.27-8';

let tab = 'school';
const TABS = { school: 'โรงเรียน', terms: 'ภาคเรียน', rooms: 'ห้องเรียน', subjects: 'รายวิชา', users: 'ผู้ใช้', growth: 'ตารางโภชนาการ', notify: 'การแจ้งเตือน', backup: 'สำรองข้อมูล' };

export async function render(el, ctx) {
  if (!ctx.isAdmin) { el.innerHTML = '<div class="empty">เฉพาะผู้ดูแลระบบ</div>'; return; }
  const pending = ctx.profiles.filter((p) => p.role === 'pending').length;
  if (ctx.params?.tab && TABS[ctx.params.tab]) { tab = ctx.params.tab; ctx.params = {}; }
  // จุดแดงบนแท็บที่ค้าง (แท็บผู้ใช้มีป้ายจำนวนรออนุมัติอยู่แล้ว)
  const dot = (k) => (k === 'users' ? '' : badge((ctx.alerts || []).filter((a) => a.tab === k).length));
  el.innerHTML = `
    <div class="page-head"><div><h1>ตั้งค่าระบบ</h1><p>ข้อมูลที่ตั้งไว้ที่นี่ใช้ร่วมกันทั้งระบบธุรการและ ปพ.</p></div></div>
    ${tabGroups([['ข้อมูลโรงเรียน', 'school', ['school', 'terms', 'rooms', 'subjects', 'users']], ['ระบบและข้อมูล', 'setup', ['growth', 'notify', 'backup']]]
    .map(([label, ic, keys]) => ({ label, icon: ic, tabs: keys.map((k) => ({ key: k, label: `${TABS[k]}${k === 'users' && pending ? ` <span class="chip chip-bad">${pending}</span>` : ''}${dot(k)}` })) })), tab)}
    <div id="pane"></div>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(el, ctx); }));
  wireTabGroups(el);
  const pane = $('#pane', el);
  const again = async () => { await ctx.refresh(); render(el, ctx); };
  const run = async (fn, msg = 'บันทึกแล้ว') => { try { await fn(); toast(msg); await again(); } catch (err) { toast(err.message, 'err'); } };
  ({ school, terms, rooms, subjects, users, growth, notify, backup })[tab](pane, ctx, run);
}

// ---------------------------------------------------------------------
function school(pane, ctx, run) {
  const s = ctx.settings;
  const f = (k, label, wide) => `<label class="field" style="${wide ? 'flex:1 1 100%' : 'flex:1 1 240px'}">${label}<input type="text" id="s-${k}" name="${k}" value="${esc(s[k] ?? '')}"></label>`;
  pane.innerHTML = `<form class="card" id="f-school">
    <div class="row">${f('school_name', 'ชื่อโรงเรียน (ไม่ต้องมีคำว่า "โรงเรียน")')}${f('school_code', 'รหัสโรงเรียน')}</div>
    <div class="row">${f('affiliation', 'สังกัด')}${f('area_office', 'เขตพื้นที่การศึกษา')}</div>
    <div class="row">${f('subdistrict', 'ตำบล')}${f('district', 'อำเภอ')}${f('province', 'จังหวัด')}</div>
    <div class="row">${f('director_name', 'ชื่อผู้อำนวยการ')}${f('director_title', 'ตำแหน่ง')}</div>
    <div class="row">${f('academic_head_name', 'หัวหน้างานวิชาการ')}${f('registrar_name', 'นายทะเบียน')}</div>
    <p class="muted small">ชื่อเหล่านี้จะไปอยู่ที่ช่องลงนามของรายงานและเล่ม ปพ.</p>
    <div class="row"><label class="field" style="flex:1 1 240px">การปัดเศษคะแนนระหว่างภาค (ใช้ทุกวิชา)
      <select id="s-rounding" name="score_rounding">${Object.entries(ROUNDING).map(([k, v]) => `<option value="${k}" ${(s.score_rounding || 'floor') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label></div>
    <p class="muted small">ตัวอย่าง: คะแนนเก็บคิดได้ 49.9 → ปัดทิ้ง = 49 (เกรด 0) · ปัดครึ่งขึ้น = 50 (เกรด 1) · ไม่ปัด = 49.9 (เกรด 0) · ควรตกลงกับฝ่ายวัดผลก่อนเริ่มภาคเรียน</p>
    <div><button class="btn btn-primary" type="submit">บันทึก</button></div></form>`;
  $('#f-school', pane).addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    run(() => ctx.db.upsert('school_settings', [{ id: 1, ...data }], 'id'));
  });
}

// ---------------------------------------------------------------------
function terms(pane, ctx, run) {
  pane.innerHTML = `<div class="card">
    <div class="row"><button class="btn btn-primary" id="add">เพิ่มภาคเรียน</button></div>
    ${ctx.terms.length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ปีการศึกษา</th><th>ภาคเรียน</th><th>เปิดภาค</th><th>ปิดภาค</th><th></th></tr></thead><tbody>
      ${ctx.terms.map((t) => `<tr><td data-l="ปีการศึกษา">${t.academic_year}</td><td data-l="ภาคเรียน">${t.term}</td><td data-l="เปิดภาค">${esc(thaiDate(t.start_date, true))}</td><td data-l="ปิดภาค">${esc(thaiDate(t.end_date, true))}</td>
        <td class="n tc-act">${t.is_current ? '<span class="chip chip-ok">ภาคเรียนปัจจุบัน</span>' : `<button class="btn btn-sm" data-cur="${t.id}">ตั้งเป็นปัจจุบัน</button>`}
          <button class="btn btn-sm" data-edit="${t.id}">แก้ไข</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">ยังไม่มีภาคเรียน</div>'}
    <p class="muted small">วันเปิด-ปิดภาคใช้กำหนดช่วงเดือนของการเช็กชื่อและรายงาน ห้องเรียนผูกกับปีการศึกษา ดังนั้นเมื่อขึ้นภาคเรียนที่ 2 ห้องและนักเรียนเดิมใช้ต่อได้ทันที</p></div>`;
  const form = (t = {}) => modal(t.id ? 'แก้ไขภาคเรียน' : 'เพิ่มภาคเรียน', `
    <div class="row"><label>ปีการศึกษา (พ.ศ.)<input type="number" id="t-year" name="academic_year" required value="${t.academic_year ?? new Date().getFullYear() + 543}" style="width:120px"></label>
      <label>ภาคเรียน<select id="t-term" name="term">${options([{ id: 1, label: '1' }, { id: 2, label: '2' }], t.term ?? 1)}</select></label></div>
    <div class="row"><label>วันเปิดภาค<input type="date" id="t-start" name="start_date" value="${t.start_date ?? ''}"></label>
      <label>วันปิดภาค<input type="date" id="t-end" name="end_date" value="${t.end_date ?? ''}"></label></div>
    <div class="row"><label>วันที่อนุมัติผลการเรียน<input type="date" id="t-approve" name="approve_date" value="${t.approve_date ?? ''}"></label></div>
    <p class="muted small" style="margin:0">วันที่อนุมัติผลการเรียนจะพิมพ์ในช่องลงนามของ ปพ.6 (ครูประจำชั้น หัวหน้างานวิชาการ ผู้อำนวยการ)</p>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="t-cur" name="is_current" ${t.is_current || !ctx.terms.length ? 'checked' : ''}> ใช้เป็นภาคเรียนปัจจุบัน</label>`);
  $('#add', pane).addEventListener('click', async () => {
    const r = await form(); if (!r) return;
    run(() => ctx.db.insert('terms', [{ academic_year: Number(r.academic_year), term: Number(r.term), start_date: r.start_date || null, end_date: r.end_date || null, approve_date: r.approve_date || null, is_current: !!r.is_current }]).then(() => r.is_current && clearOthers(ctx)));
  });
  pane.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const t = ctx.terms.find((x) => x.id === b.dataset.edit);
    const r = await form(t); if (!r) return;
    run(async () => { await ctx.db.update('terms', { id: t.id }, { academic_year: Number(r.academic_year), term: Number(r.term), start_date: r.start_date || null, end_date: r.end_date || null, approve_date: r.approve_date || null, is_current: !!r.is_current }); if (r.is_current) await clearOthers(ctx, t.id); });
  }));
  pane.querySelectorAll('[data-cur]').forEach((b) => b.addEventListener('click', () =>
    run(async () => { await ctx.db.update('terms', { id: b.dataset.cur }, { is_current: true }); await clearOthers(ctx, b.dataset.cur); })));
}
// ฐานข้อมูลจริงมีทริกเกอร์จัดการให้ ส่วนนี้ช่วยโหมดทดลอง
async function clearOthers(ctx, keepId) {
  const all = await ctx.db.select('terms');
  const keep = keepId || all.filter((t) => t.is_current).at(-1)?.id;
  for (const t of all) if (t.is_current && t.id !== keep) await ctx.db.update('terms', { id: t.id }, { is_current: false });
}

// ---------------------------------------------------------------------
function rooms(pane, ctx, run) {
  const year = ctx.term?.academic_year;
  if (!year) { pane.innerHTML = '<div class="empty">เพิ่มภาคเรียนก่อน</div>'; return; }
  const teachers = ctx.profiles.filter((p) => p.role !== 'pending');
  pane.innerHTML = `<div class="card">
    <div class="row"><button class="btn btn-primary" id="add">เพิ่มห้องเรียน</button>
      <span class="muted small">ปีการศึกษา ${year} · นำเข้าไฟล์ DMC ทั้งโรงเรียนที่หน้า "นักเรียน" จะสร้างห้องให้อัตโนมัติ</span></div>
    ${ctx.classrooms.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ห้อง</th><th>ครูประจำชั้น</th><th></th></tr></thead><tbody>
      ${ctx.classrooms.map((c) => `<tr><td><b>${esc(roomName(c))}</b></td><td>${esc(ctx.homeroomTeachers(c.id).map((t) => t.full_name).join(', ') || '—')}</td>
        <td class="n"><button class="btn btn-sm" data-ht="${c.id}">กำหนดครูประจำชั้น</button> <button class="btn btn-sm btn-danger" data-del="${c.id}">ลบ</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">ยังไม่มีห้องเรียน</div>'}</div>`;
  $('#add', pane).addEventListener('click', async () => {
    const r = await modal('เพิ่มห้องเรียน', `<div class="row">
      <label>ชั้น<select id="c-level" name="level">${options(LEVELS.map((x) => ({ id: x, label: x })), 'ม.1')}</select></label>
      <label>ห้อง<input type="number" id="c-room" name="room" min="1" value="1" style="width:90px"></label></div>`);
    if (!r) return;
    run(() => ctx.db.insert('classrooms', [{ academic_year: year, level: r.level, room: Number(r.room) || 1 }]));
  });
  pane.querySelectorAll('[data-ht]').forEach((b) => b.addEventListener('click', async () => {
    const cid = b.dataset.ht;
    const cur = ctx.homeroomTeachers(cid).map((t) => t.id);
    const r = await modal(`ครูประจำชั้น ห้อง ${roomName(ctx.classroomById[cid])}`, teachers.length
      ? teachers.map((t) => `<label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="t_${t.id}" ${cur.includes(t.id) ? 'checked' : ''}> ${esc(t.full_name || t.email)}</label>`).join('')
      : '<p>ยังไม่มีครูที่อนุมัติแล้ว</p>');
    if (!r) return;
    const want = Object.keys(r).map((k) => k.slice(2));
    run(async () => {
      for (const t of cur) if (!want.includes(t)) await ctx.db.remove('classroom_teachers', { classroom_id: cid, teacher_id: t });
      const add = want.filter((t) => !cur.includes(t)).map((t) => ({ classroom_id: cid, teacher_id: t }));
      if (add.length) await ctx.db.insert('classroom_teachers', add);
    });
  }));
  pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmBox(`ลบห้อง ${roomName(ctx.classroomById[b.dataset.del])}? ข้อมูลเวลาเรียนและรายวิชาของห้องนี้จะถูกลบด้วย`, 'ลบห้อง')) return;
    run(() => ctx.db.remove('classrooms', { id: b.dataset.del }), 'ลบแล้ว');
  }));
}

// ---------------------------------------------------------------------
function subjects(pane, ctx, run) {
  const teachers = ctx.profiles.filter((p) => p.role !== 'pending');
  pane.innerHTML = `
    <div class="card"><div class="row" style="justify-content:space-between"><h2>รายวิชาในหลักสูตร</h2><button class="btn" id="add-sub">เพิ่มรายวิชา</button></div>
      ${ctx.subjects.length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>รหัส</th><th>ชื่อวิชา</th><th>ประเภท</th><th>กลุ่มสาระ</th><th class="n">หน่วยกิต</th><th class="n">ชม./ปี</th><th></th></tr></thead><tbody>
        ${ctx.subjects.map((s) => `<tr><td data-l="รหัส">${esc(s.code)}</td><td class="tc-ttl">${esc(s.name)}</td><td data-l="ประเภท">${esc(s.subject_type)}</td><td class="small" data-l="กลุ่มสาระ">${esc(s.subject_group ?? '')}</td>
          <td class="n" data-l="หน่วยกิต">${s.credits ?? ''}</td><td class="n" data-l="ชม./ปี">${s.hours_per_year ?? ''}</td><td class="n tc-act"><button class="btn btn-sm" data-sub="${s.id}">แก้ไข</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">ยังไม่มีรายวิชา</div>'}</div>
    <div class="card"><div class="row" style="justify-content:space-between"><h2>การเปิดสอน ภาคเรียนที่ ${ctx.term ? `${ctx.term.term}/${ctx.term.academic_year}` : '-'}</h2>
      <button class="btn btn-primary" id="add-course" ${ctx.subjects.length && ctx.classrooms.length ? '' : 'disabled'}>เปิดสอนวิชา</button></div>
      ${ctx.courses.length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ห้อง</th><th>วิชา</th><th>ครูผู้สอน</th><th class="n">ระหว่างภาค:ปลายภาค</th><th></th></tr></thead><tbody>
        ${ctx.courses.map((k) => `<tr><td data-l="ห้อง">${esc(roomName(k.classroom))}</td><td class="tc-ttl">${esc(k.subject?.code)} ${esc(k.subject?.name)}</td>
          <td data-l="ครูผู้สอน">${esc(k.teachers.map((t) => t.full_name).join(', ') || '—')}</td><td class="n" data-l="ระหว่างภาค:ปลายภาค">${k.midterm_ratio}:${k.final_ratio}</td>
          <td class="n tc-act"><button class="btn btn-sm" data-course="${k.id}">แก้ไข</button> <button class="btn btn-sm btn-danger" data-delc="${k.id}">ลบ</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">ยังไม่ได้เปิดสอนวิชาใดในภาคเรียนนี้</div>'}
      <p class="muted small">วิชาหนึ่งมีครูผู้สอนได้หลายคน (ในไฟล์ Excel เดิมต้องแทรกแถวเพิ่ม ซึ่งทำให้สูตรเสี่ยงพัง)</p></div>`;

  const subForm = (s = {}) => modal(s.id ? 'แก้ไขรายวิชา' : 'เพิ่มรายวิชา', `
    <div class="row"><label>รหัสวิชา<input type="text" id="sb-code" name="code" required value="${esc(s.code ?? '')}" placeholder="ท21101"></label>
      <label>ชื่อวิชา<input type="text" id="sb-name" name="name" required value="${esc(s.name ?? '')}"></label></div>
    <div class="row"><label>ประเภท<select id="sb-type" name="subject_type">${options([{ id: 'พื้นฐาน', label: 'พื้นฐาน' }, { id: 'เพิ่มเติม', label: 'เพิ่มเติม' }], s.subject_type)}</select></label>
      <label>กลุ่มสาระการเรียนรู้<select id="sb-group" name="subject_group">${options(['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี', 'สังคมศึกษา ศาสนาและวัฒนธรรม', 'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ', 'ภาษาต่างประเทศ'].map((x) => ({ id: x, label: x })), s.subject_group)}</select></label></div>
    <div class="row"><label>หน่วยกิต (มัธยม)<input type="number" step="0.5" id="sb-cr" name="credits" value="${s.credits ?? ''}" style="width:110px"></label>
      <label>ชั่วโมง/ปี (ประถม)<input type="number" id="sb-hr" name="hours_per_year" value="${s.hours_per_year ?? ''}" style="width:110px"></label>
      <label>ระดับชั้น<select id="sb-level" name="level"><option value="">—</option>${options(LEVELS.map((x) => ({ id: x, label: x })), s.level)}</select></label></div>`);
  const subRow = (r) => ({ code: r.code.replace(/\s/g, ''), name: r.name.trim(), subject_type: r.subject_type, subject_group: r.subject_group,
    credits: r.credits ? Number(r.credits) : null, hours_per_year: r.hours_per_year ? Number(r.hours_per_year) : null, level: r.level || null });
  $('#add-sub', pane).addEventListener('click', async () => { const r = await subForm(); if (r) run(() => ctx.db.insert('subjects', [subRow(r)])); });
  pane.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', async () => {
    const r = await subForm(ctx.subjectById[b.dataset.sub]); if (r) run(() => ctx.db.update('subjects', { id: b.dataset.sub }, subRow(r)));
  }));

  const courseForm = (k = {}) => modal(k.id ? 'แก้ไขการเปิดสอน' : 'เปิดสอนวิชา', `
    ${k.id ? `<p><b>${esc(ctx.courseLabel(k))}</b></p>` : `
    <label>วิชา<select id="k-sub" name="subject_id">${options(ctx.subjects, null, (s) => `${s.code} ${s.name}`)}</select></label>
    <fieldset style="border:1px solid var(--rule);border-radius:6px"><legend class="small">ห้อง (เลือกได้หลายห้อง)</legend>
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px">${ctx.classrooms.map((c) => `<label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" name="c_${c.id}"> ${esc(roomName(c))}</label>`).join('')}</div></fieldset>`}
    <fieldset style="border:1px solid var(--rule);border-radius:6px"><legend class="small">ครูผู้สอน</legend>
      <div style="display:flex;flex-direction:column;gap:2px">${teachers.map((t) => `<label style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" name="t_${t.id}" ${k.teachers?.some((x) => x.id === t.id) ? 'checked' : ''}> ${esc(t.full_name || t.email)}</label>`).join('')}</div></fieldset>
    <div class="row"><label>คะแนนระหว่างภาค<input type="number" id="k-mid" name="midterm_ratio" value="${k.midterm_ratio ?? 70}" min="0" max="100" style="width:100px"></label>
      <label>ปลายภาค<input type="number" id="k-fin" name="final_ratio" value="${k.final_ratio ?? 30}" min="0" max="100" style="width:100px"></label></div>`, { wide: true });
  const setTeachers = async (courseId, r, cur = []) => {
    const want = Object.keys(r).filter((x) => x.startsWith('t_')).map((x) => x.slice(2));
    for (const t of cur) if (!want.includes(t)) await ctx.db.remove('course_teachers', { course_id: courseId, teacher_id: t });
    const add = want.filter((t) => !cur.includes(t)).map((t) => ({ course_id: courseId, teacher_id: t }));
    if (add.length) await ctx.db.insert('course_teachers', add);
  };
  $('#add-course', pane).addEventListener('click', async () => {
    const r = await courseForm(); if (!r) return;
    let cids = Object.keys(r).filter((x) => x.startsWith('c_')).map((x) => x.slice(2));
    if (!cids.length) { toast('กรุณาเลือกห้องอย่างน้อย 1 ห้อง', 'err'); return; }
    if (Number(r.midterm_ratio) + Number(r.final_ratio) !== 100) { toast('สัดส่วนคะแนนต้องรวมกันได้ 100', 'err'); return; }
    // ห้องที่เปิดสอนวิชานี้ไปแล้ว ข้ามไป (กันข้อมูลซ้ำ)
    const dup = cids.filter((cid) => ctx.courses.some((k) => k.subject_id === r.subject_id && k.classroom_id === cid));
    cids = cids.filter((cid) => !dup.includes(cid));
    if (dup.length) toast(`ห้อง ${dup.map((cid) => roomName(ctx.classroomById[cid])).join(', ')} เปิดสอนวิชานี้แล้ว จึงข้ามไป`, cids.length ? 'ok' : 'err');
    if (!cids.length) return;
    run(async () => {
      const made = await ctx.db.insert('courses', cids.map((cid, i) => ({ subject_id: r.subject_id, classroom_id: cid, term_id: ctx.term.id,
        midterm_ratio: Number(r.midterm_ratio), final_ratio: Number(r.final_ratio), sort_order: ctx.courses.length + i + 1 })));
      for (const k of made) await setTeachers(k.id, r);
    });
  });
  pane.querySelectorAll('[data-course]').forEach((b) => b.addEventListener('click', async () => {
    const k = ctx.courseById[b.dataset.course];
    const r = await courseForm(k); if (!r) return;
    if (Number(r.midterm_ratio) + Number(r.final_ratio) !== 100) { toast('สัดส่วนคะแนนต้องรวมกันได้ 100', 'err'); return; }
    run(async () => {
      await ctx.db.update('courses', { id: k.id }, { midterm_ratio: Number(r.midterm_ratio), final_ratio: Number(r.final_ratio) });
      await setTeachers(k.id, r, k.teachers.map((t) => t.id));
    });
  }));
  pane.querySelectorAll('[data-delc]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmBox('ลบการเปิดสอนนี้? เวลาเรียนรายคาบและคะแนนของวิชานี้จะถูกลบด้วย', 'ลบ')) return;
    run(() => ctx.db.remove('courses', { id: b.dataset.delc }), 'ลบแล้ว');
  }));
}

// ---------------------------------------------------------------------
function users(pane, ctx, run) {
  const roleOpts = [{ id: 'pending', label: 'รออนุมัติ' }, { id: 'teacher', label: 'ครู' }, { id: 'admin', label: 'ผู้ดูแลระบบ' }];
  pane.innerHTML = `<div class="card">
    <p class="small muted">ครูสมัครใช้งานเองจากหน้าเข้าสู่ระบบ แล้วผู้ดูแลอนุมัติที่นี่ · ผู้ดูแลระบบแก้ไขได้ทุกอย่าง · ครูแก้ได้เฉพาะห้องที่เป็นครูประจำชั้นและวิชาที่สอน</p>
    <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th></tr></thead><tbody>
      ${ctx.profiles.map((p) => `<tr><td class="tc-ttl">${esc(p.full_name || '—')}</td><td class="small wrap-any" data-l="อีเมล">${esc(p.email ?? '')}</td>
        <td data-l="สิทธิ์">${p.id === ctx.me.id ? '<span class="chip chip-info">ผู้ดูแลระบบ (คุณ)</span>'
          : `<select data-role="${p.id}" aria-label="สิทธิ์ของ ${esc(p.full_name)}">${options(roleOpts, p.role)}</select>`}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  pane.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', () =>
    run(() => ctx.db.update('profiles', { id: s.dataset.role }, { role: s.value }), 'เปลี่ยนสิทธิ์แล้ว')));
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
const CSV_COLS = ['sex', 'basis', 'key', 'measure', 'median', 'sd', 'minus2', 'minus15', 'plus15', 'plus2', 'plus3'];
async function growth(pane, ctx, run) {
  pane.innerHTML = '<p class="muted">กำลังโหลด…</p>';
  const all = await ctx.db.select('growth_reference');
  const sets = {}; all.forEach((r) => { sets[r.ref_set] = (sets[r.ref_set] || 0) + 1; });
  const active = ctx.settings.growth_ref_set || 'excel';
  pane.innerHTML = `<div class="card">
    <h2>ตารางอ้างอิงการเจริญเติบโต</h2>
    <p class="small">ใช้แปลผลน้ำหนักตามอายุ ส่วนสูงตามอายุ และน้ำหนักตามส่วนสูง (แบ่งช่วงด้วย ±1.5 SD, ±2 SD และ +3 SD เหมือนไฟล์ Excel เดิม)</p>
    ${Object.keys(sets).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ชุดตาราง</th><th class="n">จำนวนแถว</th><th></th></tr></thead><tbody>
      ${Object.entries(sets).map(([k, n]) => `<tr><td>${esc(k === 'excel' ? 'excel (ตารางจากไฟล์ Excel เดิม)' : k)}</td><td class="n">${n}</td>
        <td class="n">${k === active ? '<span class="chip chip-ok">กำลังใช้</span>' : `<button class="btn btn-sm" data-use="${esc(k)}">ใช้ชุดนี้</button>`}
          <button class="btn btn-sm btn-danger" data-del="${esc(k)}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">ยังไม่มีตารางอ้างอิง กดปุ่มด้านล่างเพื่อโหลดตารางจากไฟล์ Excel เดิม</div>'}
    ${!sets[active] ? `<p class="small" style="color:var(--red)">ชุดที่ตั้งให้ใช้ (${esc(active)}) ยังไม่มีข้อมูล ระบบจึงแปลผลโภชนาการไม่ได้</p>` : ''}
    <div class="row"><button class="btn btn-primary" id="load-excel">${sets.excel ? 'โหลดตารางจาก Excel เดิมใหม่' : 'โหลดตารางจากไฟล์ Excel เดิม'}</button></div>
    <p class="small muted">ตารางในไฟล์ Excel เดิมครอบคลุมอายุ 0–18 ปี 11 เดือน ส่วนสูงชาย 50–180 ซม. และหญิง 50–170 ซม. นักเรียนหญิงที่สูงเกิน 170 ซม. จึงแปลผลน้ำหนักตามส่วนสูงไม่ได้
      · กรมอนามัยใช้กราฟเกณฑ์อ้างอิงการเจริญเติบโตของเด็กอายุ 6–19 ปี ฉบับปี 2563 ถ้าได้ตารางตัวเลขฉบับนั้น (เช่น จากศูนย์อนามัยหรือสำนักโภชนาการ) นำเข้าได้ด้านล่าง</p></div>
  <div class="card"><h2>นำเข้าตารางจากไฟล์ CSV</h2>
    <p class="small">คอลัมน์: <code>${CSV_COLS.join(',')}</code><br>
      sex = ช / ญ · basis = age_months (อายุเป็นเดือน) หรือ height_cm (ส่วนสูง ซม.) · measure = weight หรือ height · ค่า SD ที่ไม่มีเว้นว่างได้</p>
    <div class="row"><label class="field">ชื่อชุดตาราง<input type="text" id="g-name" value="doh2563" style="width:160px"></label>
      <label class="btn">เลือกไฟล์ CSV<input type="file" id="g-file" accept=".csv,.txt" hidden></label>
      <a class="btn btn-ghost" id="g-tpl" download="growth-reference-template.csv">ดาวน์โหลดแบบฟอร์ม</a></div></div>`;
  const tpl = `${CSV_COLS.join(',')}\nช,age_months,72,weight,20.5,2.9,15.1,16.3,24.8,26.3,\nช,height_cm,120,weight,22.1,2.6,17.5,18.4,26.0,27.4,29.8\n`;
  $('#g-tpl', pane).href = URL.createObjectURL(new Blob(['\ufeff' + tpl], { type: 'text/csv' }));
  const upsertRows = async (rows) => { for (let i = 0; i < rows.length; i += 500) await ctx.db.upsert('growth_reference', rows.slice(i, i + 500), 'ref_set,sex,basis,key,measure'); clearGrowthRef(); };
  $('#load-excel', pane).addEventListener('click', () => run(async () => {
    const { EXCEL_AGE, EXCEL_HT } = await import('../data/growth-excel.js?v=2569.10.27-8');
    await upsertRows(excelRefToRows(EXCEL_AGE, EXCEL_HT));
  }, 'โหลดตารางจาก Excel เดิมแล้ว'));
  pane.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () =>
    run(async () => { await ctx.db.upsert('school_settings', [{ id: 1, growth_ref_set: b.dataset.use }], 'id'); clearGrowthRef(); }, 'เปลี่ยนตารางที่ใช้แล้ว')));
  pane.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmBox(`ลบตารางชุด "${b.dataset.del}"?`, 'ลบ')) return;
    run(async () => { await ctx.db.remove('growth_reference', { ref_set: b.dataset.del }); clearGrowthRef(); }, 'ลบแล้ว');
  }));
  $('#g-file', pane).addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const name = $('#g-name', pane).value.trim().replace(/[^\w-]/g, '');
    if (!name) { toast('กรุณาตั้งชื่อชุดตาราง (ภาษาอังกฤษหรือตัวเลข)', 'err'); return; }
    const lines = (await f.text()).replace(/^\ufeff/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const head = lines.shift().split(',').map((h) => h.trim());
    const miss = CSV_COLS.slice(0, 4).filter((c) => !head.includes(c));
    if (miss.length) { toast(`ไฟล์ไม่มีคอลัมน์ ${miss.join(', ')}`, 'err'); return; }
    const rows = []; const bad = [];
    lines.forEach((l, i) => {
      const v = Object.fromEntries(l.split(',').map((x, j) => [head[j], x.trim()]));
      const sex = { ช: 'ช', ญ: 'ญ', 1: 'ช', 2: 'ญ', M: 'ช', F: 'ญ' }[v.sex];
      const num = (x) => (x === '' || x === undefined ? null : Number(x));
      if (!sex || !['age_months', 'height_cm'].includes(v.basis) || !['weight', 'height'].includes(v.measure) || !Number.isFinite(num(v.key))) { bad.push(i + 2); return; }
      rows.push({ ref_set: name, sex, basis: v.basis, key: Math.round(num(v.key)), measure: v.measure,
        ...Object.fromEntries(CSV_COLS.slice(4).map((c) => [c, num(v[c])])) });
    });
    if (bad.length) { toast(`แถวที่อ่านไม่ได้: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}`, 'err'); return; }
    run(() => upsertRows(rows), `นำเข้าชุด "${name}" แล้ว ${rows.length} แถว`);
  });
}

const BACKUP_TABLES = ['school_settings', 'terms', 'classrooms', 'classroom_teachers', 'profiles', 'students', 'student_private',
  'enrollments', 'subjects', 'courses', 'course_teachers', 'daily_attendance', 'period_attendance', 'behavior_notes',
  'assessment_items', 'item_scores', 'course_results', 'trait_scores', 'assess_detail', 'activity_results', 'homeroom_comments', 'health_measurements'];

function backup(pane, ctx) {
  pane.innerHTML = `<div class="card">
    <h2>สำรองข้อมูลทั้งระบบเป็นไฟล์ Excel</h2>
    <p class="small">ดาวน์โหลดข้อมูลทุกตาราง (1 ตาราง = 1 ชีต) เก็บไว้ใน Google Drive หรือแฟลชไดรฟ์ แนะนำให้ทำ<b>ทุกสัปดาห์</b>
      และทุกครั้งก่อนปิดภาคเรียน เพราะแผนฟรีของ Supabase ไม่มีการสำรองอัตโนมัติ</p>
    <p class="small muted">ไฟล์นี้มีข้อมูลส่วนบุคคลของนักเรียน (เลขประจำตัวประชาชน ข้อมูลผู้ปกครอง) กรุณาเก็บในที่ปลอดภัย</p>
    <div><button class="btn btn-primary" id="go">ดาวน์โหลดไฟล์สำรอง (.xlsx)</button></div>
    <div class="small muted" id="prog"></div></div>`;
  $('#go', pane).addEventListener('click', async () => {
    if (!window.XLSX?.utils?.book_new) { toast('โหลดตัวสร้างไฟล์ Excel ไม่สำเร็จ', 'err'); return; }
    const prog = $('#prog', pane);
    try {
      const wb = window.XLSX.utils.book_new();
      for (const t of BACKUP_TABLES) {
        prog.textContent = `กำลังอ่าน ${t}…`;
        const rows = (await ctx.db.select(t)).map((r) => Object.fromEntries(Object.entries(r)
          .map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])));
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), t.slice(0, 31));
      }
      const d = new Date();
      window.XLSX.writeFile(wb, `สำรองข้อมูล-${d.getFullYear() + 543}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`);
      prog.textContent = 'ดาวน์โหลดแล้ว';
    } catch (err) { prog.textContent = ''; toast(err.message, 'err'); }
  });
}

// ---------------------------------------------------------------------
//  การแจ้งเตือน: เลือกเรื่องที่ให้นับเป็นจุดแดง (ค่ากลางของโรงเรียน)
// ---------------------------------------------------------------------
function notify(pane, ctx, run) {
  const cfg = notifyConfig(ctx);
  const pend = new Set((ctx.alerts || []).map((a) => a.key));
  pane.innerHTML = `<form class="card" id="f-notify">
    <label class="sw-row"><input type="checkbox" id="n-all" ${cfg.all ? 'checked' : ''}><b>เปิดการแจ้งเตือนทั้งหมด</b></label>
    <p class="muted small" style="margin:0">เมื่อมีเรื่องค้าง จะมีจุดแดงบอกจำนวนเรื่องที่เมนู "ตั้งค่าระบบ" และบนแท็บที่ต้องแก้ เห็นเฉพาะผู้ดูแลระบบ</p>
    <div class="sw-list" id="n-items">${ITEMS.map((it) => `<label class="sw-row"><input type="checkbox" data-k="${it.key}" ${cfg.off.includes(it.key) ? '' : 'checked'} ${cfg.all ? '' : 'disabled'}>
      <span>${esc(it.label)}</span>${cfg.all && !cfg.off.includes(it.key) ? (pend.has(it.key) ? '<span class="chip chip-bad">ค้าง</span>' : '<span class="chip chip-ok">ครบแล้ว</span>') : ''}</label>`).join('')}</div>
    <div><button class="btn btn-primary" type="submit">บันทึก</button></div></form>`;
  const all = $('#n-all', pane);
  all.addEventListener('change', () => pane.querySelectorAll('[data-k]').forEach((c) => { c.disabled = !all.checked; }));
  $('#f-notify', pane).addEventListener('submit', (e) => {
    e.preventDefault();
    const off = [...pane.querySelectorAll('[data-k]')].filter((c) => !c.checked).map((c) => c.dataset.k);
    run(() => ctx.db.upsert('school_settings', [{ id: 1, notify: { all: all.checked, off } }], 'id'));
  });
}
