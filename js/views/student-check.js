// หน้านักเรียนตรวจสอบผลการเรียนของตัวเอง (ไม่ต้องมีบัญชี) แยกเป็น 2 แท็บ: ผลการเรียน · 0 ร มส
//  - 0 ร มส: กรอกช่องใดช่องหนึ่งก็ได้ (ชื่อ / นามสกุล / เลขประจำตัว)
//  - ผลการเรียน: กรอกอย่างน้อย 2 ช่อง (เข้มกว่า เพราะเป็นผลทั้งหมด) และต้องเป็นภาคเรียนที่ผู้ดูแลระบบเปิดให้ดู
//  - ที่กรอกตรงกับนักเรียนหลายคน = ไม่แสดงข้อมูลใคร ให้กรอกช่องอื่นเพิ่ม
import { esc, $, toast } from '../util.js?v=2569.10.31-12';
import { CAUSES, PLANS, STATUS } from '../remedial.js?v=2569.10.31-12';
import { computeStudent, fmtGrade, gpa, weightOf } from '../grading.js?v=2569.10.31-12';

const FIELDS = ['first', 'last', 'code'];
const filled = (f) => FIELDS.filter((k) => String(f[k] || '').trim()).length;

export function renderStudentCheck(root, db, onBack) {
  const state = { vals: null, tab: 'grades' };
  root.innerHTML = `
    <div class="login"><div class="card" style="max-width:640px;width:100%">
      <a class="login-back" href="#" id="sc-back" style="align-self:flex-start;margin:0;color:var(--pen);border-color:var(--pen)">← กลับหน้าเข้าสู่ระบบ</a>
      <h1>นักเรียนตรวจสอบผลการเรียน</h1>
      <p class="muted small" style="margin:0">กรอกข้อมูลของตัวเองให้ตรงกับทะเบียนนักเรียน ไม่ต้องใส่คำนำหน้าชื่อ · ถ้าชื่อซ้ำกับเพื่อน ระบบจะให้กรอกช่องอื่นเพิ่ม</p>
      <form id="sc-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="row"><label class="field" style="flex:1">ชื่อ<input name="first" autocomplete="off"></label>
          <label class="field" style="flex:1">นามสกุล<input name="last" autocomplete="off"></label></div>
        <label class="field">เลขประจำตัวนักเรียน<input name="code" inputmode="numeric" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit" style="justify-content:center;padding-block:10px">ตรวจสอบ</button>
      </form>
      <div class="seg" id="sc-tabs" role="tablist" style="align-self:flex-start">
        <button type="button" role="tab" data-t="grades" class="on st-present">ผลการเรียน</button>
        <button type="button" role="tab" data-t="rem">0 ร มส</button>
      </div>
      <div id="sc-out" style="display:flex;flex-direction:column;gap:10px"><p class="muted small" style="margin:0">กรอกข้อมูลแล้วกด "ตรวจสอบ"</p></div>
    </div></div>`;
  const out = $('#sc-out', root);
  const ambiguous = (n) => `<div class="notice">พบนักเรียนที่ตรงกับที่กรอก ${n} คน — กรุณากรอกช่องอื่นเพิ่ม (เช่น นามสกุลหรือเลขประจำตัว) เพื่อระบุตัวให้ชัดเจน</div>`;

  async function run() {
    const f = state.vals; if (!f) return;
    if (!filled(f)) { out.innerHTML = '<div class="empty">กรอกอย่างน้อย 1 ช่อง</div>'; return; }
    if (state.tab === 'grades' && filled(f) < 2) { out.innerHTML = '<div class="notice">การดูผลการเรียนต้องกรอกอย่างน้อย 2 ช่อง (เช่น ชื่อ + นามสกุล หรือ เลขประจำตัว + ชื่อ) เพื่อความปลอดภัยของข้อมูล</div>'; return; }
    const tab = state.tab;
    out.innerHTML = '<div class="loading" role="status"><i class="bar"></i><span>กำลังตรวจสอบ…</span></div>';
    try {
      const args = { p_first: f.first, p_last: f.last, p_code: f.code };
      const rows = await db.rpc(tab === 'grades' ? 'student_grades' : 'remedial_lookup', args);
      if (tab !== state.tab) return;                                  // ผู้ใช้สลับแท็บระหว่างรอ
      if (rows[0]?.matches > 1) { out.innerHTML = ambiguous(rows[0].matches); return; }
      out.innerHTML = tab === 'grades' ? gradesHtml(rows) : (rows.length ? rows.map(remCard).join('')
        : '<div class="empty">ไม่พบรายการ — ยังไม่มีวิชาที่ครูเปิดรายการไว้ หรือที่กรอกไม่ตรงกับทะเบียน กรุณาตรวจสอบอีกครั้ง หรือสอบถามครูผู้สอน</div>');
    } catch (err) { out.innerHTML = ''; toast(err.message, 'err'); }
  }

  $('#sc-back', root).addEventListener('click', (e) => { e.preventDefault(); onBack(); });
  $('#sc-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    state.vals = Object.fromEntries(new FormData(e.target).entries());
    run();
  });
  $('#sc-tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    state.tab = b.dataset.t;
    root.querySelectorAll('#sc-tabs button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.classList.toggle('st-present', on); x.setAttribute('aria-selected', on); });
    run();
  });
}

// ---- แท็บ 0 ร มส ----
const remCard = (r) => `<div class="rem-card"><h3>${esc(r.subject_code)} ${esc(r.subject_name)}</h3>
  <dl><dt>ภาคเรียน</dt><dd>${esc(r.term)}/${esc(r.academic_year)} · ชั้น ${esc(r.level)}</dd>
    <dt>ผลเดิม</dt><dd><b>${esc(r.original_grade)}</b></dd>
    <dt>สาเหตุ</dt><dd>${esc(CAUSES[r.cause] ?? 'ครูยังไม่ได้ระบุ')}</dd>
    <dt>วิธีแก้</dt><dd>${esc(PLANS[r.plan] ?? 'ครูยังไม่ได้ระบุ')}</dd>
    <dt>กำหนดแก้ภายใน</dt><dd>${r.due_date ? esc(new Date(r.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })) : '–'}</dd>
    <dt>สถานะ</dt><dd>${esc(STATUS[r.status]?.label ?? '')}</dd>
    ${r.new_grade ? `<dt>ผลหลังแก้</dt><dd><b>${esc(r.new_grade)}</b></dd>` : ''}</dl></div>`;

// ---- แท็บผลการเรียน ----
// คำนวณด้วยสูตรเดียวกับ ปพ.5 ในแอป (computeStudent) จากคะแนนดิบที่ฟังก์ชันในฐานข้อมูลส่งมา
export function gradeOf(r) {
  const byId = new Map((r.scores || []).map((s) => [s.item_id, s]));
  return computeStudent(r.items || [], (id) => byId.get(id), {
    midRatio: r.midterm_ratio, finalRatio: r.final_ratio, rounding: r.rounding || 'floor',
    special: r.special || null, msWaived: !!r.ms_waived, below80: !!r.below80,
  });
}

const gradeChip = (g, res) => {
  if (res.incomplete) return '<span class="chip chip-warn">รอครูบันทึกคะแนนให้ครบ</span>';
  if (g === null || g === undefined) return '<span class="chip">ยังไม่มีเกรด</span>';
  const cls = typeof g === 'number' ? (g === 0 ? 'chip-bad' : 'chip-ok') : 'chip-warn';
  return `<span class="chip ${cls}" style="font-size:1rem;padding:2px 12px"><b>${esc(fmtGrade(g))}</b></span>`;
};

export function gradesHtml(rows) {
  if (!rows.length) return '<div class="empty">ไม่พบผลการเรียน — ที่กรอกไม่ตรงกับทะเบียน หรือโรงเรียนยังไม่เปิดให้ดูผลการเรียนของภาคเรียนนี้ กรุณาสอบถามครูประจำชั้น</div>';
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.academic_year}/${r.term}/${r.level}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ r, res: gradeOf(r) });
  }
  return [...groups.entries()].map(([, list]) => {
    const { r: head } = list[0];
    const done = list.every(({ res }) => !res.incomplete);
    const avg = done ? gpa(list.map(({ r, res }) => ({ grade: res.grade, weight: weightOf({ credits: r.credits, hours_per_year: r.hours_per_year }) }))) : null;
    return `<div class="rem-card"><h3>ภาคเรียนที่ ${esc(head.term)} ปีการศึกษา ${esc(head.academic_year)} · ชั้น ${esc(head.level)}</h3>
      <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>รายวิชา</th><th class="n">หน่วยกิต/ชม.</th><th class="n">คะแนนรวม</th><th class="c">ผลการเรียน</th><th class="hide-sm">หมายเหตุ</th></tr></thead><tbody>
        ${list.map(({ r, res }) => `<tr><td class="tc-ttl"><b>${esc(r.subject_code)}</b> ${esc(r.subject_name)}</td>
          <td class="n" data-l="หน่วยกิต/ชม.">${r.credits != null ? esc(Number(r.credits)) : r.hours_per_year ? `${esc(r.hours_per_year)} ชม.` : '–'}</td>
          <td class="n" data-l="คะแนนรวม">${res.incomplete || res.total === null || ['ร', 'มส'].includes(res.grade) ? '–' : esc(res.total)}</td>
          <td class="c" data-l="ผลการเรียน">${gradeChip(res.grade, res)}</td>
          <td class="small muted" data-l="หมายเหตุ">${esc([res.reason, ['ร', 'มส'].includes(res.grade) ? 'ดูการแก้ไขที่แท็บ "0 ร มส"' : '', r.att_pct != null ? `เวลาเรียน ${Number(r.att_pct)}%` : ''].filter(Boolean).join(' · '))}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small" style="margin:6px 0 0">ผลการเรียนเฉลี่ยภาคเรียนนี้: <b>${avg === null ? (done ? '–' : 'ยังคำนวณไม่ได้ (มีวิชาที่คะแนนยังไม่ครบ)') : avg.toFixed(2)}</b></p></div>`;
  }).join('') + '<p class="small muted" style="margin:0">ผลนี้เป็นข้อมูลเบื้องต้นจากระบบ ผลที่เป็นทางการคือ ปพ.6 ที่โรงเรียนออกให้</p>';
}
