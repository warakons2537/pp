// =====================================================================
//  พิมพ์ ปพ.5 ด้วยแบบพิมพ์ในตัว (ไม่ต้องอัปโหลดไฟล์ต้นฉบับ)
//  หน้าตาเหมือนชุด ปพ.5 ที่โรงเรียนพิมพ์ · แอปใส่ข้อมูลลงแบบพิมพ์ pp/forms.xlsx เอง
//  เฟส 1: ปก ปพ.5 รายชั้น · รายชื่อ · บิดามารดา · ผู้ปกครอง · เวลาเรียนรายเดือน · สรุปเวลาเรียน
//  เฟส 2: น้ำหนัก-ส่วนสูง · ผลประเมินภาวะโภชนาการ · อัตราความชุก · สรุปรายชื่อนักเรียนที่มีปัญหา
//  เฟส 3: ผลประเมินตัวชี้วัดและคะแนนรายวิชา (วิชาที่ 1–n)
// =====================================================================
import { esc, $, $$, toast, roomName, modal } from '../util.js?v=2569.11.1-16';
import { buildBookData, bookChecks } from '../pp-book.js?v=2569.11.1-16';
import { Forms, classModel, loadFormsBytes, pp5Set, SUBJECT_COMPACT_FROM } from '../pp-forms.js?v=2569.11.1-16';
import { Renderer } from '../xl-render.js?v=2569.11.1-16';
import { useThaiFont, setThaiFont, fontSelectHtml } from '../thai-fonts.js?v=2569.11.1-16';
import { ensureCss, printPages } from './pp-book-view.js?v=2569.11.1-16';

const ZOOM = { 0.32: 'เล็ก', 0.5: 'กลาง', 0.8: 'ใหญ่' };
const pref = { zoom: 0.32, off: new Set(), init: null };      // off = แผ่นที่ติ๊กออก (จำไว้ระหว่างเปลี่ยนห้อง/ภาค)
const fileName = (room, term) => `ปพ.5 ${roomName(room)} ภาค${term.term}-${term.academic_year}`.replace(/[^0-9A-Za-zก-๙ ._()-]+/g, '-');

export async function pp5FormsView(paper, ctx, room) {
  paper.innerHTML = '<p class="muted">กำลังเตรียมแบบพิมพ์ ปพ.5…</p>';
  const term = ctx.term.term;
  let sheets = []; const groups = []; let data;
  try {
    await useThaiFont();
    data = await buildBookData(ctx, room);
    const m = classModel(data);
    const F = await Forms.open(await loadFormsBytes());
    sheets = pp5Set(term, data.subjects.length);
    const R = new Renderer(F.wb, F.eng, { dpi: 120 });
    const RS = new Renderer(F.wb, F.eng, { dpi: 100 });      // แผ่นรายวิชา: ความกว้างคอลัมน์คิดแบบจอ 100% (ตรงกับใบที่โรงเรียนพิมพ์)
    for (const n of sheets) {
      if (!F.fill(n, m)) { groups.push({ n, pages: [], err: 'ยังไม่มีแบบพิมพ์' }); continue; }
      try {
        const sn = /^วิชาที่ (\d+)$/.exec(n);
        // วิชาที่ 1–10 พิมพ์ตามตัวแบ่งหน้าเดิม 5 หน้า (ขยาย ~104% ตามใบตัวอย่าง) · วิชาที่ 11+ แบบย่อ 1 หน้า
        const pages = sn ? RS.renderSheet(n, +sn[1] < SUBJECT_COMPACT_FROM ? { adj: { scale: 104 } } : {}) : R.renderSheet(n);
        groups.push({ n, pages });
      } catch (err) { groups.push({ n, pages: [], err: err.message }); }
    }
  } catch (err) { console.error(err); paper.innerHTML = `<div class="empty">เตรียมแบบพิมพ์ไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); return; }

  // เปิดห้อง/ภาคนี้ครั้งแรก: ติ๊กออกแผ่นโภชนาการของครั้งที่ยังไม่ได้ชั่งน้ำหนัก-วัดส่วนสูง (ติ๊กกลับเองได้)
  const emptyRound = new Set();
  [0, 1, 2, 3].forEach((k) => { if (!data.rounds?.[k]) for (const n of [`โภชนาการ ${k + 1}`, `ความชุก ${k + 1}`, `สรุปโภชนาการ ${k + 1}`]) emptyRound.add(n); });
  const initKey = `${room.id}|${ctx.term.id}`;
  if (pref.init !== initKey) { pref.init = initKey; pref.off = new Set(emptyRound); }
  ensureCss();
  const on = () => groups.filter((g) => !pref.off.has(g.n));
  const issuesNow = () => bookChecks(data, on().map((g) => g.n), sheets.filter((n) => !emptyRound.has(n)), term);
  const warnHtml = (issues) => (issues.length
    ? `<div class="small" style="margin:6px 0;padding:8px 10px;border:1px solid var(--amber,#b7791f);border-radius:8px"><b>⚠ ตรวจก่อนพิมพ์ — พบ ${issues.length} ข้อ</b><ul style="margin:4px 0 0;padding-left:20px">${issues.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul></div>`
    : '<p class="small" style="margin:4px 0">✓ ตรวจแล้ว: ไม่พบหน้าที่ขาดหรือข้อมูลที่ยังไม่ได้ลง</p>');

  const draw = () => {
    const z = pref.zoom; const list = on();
    const total = list.reduce((s, g) => s + g.pages.length, 0);
    paper.innerHTML = `
      <div class="row no-print" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <h3 style="margin:0">ปพ.5 — ห้อง ${esc(roomName(room))} ภาคเรียนที่ ${term}/${ctx.term.academic_year} <span class="small muted">· พิมพ์ ${total} หน้า จาก ${list.length} แผ่น</span></h3>
        <div class="row" style="flex-wrap:wrap;align-items:flex-end">${fontSelectHtml('p5-font')}
          <label class="field">ขนาด<select id="p5-zoom">${Object.entries(ZOOM).map(([v, l]) => `<option value="${v}" ${+v === z ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn btn-primary" id="p5-print" ${total ? '' : 'disabled'}>พิมพ์ / บันทึกเป็น PDF (${total} หน้า)</button></div>
      </div>
      <div class="no-print"><p class="small muted" style="margin:0">หน้าตาตามชุด ปพ.5 ที่โรงเรียนพิมพ์ (เฟส 1–3: ปก ทะเบียน เวลาเรียน น้ำหนัก-ส่วนสูง โภชนาการ ผลรายวิชา) · ติ๊กออกเพื่อไม่พิมพ์แผ่นนั้น · กระดาษ A4</p>
        <div class="row" style="flex-wrap:wrap;gap:4px 14px;margin:4px 0">${groups.map((g) => `<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-n="${esc(g.n)}" ${pref.off.has(g.n) ? '' : 'checked'}>${esc(g.n)}</label>`).join('')}</div>
        <div>${warnHtml(issuesNow())}</div></div>
      <div class="pv-grid" style="justify-content:flex-start">${list.map((g) => g.pages.map((p, i) => `
        <div class="pv-card"><span class="pv-cap">${esc(g.n)}${g.pages.length > 1 ? ` · ${i + 1}/${g.pages.length}` : ''}${g.err ? ` · ${esc(g.err)}` : ''}</span>
          <span class="pv-box" style="width:${Math.round(p.w * z * 4 / 3)}px;height:${Math.round(p.h * z * 4 / 3)}px"><span class="pv-inner" style="transform:scale(${z})">${p.html}</span></span></div>`).join('')).join('')}</div>`;
    $$('input[data-n]', paper).forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) pref.off.delete(cb.dataset.n); else pref.off.add(cb.dataset.n); draw(); }));
    $('#p5-zoom', paper).addEventListener('change', (e) => { pref.zoom = +e.target.value; draw(); });
    $('#p5-font', paper).addEventListener('change', (e) => { setThaiFont(e.target.value); toast('เปลี่ยนฟอนต์แล้ว กำลังจัดหน้าใหม่'); pp5FormsView(paper, ctx, room); });
    $('#p5-print', paper).addEventListener('click', async (e) => {
      const issues = issuesNow();
      if (issues.length && (await modal('ตรวจก่อนพิมพ์', `<p style="margin:0">พบ ${issues.length} ข้อที่ควรตรวจก่อนพิมพ์:</p><ul class="small" style="margin:6px 0 0;padding-left:20px;max-height:50vh;overflow:auto">${issues.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`, { okText: 'พิมพ์ต่อ', cancelText: 'กลับไปตรวจ' })) === null) return;
      const btn = e.currentTarget; btn.disabled = true;
      const tab = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? window.open('', '_blank') : null;   // มือถือ: เปิดแท็บใหม่ในจังหวะกดปุ่ม
      try { await printPages(on().flatMap((g) => g.pages), fileName(room, ctx.term), tab); }
      catch (err) { toast(`พิมพ์ไม่สำเร็จ: ${err.message}`, 'err'); } finally { btn.disabled = false; }
    });
  };
  draw();
}
