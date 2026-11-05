// =====================================================================
//  พิมพ์ ปพ.5 ด้วยแบบพิมพ์ในตัว (ไม่ต้องอัปโหลดไฟล์ต้นฉบับ)
//  หน้าตาเหมือนชุด ปพ.5 ที่โรงเรียนพิมพ์ · แอปใส่ข้อมูลลงแบบพิมพ์ pp/forms.xlsx เอง
//  เฟส 1: ปก ปพ.5 รายชั้น · รายชื่อ · บิดามารดา · ผู้ปกครอง · เวลาเรียนรายเดือน · สรุปเวลาเรียน
//  เฟส 2: น้ำหนัก-ส่วนสูง · ผลประเมินภาวะโภชนาการ · อัตราความชุก · สรุปรายชื่อนักเรียนที่มีปัญหา
//  เฟส 3: ผลประเมินตัวชี้วัดและคะแนนรายวิชา (วิชาที่ 1–n)
//  เฟส 4: คุณลักษณะ · สมรรถนะ · กิจกรรม · คะแนนรายชั้น · เกรดรายชั้น · สรุปเกรดร้อยละ
// =====================================================================
import { esc, $, $$, toast, roomName, modal } from '../util.js?v=2569.11.1-27';
import { buildBookData, bookChecks } from '../pp-book.js?v=2569.11.1-27';
import { Forms, classModel, loadFormsBytes, pp5Set, pp5Layout, pp5Overlays } from '../pp-forms.js?v=2569.11.1-27';
import { Renderer } from '../xl-render.js?v=2569.11.1-27';
import { useThaiFont, setThaiFont, fontSelectHtml } from '../thai-fonts.js?v=2569.11.1-27';
import { ensureCss, printPages } from './pp-book-view.js?v=2569.11.1-27';
import { adjOpt, adjText, adjustDialog } from '../page-adjust.js?v=2569.11.1-27';

// ค่าปรับหน้าที่ผู้ใช้ตั้งไว้ (จำในเบราว์เซอร์ ใช้กับทุกห้อง/ภาคเรียน) · ชื่อแผ่น → { mt, mb, ml, mr, font, row, col, scale, hCenter }
const ADJ_KEY = 'pp5-page-adjust';
const loadAdj = () => { try { return JSON.parse(localStorage.getItem(ADJ_KEY) || '{}') || {}; } catch { return {}; } };
const saveAdj = (a) => { try { localStorage.setItem(ADJ_KEY, JSON.stringify(a)); } catch { /* */ } };

const ZOOM = { 0.32: 'เล็ก', 0.5: 'กลาง', 0.8: 'ใหญ่' };
const pref = { zoom: 0.32, off: new Set(), init: null };      // off = แผ่นที่ติ๊กออก (จำไว้ระหว่างเปลี่ยนห้อง/ภาค)
// ทางลัดไปหน้าแก้ข้อมูลที่ขึ้นในใบ ปพ.5 (ข้อมูลทุกช่องในใบแก้ได้จากในระบบ)
const EDIT_LINKS = [['students', 'นักเรียน · บิดามารดา · ผู้ปกครอง · ที่อยู่'], ['setup', 'โรงเรียน · ห้อง · รายวิชา · ภาคเรียน'], ['scores', 'คะแนน · ตัวชี้วัด'], ['daily', 'เวลาเรียน'], ['health', 'น้ำหนัก-ส่วนสูง'], ['traits', 'คุณลักษณะ · กิจกรรม']];
const fileName = (room, term) => `ปพ.5 ${roomName(room)} ภาค${term.term}-${term.academic_year}`.replace(/[^0-9A-Za-zก-๙ ._()-]+/g, '-');

// ที่เลือกปีการศึกษา/ภาคเรียน/ห้อง (จำไว้ระหว่างเปลี่ยนหน้า) — ไม่เลือก = ภาคเรียนปัจจุบัน
const sel = { year: null, termId: null, roomId: null };
const levelOrder = (c) => ['อ', 'ป', 'ม'].indexOf(c.level[0]) * 100 + Number(c.level.split('.')[1]) * 10 + c.room;
// ห้องของปีการศึกษาใดก็ได้ (ctx.classrooms มีเฉพาะปีปัจจุบัน) · ครูเห็นเฉพาะห้องที่เป็นครูประจำชั้น
async function roomsOfYear(ctx, year) {
  let list = year === ctx.term.academic_year ? ctx.classrooms : await ctx.db.select('classrooms', { eq: { academic_year: year } });
  list = [...list].sort((a, b) => levelOrder(a) - levelOrder(b));
  if (!ctx.isAdmin) { const mine = new Set(ctx.classroomTeacherRows.filter((x) => x.teacher_id === ctx.me.id).map((x) => x.classroom_id)); list = list.filter((c) => mine.has(c.id)); }
  return list;
}

export async function pp5FormsView(host, ctx, room0) {
  // ---- เลือกปีการศึกษา / ภาคเรียน / ห้อง ----
  const years = [...new Set(ctx.terms.map((t) => t.academic_year))].sort((a, b) => b - a);
  if (!years.includes(sel.year)) { sel.year = ctx.term.academic_year; sel.termId = ctx.term.id; }
  const yTerms = ctx.terms.filter((t) => t.academic_year === sel.year).sort((a, b) => a.term - b.term);
  if (!yTerms.some((t) => t.id === sel.termId)) sel.termId = (yTerms.find((t) => t.id === ctx.term.id) || yTerms[0]).id;
  const termObj = yTerms.find((t) => t.id === sel.termId);
  const rooms = await roomsOfYear(ctx, sel.year);
  if (!rooms.some((r) => r.id === sel.roomId)) sel.roomId = (rooms.find((r) => r.id === room0?.id) || rooms[0])?.id ?? null;
  const room = rooms.find((r) => r.id === sel.roomId) || null;
  const isCurrent = termObj.id === ctx.term.id;
  host.innerHTML = `<div class="row no-print" id="p5-ctl" style="gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
      <label class="field">ปีการศึกษา<select id="p5-year">${years.map((y) => `<option value="${y}" ${y === sel.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label class="field">ภาคเรียน<select id="p5-term">${yTerms.map((t) => `<option value="${esc(t.id)}" ${t.id === sel.termId ? 'selected' : ''}>ภาคเรียนที่ ${t.term}${t.id === ctx.term.id ? ' (ปัจจุบัน)' : ''}</option>`).join('')}</select></label>
      <label class="field">ห้อง<select id="p5-room" ${rooms.length ? '' : 'disabled'}>${rooms.length ? rooms.map((r) => `<option value="${esc(r.id)}" ${r.id === sel.roomId ? 'selected' : ''}>ห้อง ${esc(roomName(r))}</option>`).join('') : '<option>— ไม่มีห้อง —</option>'}</select></label>
      ${isCurrent ? '' : `<span class="chip chip-info" title="ข้อมูลย้อนหลังอ่านจากฐานข้อมูลตามภาคเรียนที่เลือก">ดูภาคเรียนย้อนหลัง/ล่วงหน้า</span>`}
    </div><div id="p5-main"></div>`;
  $('#p5-year', host).addEventListener('change', (e) => { sel.year = Number(e.target.value); sel.termId = null; sel.roomId = null; pp5FormsView(host, ctx, room0); });
  $('#p5-term', host).addEventListener('change', (e) => { sel.termId = e.target.value; pp5FormsView(host, ctx, room0); });
  $('#p5-room', host).addEventListener('change', (e) => { sel.roomId = e.target.value; pp5FormsView(host, ctx, room0); });
  const paper = $('#p5-main', host);
  if (!room) { paper.innerHTML = `<div class="empty">ไม่มีห้องเรียนของปีการศึกษา ${sel.year} ${ctx.isAdmin ? '' : '(ที่คุณเป็นครูประจำชั้น) '}</div>`; return; }
  paper.innerHTML = '<p class="muted">กำลังเตรียมแบบพิมพ์ ปพ.5…</p>';
  const term = termObj.term;
  let sheets = []; const groups = []; let data; let F; let m;
  const renderers = new Map();      // ตามฐาน dpi ของแต่ละแผ่น (ดู pp5Layout)
  const adjAll = loadAdj();
  // วาดแผ่นเดียว: ค่าตั้งต้นของใบตัวอย่าง (pp5Layout) + ค่าที่ผู้ใช้ปรับ (ทับค่าตั้งต้น)
  const renderGroup = (n) => {
    if (!F.fill(n, m)) return { n, pages: [], err: 'ยังไม่มีแบบพิมพ์' };
    try {
      const { dpi, opt } = pp5Layout(n);
      if (!renderers.has(dpi)) renderers.set(dpi, new Renderer(F.wb, F.eng, { dpi }));
      const adj = { ...(opt.adj || {}), ...(adjOpt(adjAll[n]) || {}) };
      return { n, pages: renderers.get(dpi).renderSheet(n, { ...opt, adj: Object.keys(adj).length ? adj : undefined, overlays: pp5Overlays(n, m) }) };
    } catch (err) { return { n, pages: [], err: err.message }; }
  };
  try {
    await useThaiFont();
    data = await buildBookData(ctx, room, { term: termObj });
    m = classModel(data);
    F = await Forms.open(await loadFormsBytes());
    sheets = pp5Set(term, data.subjects.length);
    for (const n of sheets) groups.push(renderGroup(n));
  } catch (err) { console.error(err); paper.innerHTML = `<div class="empty">เตรียมแบบพิมพ์ไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); return; }

  // เปิดห้อง/ภาคนี้ครั้งแรก: ติ๊กออกแผ่นโภชนาการของครั้งที่ยังไม่ได้ชั่งน้ำหนัก-วัดส่วนสูง (ติ๊กกลับเองได้)
  const emptyRound = new Set();
  [0, 1, 2, 3].forEach((k) => { if (!data.rounds?.[k]) for (const n of [`โภชนาการ ${k + 1}`, `ความชุก ${k + 1}`, `สรุปโภชนาการ ${k + 1}`]) emptyRound.add(n); });
  const initKey = `${room.id}|${termObj.id}`;
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
        <h3 style="margin:0">ปพ.5 — ห้อง ${esc(roomName(room))} ภาคเรียนที่ ${term}/${termObj.academic_year} <span class="small muted">· พิมพ์ ${total} หน้า จาก ${list.length} แผ่น</span></h3>
        <div class="row" style="flex-wrap:wrap;align-items:flex-end">${fontSelectHtml('p5-font')}
          <label class="field">ขนาด<select id="p5-zoom">${Object.entries(ZOOM).map(([v, l]) => `<option value="${v}" ${+v === z ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn btn-primary" id="p5-print" ${total ? '' : 'disabled'}>พิมพ์ / บันทึกเป็น PDF (${total} หน้า)</button></div>
      </div>
      <div class="no-print"><p class="small muted" style="margin:0">ปุ่ม "ปรับหน้า…" ที่หน้าแรกของแต่ละแผ่น = ปรับขอบ ขนาดตัวอักษร ระยะบรรทัด ย่อ/ขยาย (จำไว้ในเครื่องนี้) · หน้าตาตามชุด ปพ.5 ที่โรงเรียนพิมพ์ (ปก ทะเบียน เวลาเรียน น้ำหนัก-ส่วนสูง โภชนาการ ผลรายวิชา คุณลักษณะ กิจกรรม สรุปคะแนน เกรด) · ติ๊กออกเพื่อไม่พิมพ์แผ่นนั้น · กระดาษ A4</p>
        <div class="row" style="flex-wrap:wrap;gap:4px 14px;margin:4px 0">${groups.map((g) => `<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-n="${esc(g.n)}" ${pref.off.has(g.n) ? '' : 'checked'}>${esc(g.n)}</label>`).join('')}</div>
        <div class="row small" style="flex-wrap:wrap;gap:4px 8px;margin:4px 0;align-items:center"><span class="muted">แก้ข้อมูลที่ใช้ในใบ:</span>
          ${EDIT_LINKS.filter(([v]) => ctx.menus?.has(v)).map(([v, l]) => `<button type="button" class="btn btn-sm" data-go="${v}">${l}</button>`).join('')}
          ${ctx.menus?.has('scores') ? data.subjects.filter((x) => x.courseId && ctx.courseById?.[x.courseId]).map((x) => `<button type="button" class="btn btn-sm" data-ind="${x.courseId}" title="บันทึกตัวชี้วัด ผ/มผ รายคน">ตัวชี้วัด ผ/มผ: ${esc(x.name)}</button>`).join('') : ''}</div>
        <div>${warnHtml(issuesNow())}</div></div>
      <div class="pv-grid" style="justify-content:flex-start">${list.map((g) => g.pages.map((p, i) => `
        <div class="pv-card"><span class="pv-cap">${esc(g.n)}${g.pages.length > 1 ? ` · ${i + 1}/${g.pages.length}` : ''}${g.err ? ` · ${esc(g.err)}` : ''}${i === 0 ? ` <button type="button" class="btn btn-sm ${adjAll[g.n] ? 'btn-primary' : ''}" data-adj-n="${esc(g.n)}" title="${esc(adjText(adjAll[g.n]) || 'ขอบกระดาษ ขนาดตัวอักษร ระยะบรรทัด ขนาดย่อ/ขยาย')}">ปรับหน้า…</button>` : ''}</span>
          <span class="pv-box" style="width:${Math.round(p.w * z * 4 / 3)}px;height:${Math.round(p.h * z * 4 / 3)}px"><span class="pv-inner" style="transform:scale(${z})">${p.html}</span></span></div>`).join('')).join('')}</div>`;
    $$('input[data-n]', paper).forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) pref.off.delete(cb.dataset.n); else pref.off.add(cb.dataset.n); draw(); }));
    $$('[data-ind]', paper).forEach((b) => b.addEventListener('click', () => ctx.go('scores', { course: b.dataset.ind, tab: 'indicators' })));
    $$('[data-go]', paper).forEach((b) => b.addEventListener('click', () => ctx.go(b.dataset.go)));
    $$('[data-adj-n]', paper).forEach((b) => b.addEventListener('click', async () => {
      const n = b.dataset.adjN; const { opt } = pp5Layout(n);
      const res = await adjustDialog(n, adjAll[n], { margins: F.wb.sheet(n)?.page.margins, scale: opt.adj?.scale ?? null });
      if (!res) return;
      const targets = res.all ? on().map((g) => g.n) : [n];
      for (const t of targets) { if (res.adj) adjAll[t] = { ...res.adj }; else delete adjAll[t]; const i = groups.findIndex((g) => g.n === t); if (i >= 0) groups[i] = renderGroup(t); }
      saveAdj(adjAll); draw();
    }));
    $('#p5-zoom', paper).addEventListener('change', (e) => { pref.zoom = +e.target.value; draw(); });
    $('#p5-font', paper).addEventListener('change', (e) => { setThaiFont(e.target.value); toast('เปลี่ยนฟอนต์แล้ว กำลังจัดหน้าใหม่'); pp5FormsView(host, ctx, room0); });
    $('#p5-print', paper).addEventListener('click', async (e) => {
      const issues = issuesNow();
      if (issues.length && (await modal('ตรวจก่อนพิมพ์', `<p style="margin:0">พบ ${issues.length} ข้อที่ควรตรวจก่อนพิมพ์:</p><ul class="small" style="margin:6px 0 0;padding-left:20px;max-height:50vh;overflow:auto">${issues.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`, { okText: 'พิมพ์ต่อ', cancelText: 'กลับไปตรวจ' })) === null) return;
      const btn = e.currentTarget; btn.disabled = true;
      const tab = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? window.open('', '_blank') : null;   // มือถือ: เปิดแท็บใหม่ในจังหวะกดปุ่ม
      try { await printPages(on().flatMap((g) => g.pages), fileName(room, termObj), tab); }
      catch (err) { toast(`พิมพ์ไม่สำเร็จ: ${err.message}`, 'err'); } finally { btn.disabled = false; }
    });
  };
  draw();
}
