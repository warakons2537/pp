// =====================================================================
//  คุณลักษณะ/กิจกรรม → นำเข้าจากไฟล์ (คุณลักษณะอันพึงประสงค์ · สมรรถนะ · อ่านคิดวิเคราะห์เขียน)
//  เลือกได้หลายไฟล์ → ตารางตรวจ (ห้อง · จับคู่นักเรียน · ข้อมูลเดิม · นำเข้า/ข้าม) → เขียน assess_detail / trait_scores
//  ช่องที่ว่างในไฟล์ไม่ลบค่าเดิมในระบบ · ผลสรุปรายข้อ (trait_scores) คำนวณใหม่จากค่ารวมของไฟล์กับค่าเดิม
// =====================================================================
import { esc, toast, roomName, fullName } from '../util.js?v=2569.10.31-10';
import { getRoster } from '../data.js?v=2569.10.31-10';
import { sheetMatrix, matchStudents } from '../achievement-import.js?v=2569.10.31-10';
import { detectKind, parseAssessFile, KIND_LABEL } from '../assess-import.js?v=2569.10.31-10';
import { TRAITS, COMPETENCIES, traitResult, compResult } from '../assess-forms.js?v=2569.10.31-10';

async function readFiles(files) {
  if (!window.XLSX) throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า');
  const ok = []; const skipped = [];
  for (const file of files) {
    try {
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      if (!detectKind(wb.SheetNames)) { skipped.push({ fileName: file.name, reason: 'ไม่ใช่ไฟล์คุณลักษณะ สมรรถนะ หรืออ่านคิดวิเคราะห์เขียนของโรงเรียน' }); continue; }
      const sheets = Object.fromEntries(wb.SheetNames.map((n) => [n, sheetMatrix(window.XLSX, wb.Sheets[n])]));
      ok.push(parseAssessFile(sheets, file.name));
    } catch (err) { skipped.push({ fileName: file.name, reason: err.message }); }
  }
  return { ok, skipped };
}

const overlay = (html) => {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  return wrap;
};

export async function assessImportFlow(ctx, fileList, { roomId } = {}) {
  if (!ctx.term) throw new Error('ยังไม่ได้ตั้งภาคเรียนปัจจุบัน');
  const { ok, skipped } = await readFiles([...fileList]);
  if (!ok.length) throw new Error(skipped.length ? `ไม่มีไฟล์ที่อ่านได้: ${skipped.map((s) => `${s.fileName} (${s.reason})`).join(', ')}` : 'ไม่ได้เลือกไฟล์');

  const canEditRoom = (id) => ctx.isAdmin || ctx.classroomTeacherRows.some((x) => x.classroom_id === id && x.teacher_id === ctx.me.id);
  const rows = ok.map((p) => {
    const year = p.year ?? ctx.term.academic_year; const no = p.term ?? ctx.term.term;
    const term = ctx.terms.find((t) => t.academic_year === year && t.term === no) || null;
    const err = !term ? `ไม่พบภาคเรียน ${no}/${year} ในระบบ`
      : term.academic_year !== ctx.term.academic_year ? `ภาคเรียน ${no}/${year} อยู่นอกปีการศึกษาปัจจุบัน` : '';
    const cands = ctx.classrooms.filter((c) => c.level === p.level);
    const classroomId = cands.length === 1 ? cands[0].id : cands.some((c) => c.id === roomId) ? roomId : '';
    return { p, term, err, classroomId, action: err ? 'skip' : 'import' };
  });
  // ไฟล์ชนิดเดียวกัน ห้องเดียวกัน ภาคเดียวกันที่ซ้ำ → แถวหลังข้ามไว้ก่อน
  const dupOf = (i) => rows.findIndex((r, j) => j < i && rows[i].classroomId && r.classroomId === rows[i].classroomId && r.p.kind === rows[i].p.kind && r.term?.id === rows[i].term?.id);
  const rosters = new Map();
  const roster = (id) => { if (!rosters.has(id)) rosters.set(id, getRoster(ctx.db, id)); return rosters.get(id); };

  return new Promise((resolve) => {
    const wrap = overlay(`
      <h3>นำเข้าคุณลักษณะ · สมรรถนะ · อ่านคิดวิเคราะห์เขียน</h3>
      <p class="small muted" style="margin:0">จับคู่นักเรียนด้วยชื่อ (ตัดคำนำหน้า) ก่อน ถ้าไม่ตรงใช้เลขที่ · ทับเฉพาะช่องที่มีคะแนนในไฟล์ ช่องว่างไม่ลบข้อมูลเดิม · ผลสรุปรายข้อคำนวณให้ใหม่</p>
      ${skipped.length ? `<div class="small"><b>ข้าม ${skipped.length} ไฟล์:</b><ul style="margin:4px 0">${skipped.map((s) => `<li>${esc(s.fileName)} — ${esc(s.reason)}</li>`).join('')}</ul></div>` : ''}
      <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ไฟล์</th><th>ชั้น/ภาคเรียน</th><th>ห้อง</th><th class="n">จับคู่</th><th>ข้อมูลเดิม</th><th>การทำงาน</th></tr></thead><tbody id="ai-body"></tbody></table></div>
      <div class="modal-actions"><span class="small muted" id="ai-sum" style="margin-right:auto"></span>
        <button type="button" class="btn btn-ghost" data-x>ยกเลิก</button><button type="button" class="btn btn-primary" id="ai-go">นำเข้า</button></div>`);
    const body = wrap.querySelector('#ai-body');

    function draw() {
      rows.forEach((r, i) => { const d = dupOf(i); if (r.dup !== d) { r.dup = d; if (d >= 0 && r.action === 'import') r.action = 'skip'; } });
      body.innerHTML = rows.map((r, i) => {
        const cands = r.p.level ? ctx.classrooms.filter((c) => c.level === r.p.level) : ctx.classrooms;
        const locked = r.classroomId && !canEditRoom(r.classroomId);
        return `<tr data-i="${i}">
          <td class="tc-ttl"><span class="small">${i + 1}. ${esc(r.p.fileName)}</span> <span class="chip chip-info">${esc(KIND_LABEL[r.p.kind])}</span>
            ${r.err ? `<div class="small" style="color:var(--red);font-weight:400">${esc(r.err)}</div>` : ''}
            ${r.dup >= 0 ? `<div class="small" style="color:var(--red);font-weight:400">ซ้ำกับแถว ${r.dup + 1}</div>` : ''}
            ${locked ? '<div class="small" style="color:var(--red);font-weight:400">ไม่ใช่ครูประจำชั้นของห้องนี้</div>' : ''}
            ${r.p.warnings.length ? `<details class="small" style="font-weight:400"><summary>เตือน ${r.p.warnings.length} รายการ</summary>${r.p.warnings.slice(0, 20).map(esc).join('<br>')}</details>` : ''}</td>
          <td data-l="ชั้น/ภาคเรียน">${esc(r.p.level || '—')} · ${r.term ? `${r.term.term}/${r.term.academic_year}` : '—'}</td>
          <td data-l="ห้อง"><select data-f="classroomId"><option value="">— เลือกห้อง —</option>${cands.map((c) => `<option value="${c.id}" ${c.id === r.classroomId ? 'selected' : ''}>${esc(roomName(c))}</option>`).join('')}</select></td>
          <td class="n" data-l="จับคู่" data-m="${i}">…</td><td class="small" data-l="ข้อมูลเดิม" data-e="${i}">…</td>
          <td class="tc-act"><select data-f="action" ${r.err || locked ? 'disabled' : ''}><option value="import" ${r.action === 'import' && !r.err && !locked ? 'selected' : ''}>นำเข้า (ทับช่องที่มีในไฟล์)</option><option value="skip" ${r.action === 'skip' || r.err || locked ? 'selected' : ''}>ข้าม</option></select></td></tr>`;
      }).join('');
      const go = rows.filter((r) => r.action === 'import' && !r.err && r.classroomId && canEditRoom(r.classroomId)).length;
      wrap.querySelector('#ai-sum').textContent = `นำเข้า ${go} · ข้าม ${rows.length - go} ไฟล์`;
      rows.forEach(async (r, i) => {
        const m = body.querySelector(`[data-m="${i}"]`); const e = body.querySelector(`[data-e="${i}"]`);
        if (!r.classroomId || !r.term) { m.textContent = '–'; e.textContent = '–'; return; }
        try {
          const ros = await roster(r.classroomId);
          const plan = matchStudents(r.p, ros, fullName); const hit = plan.filter((x) => x.s);
          m.innerHTML = `<span style="${hit.length < r.p.students.length ? 'color:var(--red)' : ''}">${hit.length}/${r.p.students.length}</span>`;
          const ids = hit.map((x) => x.s.id);
          const have = ids.length ? (r.p.kind === 'rtw'
            ? await ctx.db.select('trait_scores', { eq: { term_id: r.term.id, kind: 'rtw' }, in: { student_id: ids } })
            : await ctx.db.select('assess_detail', { eq: { term_id: r.term.id, form: r.p.kind }, in: { student_id: ids } })) : [];
          const n = new Set(have.map((x) => x.student_id)).size;
          e.innerHTML = n ? `<span class="chip chip-warn">มีข้อมูลแล้ว ${n} คน</span>` : '<span class="muted">ยังไม่มี</span>';
        } catch { m.textContent = '?'; e.textContent = '?'; }
      });
    }
    body.addEventListener('change', (ev) => {
      const f = ev.target.dataset.f; if (!f) return;
      rows[Number(ev.target.closest('tr').dataset.i)][f] = ev.target.value;
      draw();
    });
    const close = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-x]').addEventListener('click', () => close(null));
    wrap.querySelector('#ai-go').addEventListener('click', async () => {
      const todo = rows.filter((r) => r.action === 'import' && !r.err && canEditRoom(r.classroomId || ''));
      if (!todo.length) return toast('ไม่ได้เลือกไฟล์ที่จะนำเข้า');
      const noRoom = todo.filter((r) => !r.classroomId);
      if (noRoom.length) return toast(`เลือกห้องให้ครบก่อน: ${noRoom.map((r) => r.p.fileName).join(', ')}`, 'err');
      wrap.querySelectorAll('button, select, input').forEach((x) => { x.disabled = true; });
      const sum = wrap.querySelector('#ai-sum');
      resolve(await save(ctx, todo, (t) => { sum.textContent = t; }).finally(() => wrap.remove()));
    });
    draw();
  });
}

const chunk = async (arr, fn, n = 500) => { for (let i = 0; i < arr.length; i += n) await fn(arr.slice(i, i + n)); };

// ---------- บันทึก: ทีละไฟล์ ----------
async function save(ctx, rows, progress) {
  const out = { files: 0, students: 0, cells: 0, errors: [] };
  for (const [n, r] of rows.entries()) {
    progress(`กำลังนำเข้า ${n + 1}/${rows.length}: ${r.p.fileName}`);
    try {
      const term = r.term.id; const kind = r.p.kind;
      const hit = matchStudents(r.p, await getRoster(ctx.db, r.classroomId), fullName).filter((x) => x.s);
      if (!hit.length) { out.errors.push(`${r.p.fileName}: ไม่พบนักเรียนที่ตรงกับห้องที่เลือก`); continue; }
      const ids = hit.map((x) => x.s.id);
      let cells = 0;
      if (kind === 'rtw') {
        const up = hit.flatMap(({ p, s }) => [...p.values].map(([item, score]) => ({ term_id: term, student_id: s.id, kind: 'rtw', item_no: Number(item), score })));
        await chunk(up, (c) => ctx.db.upsert('trait_scores', c, 'term_id,student_id,kind,item_no'));
        cells = up.length;
      } else {
        const have = await ctx.db.select('assess_detail', { eq: { term_id: term, form: kind }, in: { student_id: ids } });
        const merged = new Map(have.map((x) => [`${x.student_id}|${x.code}`, x.score]));
        const up = [];
        for (const { p, s } of hit) for (const [code, score] of p.values) { merged.set(`${s.id}|${code}`, score); up.push({ term_id: term, student_id: s.id, form: kind, code, score }); }
        await chunk(up, (c) => ctx.db.upsert('assess_detail', c, 'term_id,student_id,form,code'));
        // ผลสรุปรายข้อ → trait_scores (ใช้กับ ปพ.6) คำนวณจากค่ารวมของไฟล์กับค่าเดิม
        const sum = [];
        for (const { s } of hit) {
          const get = (code) => merged.get(`${s.id}|${code}`) ?? null;
          if (kind === 'trait8') TRAITS.forEach((t) => { const x = traitResult(t, get); if (x.filled) sum.push({ term_id: term, student_id: s.id, kind, item_no: t.no, score: x.level }); });
          else COMPETENCIES.forEach((c) => { const x = compResult(c, get); if (x.filled) sum.push({ term_id: term, student_id: s.id, kind, item_no: c.no, score: x.level }); });
        }
        await chunk(sum, (c) => ctx.db.upsert('trait_scores', c, 'term_id,student_id,kind,item_no'));
        cells = up.length;
      }
      out.files++; out.students += hit.length; out.cells += cells;
      if (hit.length < r.p.students.length) out.errors.push(`${r.p.fileName}: จับคู่นักเรียนได้ ${hit.length}/${r.p.students.length} คน`);
    } catch (err) { out.errors.push(`${r.p.fileName}: ${err.message}`); }
  }
  return out;
}
