import { esc, $, modal, toast, options, roomName, fullName, thaiDate, todayIso, LEVELS } from '../util.js?v=2569.10.27-8';
import { getRoster } from '../data.js?v=2569.10.27-8';
import { readDmcFile } from '../dmc.js?v=2569.10.27-8';

let selected = null;   // ห้องที่เลือกค้างไว้ระหว่างเปลี่ยนหน้า

export async function render(el, ctx) {
  const rooms = ctx.myClassrooms;
  if (!rooms.length) {
    el.innerHTML = `<div class="page-head"><div><h1>นักเรียน</h1></div></div>
      <div class="empty">คุณยังไม่ได้เป็นครูประจำชั้นห้องใด ${ctx.isAdmin ? '— สร้างห้องเรียนได้ที่ "ตั้งค่าระบบ" หรือนำเข้าไฟล์ DMC ทั้งโรงเรียนด้านล่าง' : 'กรุณาแจ้งฝ่ายวิชาการ'}</div>
      ${ctx.isAdmin ? '<div><label class="btn btn-primary">นำเข้าจาก DMC (ทั้งโรงเรียน)<input type="file" id="dmc-file" accept=".xls,.xlsx,.csv" hidden></label></div>' : ''}`;
    $('#dmc-file', el)?.addEventListener('change', (e) => importFlow(e.target, ctx, null, () => render(el, ctx)));
    return;
  }
  if (!rooms.some((r) => r.id === selected)) selected = rooms[0].id;
  const room = ctx.classroomById[selected];
  const roster = await getRoster(ctx.db, selected, { includeLeft: true });
  const active = roster.filter((s) => s.enroll_status !== 'left');
  const boys = active.filter((s) => s.gender === 'ช').length;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>นักเรียน</h1><p>ทะเบียนนักเรียนรายห้อง · ครูประจำชั้น: ${esc(ctx.homeroomTeachers(room.id).map((t) => t.full_name).join(', ') || '—')}</p></div>
      <div class="row">
        <label class="field">ห้อง<select id="room">${options(rooms, selected, (r) => `ห้อง ${roomName(r)}`)}</select></label>
      </div>
    </div>
    <div class="row">
      <label class="btn btn-primary">นำเข้าจาก DMC<input type="file" id="dmc-file" accept=".xls,.xlsx,.csv" hidden></label>
      <button class="btn" id="add">เพิ่มนักเรียน</button>
      <button class="btn" id="renum">เรียงเลขที่ใหม่</button>
      <span class="muted small">ชาย ${boys} · หญิง ${active.length - boys} · รวม ${active.length} คน</span>
    </div>
    ${roster.length ? `<div class="tbl-wrap"><table class="tbl stu-tbl">
      <thead><tr><th class="n">เลขที่</th><th class="hide-sm">เลขประจำตัว</th><th>ชื่อ-สกุล</th><th class="c hide-sm">เพศ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>${roster.map((s) => `<tr>
        <td class="n">${s.number ?? ''}</td><td class="tabular hide-sm">${esc(s.student_code ?? '')}</td>
        <td class="w">${esc(fullName(s))}</td><td class="c hide-sm">${esc(s.gender ?? '')}</td>
        <td>${s.enroll_status === 'left' ? `<span class="chip chip-warn">ออก ${esc(thaiDate(s.left_on, true))}</span>` : '<span class="chip chip-ok">กำลังเรียน</span>'}</td>
        <td class="n stu-act">
          <button class="btn btn-sm" data-edit="${esc(s.id)}">แก้ไข</button>
          <button class="btn btn-sm" data-info="${esc(s.id)}">ข้อมูล DMC</button>
          ${s.enroll_status !== 'left' ? `<button class="btn btn-sm btn-ghost" data-leave="${esc(s.enrollment_id)}">ย้ายออก</button>` : ''}
        </td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">ห้องนี้ยังไม่มีนักเรียน — กด "นำเข้าจาก DMC" เพื่อนำเข้ารายชื่อทั้งห้องในครั้งเดียว</div>'}`;

  const again = () => render(el, ctx);
  $('#room', el).addEventListener('change', (e) => { selected = e.target.value; again(); });
  $('#dmc-file', el).addEventListener('change', (e) => importFlow(e.target, ctx, room, again));
  $('#add', el).addEventListener('click', () => editStudent(ctx, room, null, active.length + 1, again));
  $('#renum', el).addEventListener('click', () => renumber(ctx, active, again));
  el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
    editStudent(ctx, room, roster.find((s) => s.id === b.dataset.edit), null, again)));
  el.querySelectorAll('[data-info]').forEach((b) => b.addEventListener('click', () => showDmc(ctx, b.dataset.info)));
  el.querySelectorAll('[data-leave]').forEach((b) => b.addEventListener('click', async () => {
    const r = await modal('ย้ายออกระหว่างภาค', `<label>วันที่ออก<input type="date" name="d" value="${todayIso()}" required></label>
      <p class="muted small">ประวัติเวลาเรียนเดิมยังอยู่ และจะนับในรายงาน "ออกระหว่างภาคเรียน" ของปก ปพ.5</p>`);
    if (!r) return;
    try { await ctx.db.update('enrollments', { id: b.dataset.leave }, { status: 'left', left_on: r.d }); toast('บันทึกแล้ว'); again(); }
    catch (err) { toast(err.message, 'err'); }
  }));
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
  if (!p) { toast('ไม่มีข้อมูลส่วนบุคคล หรือคุณไม่มีสิทธิ์ดู (เฉพาะครูประจำชั้นและฝ่ายวิชาการ)', 'err'); return; }
  const raw = p.dmc_raw || {};
  const keys = Object.keys(raw);
  await modal('ข้อมูลจากไฟล์ DMC', keys.length
    ? `<div class="tbl-wrap"><table class="tbl"><tbody>${keys.map((k) => `<tr><th>${esc(k)}</th><td>${esc(raw[k])}</td></tr>`).join('')}</tbody></table></div>`
    : `<p>วันเกิด: ${esc(thaiDate(p.birth_date))}<br>ศาสนา: ${esc(p.religion ?? '-')}</p><p class="muted small">นักเรียนคนนี้ไม่ได้นำเข้าจาก DMC</p>`,
  { okText: 'ปิด', cancelText: '', wide: true });
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
//  นำเข้า DMC: ไฟล์เดียวมีหลายห้องได้ — แอดมินสร้างห้องให้อัตโนมัติ
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
      · ข้อมูลส่วนบุคคล (เลขประชาชน ผู้ปกครอง ที่อยู่) เห็นเฉพาะครูประจำชั้นและฝ่ายวิชาการ</p>`,
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
