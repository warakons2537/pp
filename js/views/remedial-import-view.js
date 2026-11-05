// หน้าต่างนำเข้ารายการ 0 ร มส จากไฟล์ (ผู้ดูแลระบบ): เลือกไฟล์ → ตรวจสอบ/ดูตัวอย่างทุกแถว → ยืนยันนำเข้า
import { esc, $, toast, roomName, fullName } from '../util.js?v=2569.11.1-23';
import { getRoster } from '../data.js?v=2569.11.1-23';
import { CAUSES, PLANS } from '../remedial.js?v=2569.11.1-23';
import { parseCsv, toCsv, rowsFromTable, planImport, applyImport, TEMPLATE_HEADERS } from '../remedial-import.js?v=2569.11.1-23';

const LEVEL = { ok: ['chip-ok', 'พร้อมนำเข้า'], warn: ['chip-warn', 'นำเข้าได้ (มีข้อสังเกต)'], skip: ['', 'ข้าม'], error: ['chip-bad', 'นำเข้าไม่ได้'] };

async function readTable(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!window.XLSX) throw new Error('โหลดไลบรารีอ่าน Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต หรือบันทึกไฟล์เป็น .csv แล้วลองใหม่');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
}

// ข้อมูลที่ใช้จับคู่: นักเรียน ม.1–ม.3 ของปีปัจจุบัน · รายวิชาทุกภาคเรียนของห้องเหล่านั้น · รายการที่มีอยู่แล้ว (กันซ้ำ)
async function buildEnv(ctx) {
  const rooms = ctx.classrooms.filter((c) => String(c.level).startsWith('ม.'));
  const byCode = new Map();
  for (const room of rooms) for (const s of await getRoster(ctx.db, room.id)) if (s.student_code) byCode.set(String(s.student_code).trim(), { student: s, classroom: room });
  const ids = rooms.map((r) => r.id);
  const courses = ids.length ? (await ctx.db.select('courses', { in: { classroom_id: ids } })).map((k) => ({ id: k.id, classroom_id: k.classroom_id, term_id: k.term_id,
    code: ctx.subjectById[k.subject_id]?.code ?? '', name: ctx.subjectById[k.subject_id]?.name ?? '' })) : [];
  const cases = ids.length ? await ctx.db.select('remedial_cases', { in: { student_id: [...byCode.values()].map((x) => x.student.id) } }) : [];
  return { byCode, courses, terms: new Map(ctx.terms.map((t) => [t.id, t])), currentTermId: ctx.term?.id,
    existing: { course: new Set(cases.filter((c) => c.course_id).map((c) => `${c.course_id}|${c.student_id}`)),
      legacy: new Set(cases.filter((c) => !c.course_id).map((c) => `${c.student_id}|${c.legacy_code}|${c.legacy_year ?? 0}`)) } };
}

function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// คืน true เมื่อมีการนำเข้า
export function importFlow(ctx) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="นำเข้ารายการ 0 ร มส" style="max-width:1000px">
      <h3>นำเข้ารายการ 0 ร มส จากไฟล์</h3>
      <div id="imp-body" style="display:flex;flex-direction:column;gap:12px">
        <p class="small muted" style="margin:0">ไฟล์ .csv หรือ .xlsx แถวแรกเป็นหัวตาราง ต้องมีคอลัมน์ <b>เลขประจำตัว · รหัสวิชา · ผลเดิม</b> (ผลเดิม = 0 / ร / มส) คอลัมน์อื่นไม่บังคับ
          ระบบจับคู่นักเรียนด้วยเลขประจำตัว วิชาที่เปิดสอนในภาคเรียนปัจจุบันจะเป็นรายการปกติ ส่วนวิชาที่ติดมาจากปีก่อน/ภาคก่อนจะเก็บเป็น "วิชาค้าง" ให้เอง
          และเสนอสาเหตุ/วิธีแก้เริ่มต้นให้ (ครูและผู้ดูแลระบบแก้ได้ภายหลัง · ไม่แตะเกรดใน ปพ.5)</p>
        <div class="row"><label class="btn btn-primary">เลือกไฟล์…<input type="file" id="imp-file" accept=".csv,.xlsx,.xls" hidden></label>
          <button type="button" class="btn" id="imp-tpl">ดาวน์โหลดแม่แบบ (.csv)</button></div>
        <div id="imp-out"></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-x>ปิด</button><button type="button" class="btn btn-primary" id="imp-go" hidden>นำเข้า</button></div></div>`;
    document.body.appendChild(wrap);
    let done = false; let plan = null;
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(done); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
    $('#imp-tpl', wrap).addEventListener('click', () => download('แม่แบบนำเข้า-0รมส.csv', toCsv([TEMPLATE_HEADERS, ['5912', 'ชื่อ นามสกุล', 'ม.1/1', 'ค21101', 'คณิตศาสตร์', '1.5', '0', '', '']])));
    const out = $('#imp-out', wrap); const go = $('#imp-go', wrap);

    const show = (onlyIssues) => {
      const { items, counts } = plan;
      const list = onlyIssues ? items.filter((i) => i.level !== 'ok') : items;
      out.innerHTML = `<div class="row" style="align-items:center;justify-content:space-between">
          <div class="small"><span class="chip chip-ok">พร้อม ${counts.ok}</span> <span class="chip chip-warn">มีข้อสังเกต ${counts.warn}</span> <span class="chip">ข้าม ${counts.skip}</span> <span class="chip chip-bad">ผิดพลาด ${counts.error}</span> · ทั้งหมด ${items.length} แถว</div>
          <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="imp-only" ${onlyIssues ? 'checked' : ''}> แสดงเฉพาะแถวที่มีปัญหา</label></div>
        <div class="tbl-wrap" style="max-height:52vh;overflow:auto"><table class="tbl"><thead><tr><th class="n">แถว</th><th>นักเรียน</th><th>วิชา</th><th class="c">ผลเดิม</th><th>ประเภท</th><th>ข้อเสนอแนะ</th><th>ผลตรวจ</th></tr></thead><tbody>
        ${list.map((i) => { const p = i.payload; const [cls, label] = LEVEL[i.level];
          return `<tr><td class="n tabular">${i.line}</td>
            <td class="w">${i.student ? `${esc(fullName(i.student))}<br><span class="muted small">${esc(i.classroom ? roomName(i.classroom) : '')} · ${esc(i.row.code)}</span>` : `<span class="muted">${esc(i.row.code || '–')}</span>`}</td>
            <td>${esc(i.row.subject)}<br><span class="muted small">${esc(i.row.title)}</span></td><td class="c">${esc(i.row.grade)}</td>
            <td class="small">${esc(i.label)}</td>
            <td class="small">${p ? `${esc(CAUSES[p.cause] ?? '–')}<br>${esc(PLANS[p.plan] ?? '–')}${p.status === 'in_progress' ? '<br><b>กำลังแก้</b> (แก้แล้ว)' : ''}` : '–'}</td>
            <td><span class="chip ${cls}">${label}</span>${i.messages.map((m) => `<br><span class="small ${i.level === 'error' ? '' : 'muted'}">${esc(m)}</span>`).join('')}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">ไม่มีแถวที่ต้องแสดง</td></tr>'}
        </tbody></table></div>`;
      $('#imp-only', out).addEventListener('change', (e) => show(e.target.checked));
      go.hidden = !plan.importable.length; go.textContent = `นำเข้า ${plan.importable.length} รายการ`;
    };

    $('#imp-file', wrap).addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return;
      out.innerHTML = '<div class="loading" role="status"><i class="bar"></i><span>กำลังตรวจสอบไฟล์…</span></div>'; go.hidden = true;
      try {
        const rows = rowsFromTable(await readTable(file));
        if (!rows.length) throw new Error('ไม่พบข้อมูลในไฟล์');
        plan = planImport(rows, await buildEnv(ctx));
        show(plan.counts.error + plan.counts.warn > 0);
      } catch (err) { out.innerHTML = `<div class="notice">${esc(err.message)}</div>`; plan = null; }
      e.target.value = '';
    });
    go.addEventListener('click', async () => {
      if (!plan?.importable.length) return;
      go.disabled = true;
      try {
        const r = await applyImport(ctx.db, plan.importable);
        done = true; toast(`นำเข้าแล้ว ${r.course + r.legacy} รายการ (วิชาปัจจุบัน ${r.course} · วิชาค้าง ${r.legacy})`); close();
      } catch (err) { toast(`นำเข้าไม่สำเร็จ: ${err.message}`, 'err'); go.disabled = false; }
    });
  });
}
