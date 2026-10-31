// =====================================================================
//  พิมพ์ ปพ.6 รายบุคคล ด้วยแบบพิมพ์ในตัว (หน้าตาเหมือนไฟล์ ปพ.5-6 เดิมของโรงเรียน)
// =====================================================================
import { esc, $, toast, roomName } from '../util.js?v=2569.10.31-5';
import { buildBookData } from '../pp-book.js?v=2569.10.31-5';
import { Forms, classModel, loadFormsBytes } from '../pp-forms.js?v=2569.10.31-5';
import { Renderer } from '../xl-render.js?v=2569.10.31-5';
import { useThaiFont, setThaiFont, fontSelectHtml } from '../thai-fonts.js?v=2569.10.31-5';
import { ensureCss, printPages } from './pp-book-view.js?v=2569.10.31-5';

const ZOOM = { 0.5: 'เล็ก', 0.75: 'กลาง', 1: 'เต็ม' };
let zoom = 0.75;

/**
 * @param paper  กล่องแสดงผล
 * @param ids    รายการ student id ที่จะพิมพ์ (ตามลำดับเลขที่)
 */
export async function pp6FormsView(paper, ctx, room, ids, { onBack } = {}) {
  paper.innerHTML = '<p class="muted">กำลังเตรียมแบบพิมพ์ ปพ.6…</p>';
  let pages = []; let data;
  try {
    await useThaiFont();
    data = await buildBookData(ctx, room);
    const m = classModel(data);
    const F = await Forms.open(await loadFormsBytes());
    const R = new Renderer(F.wb, F.eng, { dpi: 120 });
    const idx = ids.map((id) => data.students.findIndex((st) => st.s.id === id)).filter((i) => i >= 0);
    for (const i of idx) {
      F.fill('ปพ.6', m, i);
      for (const p of R.renderSheet('ปพ.6')) pages.push({ ...p, student: m.students[i].no });
    }
  } catch (err) { console.error(err); paper.innerHTML = `<div class="empty">เตรียมแบบพิมพ์ไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); return; }

  // ข้อมูลที่ยังขาด → บอกว่าไปกรอกที่ไหน
  const tips = [];
  if (!ctx.term.approve_date) tips.push('ยังไม่ได้กำหนด <b>วันที่อนุมัติผลการเรียน</b> (ตั้งค่าระบบ → ภาคเรียน → แก้ไข) ช่องวันที่ใต้ลายเซ็นจะว่าง');
  const s = ctx.settings;
  const miss = [['director_name', 'ชื่อผู้อำนวยการ'], ['academic_head_name', 'หัวหน้างานวิชาการ']].filter(([k]) => !s[k]).map(([, l]) => l);
  if (miss.length) tips.push(`ยังไม่ได้กรอก ${miss.join(' และ ')} (ตั้งค่าระบบ → โรงเรียน)`);
  const noCode = data.students.filter((st) => !st.s.student_code).length;
  if (noCode) tips.push(`นักเรียน ${noCode} คนยังไม่มี <b>เลขประจำตัวนักเรียน</b> (เมนูนักเรียน → แก้ไข)`);
  const noClub = data.students.filter((st) => st.acts[2] !== null && !st.club).length;
  if (noClub) tips.push(`นักเรียน ${noClub} คนยังไม่ได้กรอก <b>ชื่อชุมนุม</b> (เมนูคุณลักษณะ/กิจกรรม → กิจกรรมพัฒนาผู้เรียน)`);

  ensureCss();
  const draw = () => {
    paper.innerHTML = `
      <div class="row no-print" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div class="row" style="flex-wrap:wrap;align-items:flex-end">
          ${fontSelectHtml('f6-font')}
          <label class="field">ขนาด<select id="f6-zoom">${Object.entries(ZOOM).map(([v, l]) => `<option value="${v}" ${+v === zoom ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="row">${onBack ? '<button class="btn" id="f6-back">กลับไปรายชื่อ</button>' : ''}
          <button class="btn btn-primary" id="f6-print" ${pages.length ? '' : 'disabled'}>พิมพ์ / บันทึกเป็น PDF (${pages.length} หน้า)</button></div>
      </div>
      ${tips.length ? `<div class="card no-print" style="margin:0 0 8px;padding:8px 12px"><div class="small">${tips.map((t) => `• ${t}`).join('<br>')}</div></div>` : ''}
      ${pages.length ? `<div class="pv-grid" style="justify-content:center">${pages.map((p) => `
        <div class="pv-card"><span class="pv-cap">เลขที่ ${p.student}</span>
          <span class="pv-box" style="width:${Math.round(p.w * zoom * 4 / 3)}px;height:${Math.round(p.h * zoom * 4 / 3)}px"><span class="pv-inner" style="transform:scale(${zoom})">${p.html}</span></span></div>`).join('')}</div>`
        : '<div class="empty">ไม่มีนักเรียนที่พิมพ์ได้ในช่วงที่เลือก</div>'}`;
    $('#f6-zoom', paper).addEventListener('change', (e) => { zoom = +e.target.value; draw(); });
    $('#f6-font', paper).addEventListener('change', (e) => { setThaiFont(e.target.value); pp6FormsView(paper, ctx, room, ids, { onBack }); });
    $('#f6-back', paper)?.addEventListener('click', onBack);
    $('#f6-print', paper)?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const tab = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? window.open('', '_blank') : null;
      try { await printPages(pages, `ปพ.6 ${roomName(room)} ภาค${ctx.term.term}-${ctx.term.academic_year}`.replace(/[\\/:*?"<>|]+/g, '-'), tab); }
      catch (err) { toast(`พิมพ์ไม่สำเร็จ: ${err.message}`, 'err'); } finally { btn.disabled = false; }
    });
  };
  draw();
}
