// =====================================================================
//  ตั้งค่าระบบ → รายวิชา → นำเข้าครูจาก WL Scheduler (.csv)
//  ตารางตรวจ (ครู · ชื่อวิชา) → สร้างครูที่ยังไม่มีบัญชี + ผูกครูกับการเปิดสอนของภาคเรียนปัจจุบัน
// =====================================================================
import { esc } from '../util.js?v=2569.10.31-10';
import { readSchedulerCsv, teacherChoices, subjectChoices, subjectOptions, planLinks, displayName } from '../teacher-import.js?v=2569.10.31-10';

const overlay = (html) => {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  return wrap;
};

export async function teacherImportFlow(ctx, file) {
  if (!ctx.term) throw new Error('ยังไม่ได้ตั้งภาคเรียนปัจจุบัน');
  const rows = readSchedulerCsv(await file.text());
  if (!rows.length) throw new Error('ไม่มีข้อมูลในไฟล์');
  const teachers = teacherChoices(rows, ctx.profiles);
  const subjects = subjectChoices(rows, ctx.subjects);
  const sOpts = subjectOptions(ctx.subjects);
  const who = (p) => `${p.full_name || p.email}${p.has_account === false ? ' (ยังไม่มีบัญชี)' : ''}`;

  return new Promise((resolve) => {
    const wrap = overlay(`
      <h3>นำเข้าครูจาก WL Scheduler · ภาคเรียนที่ ${ctx.term.term}/${ctx.term.academic_year}</h3>
      <p class="small muted" style="margin:0">ใช้คอลัมน์ "ครูประจำรายวิชา" · ผูกครูกับการเปิดสอนของชั้นนั้นทุกห้อง · ครูที่ยังไม่มีในระบบจะถูกสร้างไว้ก่อน (ยังไม่มีบัญชี) และจับคู่ให้เองเมื่อครูสมัครด้วยชื่อเดียวกัน</p>
      <h4 style="margin:12px 0 4px">ครู (${teachers.length} ชื่อ)</h4>
      <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ชื่อในไฟล์</th><th>ใช้เป็น</th></tr></thead><tbody id="ti-t"></tbody></table></div>
      <h4 style="margin:12px 0 4px">รายวิชา (${subjects.length} ชื่อ)</h4>
      <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ชื่อในไฟล์</th><th>วิชาในระบบ</th></tr></thead><tbody id="ti-s"></tbody></table></div>
      <details class="small" style="margin-top:8px"><summary id="ti-skip-h"></summary><ul id="ti-skip" style="margin:4px 0"></ul></details>
      <div class="modal-actions"><span class="small muted" id="ti-sum" style="margin-right:auto"></span>
        <button type="button" class="btn btn-ghost" data-x>ยกเลิก</button><button type="button" class="btn btn-primary" id="ti-go">นำเข้า</button></div>`);

    wrap.querySelector('#ti-t').innerHTML = teachers.map((t, i) => `<tr><td class="tc-ttl">${esc(t.name)}${t.hits.length > 1 ? ' <span class="chip chip-warn">ชื่อตรงหลายคน</span>' : ''}</td>
      <td data-l="ใช้เป็น"><select data-t="${i}">
        <option value="" ${t.choice === '' ? 'selected' : ''} disabled>— เลือก —</option>
        <option value="new" ${t.choice === 'new' ? 'selected' : ''}>สร้างใหม่: ${esc(displayName(t.name))}</option>
        <option value="skip" ${t.choice === 'skip' ? 'selected' : ''}>ข้าม (ไม่ใช่ชื่อครู)</option>
        ${ctx.profiles.map((p) => `<option value="${p.id}" ${t.choice === p.id ? 'selected' : ''}>${esc(who(p))}</option>`).join('')}
      </select></td></tr>`).join('');
    wrap.querySelector('#ti-s').innerHTML = subjects.map((s, i) => `<tr><td class="tc-ttl">${esc(s.name)}${s.choice ? '' : ' <span class="chip chip-warn">ไม่พบชื่อตรง</span>'}</td>
      <td data-l="วิชาในระบบ"><select data-s="${i}"><option value="">— ข้าม —</option>
        ${sOpts.map((o) => `<option value="${esc(o.id)}" ${s.choice === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></td></tr>`).join('');

    let plan;
    const update = () => {
      plan = planLinks(rows, ctx.courses, new Map(teachers.map((t) => [t.name, t.choice])), new Map(subjects.map((s) => [s.name, s.choice])));
      const add = plan.links.filter((l) => !l.already);
      const nNew = new Set(add.filter((l) => l.teacherId === 'new').map((l) => l.teacher)).size;
      wrap.querySelector('#ti-sum').textContent = `ผูกครูใหม่ ${add.length} รายการ · มีอยู่แล้ว ${plan.links.length - add.length} · สร้างครู ${nNew} คน · ข้าม ${plan.skipped.length} แถว`;
      wrap.querySelector('#ti-skip-h').textContent = `แถวที่ข้าม ${plan.skipped.length} แถว`;
      wrap.querySelector('#ti-skip').innerHTML = plan.skipped.map((r) => `<li>แถว ${r.line}: ${esc(r.level)} ${esc(r.subject)} — ${esc(r.teacher || '–')} · ${esc(r.reason)}</li>`).join('');
      wrap.querySelector('#ti-go').disabled = !add.length;
    };
    wrap.querySelectorAll('[data-t]').forEach((el) => el.addEventListener('change', () => { teachers[el.dataset.t].choice = el.value; update(); }));
    wrap.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', () => { subjects[el.dataset.s].choice = el.value; update(); }));
    update();

    wrap.querySelector('[data-x]').addEventListener('click', () => { wrap.remove(); resolve(null); });
    wrap.querySelector('#ti-go').addEventListener('click', async () => {
      const btn = wrap.querySelector('#ti-go'); btn.disabled = true; btn.textContent = 'กำลังนำเข้า…';
      try {
        const add = plan.links.filter((l) => !l.already);
        const newNames = [...new Set(add.filter((l) => l.teacherId === 'new').map((l) => l.teacher))];
        const made = newNames.length
          ? await ctx.db.insert('profiles', newNames.map((n) => ({ full_name: displayName(n), role: 'teacher', has_account: false }))) : [];
        const idOf = new Map(newNames.map((n, i) => [n, made[i].id]));
        const ct = [...new Map(add.map((l) => { const tid = l.teacherId === 'new' ? idOf.get(l.teacher) : l.teacherId; return [`${l.courseId}|${tid}`, { course_id: l.courseId, teacher_id: tid }]; })).values()];
        if (ct.length) await ctx.db.insert('course_teachers', ct);
        wrap.remove();
        resolve({ created: newNames.length, linked: ct.length, skipped: plan.skipped.length });
      } catch (err) {
        btn.disabled = false; btn.textContent = 'นำเข้า';
        wrap.querySelector('#ti-sum').textContent = err.message;
      }
    });
  });
}
