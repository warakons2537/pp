// หน้านักเรียนตรวจผล 0 ร มส ของตัวเอง (ไม่ต้องมีบัญชี) — กรอกช่องใดช่องหนึ่งก็ได้ (ชื่อ / นามสกุล / เลขประจำตัว) ให้ตรงทะเบียน
// ถ้าที่กรอกตรงกับนักเรียนหลายคน ระบบจะไม่แสดงข้อมูลใครเลย ให้กรอกช่องอื่นเพิ่ม
import { esc, $, toast } from '../util.js?v=2569.10.31-11';
import { CAUSES, PLANS, STATUS } from '../remedial.js?v=2569.10.31-11';

export function renderStudentCheck(root, db, onBack) {
  root.innerHTML = `
    <div class="login"><div class="card" style="max-width:560px;width:100%">
      <a class="login-back" href="#" id="sc-back" style="align-self:flex-start;margin:0;color:var(--pen);border-color:var(--pen)">← กลับหน้าเข้าสู่ระบบ</a>
      <h1>นักเรียน: ตรวจสอบผล 0 ร มส</h1>
      <p class="muted small" style="margin:0">สำหรับนักเรียนมัธยมศึกษา กรอกช่องใดช่องหนึ่งก็ได้ (ชื่อ นามสกุล หรือเลขประจำตัว) ให้ตรงกับทะเบียนนักเรียน ไม่ต้องใส่คำนำหน้าชื่อ · ถ้าชื่อซ้ำกับเพื่อน ระบบจะให้กรอกช่องอื่นเพิ่ม</p>
      <form id="sc-form" style="display:flex;flex-direction:column;gap:12px">
        <div class="row"><label class="field" style="flex:1">ชื่อ<input name="first" autocomplete="off"></label>
          <label class="field" style="flex:1">นามสกุล<input name="last" autocomplete="off"></label></div>
        <label class="field">เลขประจำตัวนักเรียน<input name="code" inputmode="numeric" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit" style="justify-content:center;padding-block:10px">ตรวจสอบ</button>
      </form>
      <div id="sc-out" style="display:flex;flex-direction:column;gap:10px"></div>
    </div></div>`;
  $('#sc-back', root).addEventListener('click', (e) => { e.preventDefault(); onBack(); });
  $('#sc-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const out = $('#sc-out', root);
    if (!['first', 'last', 'code'].some((k) => String(f[k] || '').trim())) { out.innerHTML = '<div class="empty">กรอกอย่างน้อย 1 ช่อง</div>'; return; }
    out.innerHTML = '<div class="loading" role="status"><i class="bar"></i><span>กำลังตรวจสอบ…</span></div>';
    try {
      const rows = await db.rpc('remedial_lookup', { p_first: f.first, p_last: f.last, p_code: f.code });
      if (rows[0]?.matches > 1) { out.innerHTML = `<div class="notice">พบนักเรียนที่ตรงกับที่กรอก ${rows[0].matches} คน — กรุณากรอกช่องอื่นเพิ่ม (เช่น นามสกุลหรือเลขประจำตัว) เพื่อระบุตัวให้ชัดเจน</div>`; return; }
      out.innerHTML = rows.length ? rows.map(card).join('')
        : '<div class="empty">ไม่พบรายการ — ยังไม่มีวิชาที่ครูเปิดรายการไว้ หรือที่กรอกไม่ตรงกับทะเบียน กรุณาตรวจสอบอีกครั้ง หรือสอบถามครูผู้สอน</div>';
    } catch (err) { out.innerHTML = ''; toast(err.message, 'err'); }
  });
}

const card = (r) => `<div class="rem-card"><h3>${esc(r.subject_code)} ${esc(r.subject_name)}</h3>
  <dl><dt>ภาคเรียน</dt><dd>${esc(r.term)}/${esc(r.academic_year)} · ชั้น ${esc(r.level)}</dd>
    <dt>ผลเดิม</dt><dd><b>${esc(r.original_grade)}</b></dd>
    <dt>สาเหตุ</dt><dd>${esc(CAUSES[r.cause] ?? 'ครูยังไม่ได้ระบุ')}</dd>
    <dt>วิธีแก้</dt><dd>${esc(PLANS[r.plan] ?? 'ครูยังไม่ได้ระบุ')}</dd>
    <dt>กำหนดแก้ภายใน</dt><dd>${r.due_date ? esc(new Date(r.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })) : '–'}</dd>
    <dt>สถานะ</dt><dd>${esc(STATUS[r.status]?.label ?? '')}</dd>
    ${r.new_grade ? `<dt>ผลหลังแก้</dt><dd><b>${esc(r.new_grade)}</b></dd>` : ''}</dl></div>`;
