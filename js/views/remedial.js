// ติดตามการแก้ 0 ร มส (เฉพาะ ม.1–ม.3)
// ครูผู้สอน: วางแผน บันทึกผลแก้ แล้วส่งยืนยัน · ผู้ดูแลระบบ: ยืนยัน/ส่งกลับ · ไม่แก้เกรดใน ปพ.5
import { esc, $, modal, toast, options, roomName, fullName, thaiDate, todayIso } from '../util.js?v=2569.11.1-26';
import { CAUSES, PLANS, STATUS, NEW_GRADES, visibleCourses, canEditCase, loadRemedial, statusOf, originalOf, legacyLabel } from '../remedial.js?v=2569.11.1-26';
import { importFlow } from './remedial-import-view.js?v=2569.11.1-26';
import { attachBulk } from '../bulk.js?v=2569.11.1-26';

const pref = { room: '', status: '', grade: '' };
const sel = new Set();      // รายการที่ติ๊กเลือก (จำไว้ข้ามการวาดใหม่ เช่น เปลี่ยนตัวกรอง)
const gradeChip = (g) => `<span class="chip ${g === 'ร' ? 'chip-warn' : 'chip-bad'}">${esc(g)}</span>`;
const stChip = (st) => `<span class="chip ${STATUS[st].chip}">${STATUS[st].label}</span>`;
const dateOrDash = (d) => (d ? esc(thaiDate(d, true)) : '<span class="muted">–</span>');

export async function render(el, ctx) {
  const courses = visibleCourses(ctx);
  if (!courses.length) {
    el.innerHTML = `<div class="page-head"><div><h1>ติดตาม 0 ร มส</h1><p>เฉพาะนักเรียนมัธยม (ม.1–ม.3)</p></div></div>
      <div class="empty">ยังไม่มีรายวิชาระดับมัธยมที่คุณดูแลในภาคเรียนนี้</div>`;
    return;
  }
  const rooms = [...new Map(courses.map((k) => [k.classroom_id, k.classroom])).values()];
  let items = [];
  let timer = null;

  const load = async () => { items = await loadRemedial(ctx, courses); };

  const draw = () => {
    if (pref.room && !rooms.some((r) => r.id === pref.room)) pref.room = '';
    const inRoom = items.filter((it) => !pref.room || it.course.classroom_id === pref.room);
    const count = (st) => inRoom.filter((it) => statusOf(it) === st).length;
    const list = inRoom.filter((it) => (!pref.status || statusOf(it) === pref.status) && (!pref.grade || originalOf(it) === pref.grade));
    const todo = list.filter((it) => !it.case && canEditCase(ctx, it.course, null));
    const stats = [['', 'ทั้งหมด', inRoom.length], ...['none', 'planned', 'in_progress', 'submitted', 'unresolved', 'approved'].map((st) => [st, STATUS[st].label, count(st)])]
      .map(([st, label, n]) => `<button type="button" class="g-chip" data-st="${st}" aria-pressed="${pref.status === st}"><span>${label}</span><span class="g-num" style="font-weight:700">${n}</span></button>`).join('');

    el.innerHTML = `
      <div class="page-head"><div><h1>ติดตาม 0 ร มส</h1>
        <p>เฉพาะนักเรียน ม.1–ม.3 · รายการมาจากเกรดที่คำนวณได้ในหน้า "คะแนนรายวิชา" · ผลหลังแก้เก็บที่หน้านี้ ไม่แก้เกรดใน ปพ.5</p></div>
        <div class="row">
          <label class="field">ห้อง<select id="f-room"><option value="">ทุกห้อง</option>${options(rooms, pref.room, (r) => `ห้อง ${roomName(r)}`)}</select></label>
          <label class="field">ผลเดิม<select id="f-grade"><option value="">ทั้งหมด</option>
            ${['0', 'ร', 'มส'].map((g) => `<option value="${g}" ${pref.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
          ${ctx.isAdmin ? '<button class="btn" id="imp">นำเข้ารายการจากไฟล์</button>' : ''}
        </div></div>
      <div class="g-chips" role="group" aria-label="กรองตามสถานะ">${stats}</div>
      ${todo.length ? `<div class="notice row" style="align-items:center;justify-content:space-between"><span>มี ${todo.length} รายการที่ยังไม่เปิด — นักเรียนจะเห็นผลของตัวเองในหน้า "นักเรียนตรวจสอบผล" ต่อเมื่อเปิดรายการแล้ว</span>
        <button class="btn btn-sm btn-primary" id="open-all">เปิดรายการทั้งหมด (${todo.length})</button></div>` : ''}
      ${ctx.isAdmin && count('submitted') ? `<div class="notice">มี ${count('submitted')} รายการรอยืนยันผลแก้ — กดปุ่ม "ตรวจ" ที่แถวสถานะ "รอยืนยัน"</div>` : ''}
      ${list.length ? `<div class="rem-list">
        ${list.some((it) => canEditCase(ctx, it.course, it.case)) ? '<label class="g-selall"><span class="g-chkcell"><input class="g-chk g-all" type="checkbox" aria-label="เลือกทั้งหมดที่แสดงอยู่"></span><span>เลือกรายการ แล้วจัดการหลายรายการพร้อมกันจากแถบด้านล่าง</span></label>' : ''}
        <div class="tbl-wrap"><table class="tbl tbl-card has-chk">
        <thead><tr><th class="tc-chk"></th><th>ห้อง</th><th class="n">เลขที่</th><th>ชื่อ-สกุล</th><th>วิชา</th><th class="c">ผลเดิม</th><th class="hide-sm">สาเหตุ</th><th class="hide-sm">วิธีแก้</th>
          <th class="hide-sm">กำหนด</th><th>สถานะ</th><th class="c">ผลหลังแก้</th><th></th></tr></thead>
        <tbody>${list.map((it) => {
          const c = it.case; const edit = canEditCase(ctx, it.course, c);
          return `<tr><td class="tc-chk"><label class="g-chkcell"><input class="g-chk" type="checkbox" data-id="${esc(it.key)}" ${edit ? '' : 'disabled'} aria-label="เลือก ${esc(fullName(it.student))}"></label></td>
            <td class="tabular" data-l="ห้อง">${esc(roomName(it.course.classroom))}</td><td class="n tabular" data-l="เลขที่">${it.student.number ?? ''}</td>
            <td class="w tc-ttl">${esc(fullName(it.student))}</td>
            <td data-l="วิชา">${esc(it.course.subject?.code ?? '')}<br><span class="muted small">${esc(it.course.subject?.name ?? '')}</span>${it.course.legacy ? `<br><span class="chip">${esc(legacyLabel(it.course))}</span>` : ''}</td>
            <td class="c" data-l="ผลเดิม">${gradeChip(originalOf(it))}</td>
            <td class="hide-sm">${esc(CAUSES[c?.cause] ?? '–')}</td><td class="hide-sm">${esc(PLANS[c?.plan] ?? '–')}</td>
            <td class="hide-sm">${dateOrDash(c?.due_date)}</td>
            <td data-l="สถานะ">${stChip(statusOf(it))}${c?.review_note && statusOf(it) !== 'approved' ? `<br><span class="small muted" title="หมายเหตุจากผู้ดูแลระบบ">${esc(c.review_note)}</span>` : ''}</td>
            <td class="c" data-l="ผลหลังแก้">${c?.new_grade ? `<b>${esc(c.new_grade)}</b>${c.status === 'approved' ? '' : '<sup>รอยืนยัน</sup>'}` : '<span class="muted">–</span>'}</td>
            <td class="n tc-act"><button class="btn btn-sm${c?.status === 'submitted' && ctx.isAdmin ? ' btn-primary' : ''}" data-k="${esc(it.key)}">${
              ctx.isAdmin ? (c?.status === 'submitted' ? 'ตรวจ' : 'แก้ไข') : edit ? (c ? 'แก้ไข' : 'วางแผน') : 'ดู'}</button></td></tr>`; }).join('')}</tbody></table></div></div>`
      : `<div class="empty">${items.length ? 'ไม่มีรายการตามตัวกรองที่เลือก' : 'ไม่มีนักเรียนที่ได้ 0 ร หรือ มส ในวิชาที่คุณดูแล'}</div>`}
      <p class="muted small">0 ที่เกิดจากช่องคะแนนยังว่างจะไม่ถูกนับ จนกว่าจะกรอกคะแนนครบ</p>`;

    $('#f-room', el).addEventListener('change', (e) => { pref.room = e.target.value; draw(); });
    $('#f-grade', el).addEventListener('change', (e) => { pref.grade = e.target.value; draw(); });
    $('#imp', el)?.addEventListener('click', async () => { if (await importFlow(ctx)) { await load(); draw(); } });
    $('#open-all', el)?.addEventListener('click', async () => {
      try {
        await ctx.db.upsert('remedial_cases', todo.map((it) => ({ course_id: it.course.id, student_id: it.student.id, original_grade: originalOf(it), status: 'planned' })), 'course_id,student_id');
        toast(`เปิดรายการแล้ว ${todo.length} รายการ`); await load(); draw();
      } catch (err) { toast(err.message, 'err'); }
    });
    el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { pref.status = pref.status === b.dataset.st ? '' : b.dataset.st; draw(); }));
    el.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => {
      const it = items.find((x) => x.key === b.dataset.k);
      if (await editCase(ctx, it)) { await load(); draw(); }
    }));
    attachBulk({ root: el.querySelector('.rem-list') || el, host: el, unit: 'รายการ', state: sel, actions: bulkActions() });
  };

  // ---- จัดการหลายรายการ (แถบลอย) ----
  const picks = (ids) => ids.map((k) => items.find((x) => x.key === k)).filter(Boolean);
  const done = async (n, skipped, what) => { toast(`${what} ${n} รายการ${skipped ? ` · ข้าม ${skipped} รายการที่ทำไม่ได้` : ''}`, n ? 'ok' : 'err'); sel.clear(); await load(); draw(); };
  const bulkActions = () => {
    const fail = (err) => toast(err.message, 'err');
    const list = [
      { label: 'เปิดรายการ', cta: true, run: async (ids) => {
        const its = picks(ids); const ent = its.filter((it) => !it.case && canEditCase(ctx, it.course, null)).map((it) => ({ it, patch: { status: 'planned' } }));
        if (!ent.length) return toast('ที่เลือกมีรายการเปิดแล้วทั้งหมด', 'err');
        try { await applyPatches(ctx, ent); await done(ent.length, its.length - ent.length, 'เปิดรายการ'); } catch (err) { fail(err); }
      } },
      { label: 'ตั้งสาเหตุ/วิธีแก้…', run: async (ids) => {
        const r = await modal('ตั้งสาเหตุและวิธีแก้', `<p class="muted small" style="margin:0">ใช้กับ ${ids.length} รายการที่เลือก (เฉพาะที่คุณแก้ไขได้) ช่องที่เลือก "ไม่เปลี่ยน" จะคงค่าเดิมไว้</p>
          <label>สาเหตุ<select name="cause"><option value="">ไม่เปลี่ยน</option>${Object.entries(CAUSES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
          <label>วิธีแก้<select name="plan"><option value="">ไม่เปลี่ยน</option>${Object.entries(PLANS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>`, { okText: 'ตั้งค่า' });
        if (!r) return;
        if (!r.cause && !r.plan) return toast('ยังไม่ได้เลือกสาเหตุหรือวิธีแก้', 'err');
        const its = picks(ids); const ent = its.filter((it) => canEditCase(ctx, it.course, it.case))
          .map((it) => ({ it, patch: { ...(r.cause ? { cause: r.cause } : {}), ...(r.plan ? { plan: r.plan } : {}), status: it.case?.status || 'planned' } }));
        if (!ent.length) return toast('ไม่มีรายการที่คุณแก้ไขได้ในที่เลือก', 'err');
        try { await applyPatches(ctx, ent); await done(ent.length, its.length - ent.length, 'ตั้งสาเหตุ/วิธีแก้'); } catch (err) { fail(err); }
      } },
    ];
    if (ctx.isAdmin) list.push(
      { label: 'ยืนยันผลแก้', run: async (ids) => {
        const its = picks(ids); const ent = its.filter((it) => it.case?.status === 'submitted').map((it) => ({ it, patch: { status: 'approved', reviewed_by: ctx.me.id, reviewed_on: todayIso() } }));
        if (!ent.length) return toast('ที่เลือกไม่มีรายการสถานะ "รอยืนยัน"', 'err');
        try { await applyPatches(ctx, ent); await done(ent.length, its.length - ent.length, 'ยืนยันผลแก้'); } catch (err) { fail(err); }
      } },
      { label: 'ส่งกลับให้แก้', run: async (ids) => {
        const its = picks(ids).filter((it) => it.case?.status === 'submitted');
        if (!its.length) return toast('ที่เลือกไม่มีรายการสถานะ "รอยืนยัน"', 'err');
        const r = await modal(`ส่งกลับให้แก้ ${its.length} รายการ`, '<label>เหตุผล (ครูจะเห็น)<textarea name="note" rows="3" placeholder="เช่น ผลหลังแก้ยังไม่ครบ กรุณาตรวจสอบ"></textarea></label>', { okText: 'ส่งกลับ' });
        if (!r) return;
        try { await applyPatches(ctx, its.map((it) => ({ it, patch: { status: 'in_progress', review_note: r.note || null } }))); await done(its.length, ids.length - its.length, 'ส่งกลับ'); } catch (err) { fail(err); }
      } });
    return list;
  };


  await load();
  draw();
  const off = ctx.db.subscribe('remedial_cases', null, () => { clearTimeout(timer); timer = setTimeout(async () => { await load(); draw(); }, 400); });
  return () => { off(); clearTimeout(timer); };
}

// เขียนหลายรายการ: วิชาในภาคปัจจุบัน = upsert ครั้งเดียว (ทุกแถวต้องมีคีย์ชุดเดียวกัน ไม่งั้นช่องที่ขาดจะถูกเขียนทับเป็นว่าง) · วิชาค้าง = แก้ทีละแถวตาม id
async function applyPatches(ctx, entries) {
  const course = entries.filter((e) => !e.it.course.legacy); const legacy = entries.filter((e) => e.it.course.legacy);
  if (course.length) await ctx.db.upsert('remedial_cases', course.map(({ it, patch }) => ({ course_id: it.course.id, student_id: it.student.id, original_grade: originalOf(it), ...patch })), 'course_id,student_id');
  for (let i = 0; i < legacy.length; i += 8) await Promise.all(legacy.slice(i, i + 8).map(({ it, patch }) => ctx.db.update('remedial_cases', { id: it.case.id }, patch)));
}

// คืน true เมื่อมีการบันทึก
async function editCase(ctx, it) {
  const c = it.case || {};
  const edit = canEditCase(ctx, it.course, it.case);
  const sel = (name, map, v) => `<select name="${name}" ${edit ? '' : 'disabled'}><option value="">—</option>${Object.entries(map).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const statuses = ctx.isAdmin ? ['planned', 'in_progress', 'submitted', 'approved', 'unresolved'] : ['planned', 'in_progress', 'submitted', 'unresolved'];
  const cur = c.status || 'planned';
  const dis = edit ? '' : 'disabled';
  const body = `
    <p style="margin:0"><b>${esc(fullName(it.student))}</b> · ${esc(roomName(it.course.classroom))} เลขที่ ${it.student.number ?? ''}<br>
      ${esc(it.course.subject?.code ?? '')} ${esc(it.course.subject?.name ?? '')}${it.course.legacy ? ` <span class="chip">${esc(legacyLabel(it.course))}</span>` : ''} · ผลเดิม ${gradeChip(originalOf(it))}</p>
    ${c.status === 'approved' ? `<p class="small muted" style="margin:0">ยืนยันแล้ว${c.reviewed_on ? ` เมื่อ ${esc(thaiDate(c.reviewed_on, true))}` : ''}${ctx.isAdmin ? '' : ' — ครูแก้ไขไม่ได้'}</p>` : ''}
    <label>สาเหตุ${sel('cause', CAUSES, c.cause)}</label>
    <label>วิธีแก้${sel('plan', PLANS, c.plan)}</label>
    <div class="row"><label class="field">กำหนดแก้ภายใน<input type="date" name="due_date" value="${esc(c.due_date ?? '')}" ${dis}></label>
      <label class="field">วันที่แก้เสร็จ<input type="date" name="done_on" value="${esc(c.done_on ?? '')}" ${dis}></label></div>
    <label>ผลหลังแก้<select name="new_grade" ${dis}><option value="">ยังไม่มีผล</option>${NEW_GRADES.map((g) => `<option value="${g}" ${c.new_grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <label>สถานะ<select name="status" ${dis}>${statuses.map((s) => `<option value="${s}" ${cur === s ? 'selected' : ''}>${STATUS[s].label}${s === 'submitted' ? ' (ส่งให้ผู้ดูแลระบบยืนยัน)' : ''}</option>`).join('')}</select></label>
    <label>หมายเหตุครู<textarea name="note" rows="2" ${dis}>${esc(c.note ?? '')}</textarea></label>
    ${ctx.isAdmin ? `<label>หมายเหตุผู้ดูแลระบบ (ถ้าส่งกลับ ให้บอกเหตุผล)<textarea name="review_note" rows="2">${esc(c.review_note ?? '')}</textarea></label>`
      : c.review_note ? `<p class="small" style="margin:0"><b>ผู้ดูแลระบบ:</b> ${esc(c.review_note)}</p>` : ''}`;
  const r = await modal(it.case ? 'ผลการแก้ 0 ร มส' : 'วางแผนแก้ 0 ร มส', body, { okText: edit ? 'บันทึก' : 'ปิด', cancelText: edit ? 'ยกเลิก' : '', wide: true });
  if (!r || !edit) return false;
  const row = { course_id: it.course.id, student_id: it.student.id, original_grade: originalOf(it),
    cause: r.cause || null, plan: r.plan || null, due_date: r.due_date || null, done_on: r.done_on || null,
    new_grade: r.new_grade || null, status: r.status, note: r.note || null };
  if (ctx.isAdmin) {
    row.review_note = r.review_note || null;
    if (r.status === 'approved') { row.reviewed_by = ctx.me.id; row.reviewed_on = c.reviewed_on || todayIso(); }
  }
  if (['submitted', 'approved'].includes(row.status) && !(row.new_grade && row.done_on)) {
    toast('ส่งยืนยันต้องระบุ "ผลหลังแก้" และ "วันที่แก้เสร็จ"', 'err'); return false;
  }
  try {
    if (it.course.legacy) { const { course_id, student_id, original_grade, ...rest } = row; await ctx.db.update('remedial_cases', { id: it.case.id }, rest); }
    else await ctx.db.upsert('remedial_cases', [row], 'course_id,student_id');
    toast('บันทึกแล้ว'); return true;
  }
  catch (err) { toast(err.message, 'err'); return false; }
}
