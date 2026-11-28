// =====================================================================
//  พิมพ์ ปพ.5 ด้วยแบบพิมพ์ในตัว (ไม่ต้องอัปโหลดไฟล์ต้นฉบับ)
//  หน้าตาเหมือนชุด ปพ.5 ที่โรงเรียนพิมพ์ · แอปใส่ข้อมูลลงแบบพิมพ์ pp/forms.xlsx เอง
//  เฟส 1: ปก ปพ.5 รายชั้น · รายชื่อ · บิดามารดา · ผู้ปกครอง · เวลาเรียนรายเดือน · สรุปเวลาเรียน
//  เฟส 2: น้ำหนัก-ส่วนสูง · ผลประเมินภาวะโภชนาการ · อัตราความชุก · สรุปรายชื่อนักเรียนที่มีปัญหา
//  เฟส 3: ผลประเมินตัวชี้วัดและคะแนนรายวิชา (วิชาที่ 1–n)
//  เฟส 4: คุณลักษณะ · สมรรถนะ · กิจกรรม · คะแนนรายชั้น · เกรดรายชั้น · สรุปเกรดร้อยละ
//
//  หน้าจอ 3 คอลัมน์: ซ้าย = เลือกเอกสาร/ห้อง/ภาค/แผ่น + ผลตรวจ · กลาง = ตัวอย่าง A4 ทีละหน้า
//  ขวา = สรุป · ตั้งค่าชุดเดียว [ทั้งชุด | แผ่นนี้] (หน้ากระดาษ · ตัวอักษร · พิมพ์ · ขั้นสูง) · พิมพ์
//  ปุ่ม "แก้บนหน้ากระดาษ" (กลาง) = ลากขอบ/คอลัมน์/แถว/ย้าย/เลือกเซลล์ของแผ่นที่ดูอยู่ · จัดรูปแบบเซลล์ขึ้นในแผงขวา
// =====================================================================
import { esc, $, $$, toast, roomName, modal } from '../util.js?v=2569.11.1-46';
import { buildBookData, bookChecks } from '../pp-book.js?v=2569.11.1-46';
import { Forms, classModel, loadFormsBytes, pp5Set, pp5Layout, pp5Overlays, ATT_MONTHS, indicatorContinuations, continuationModel, IND_PER_SHEET } from '../pp-forms.js?v=2569.11.1-46';
import { Renderer } from '../xl-render.js?v=2569.11.1-46';
import { useThaiFont, setThaiFont, fontSelectHtml } from '../thai-fonts.js?v=2569.11.1-46';
import { ensureCss, printWithStatus } from './pp-book-view.js?v=2569.11.1-46';
import { adjustDialog, pickSheetsDialog, AUTO_ADJ, MARGIN_PRESETS, SET_LIMITS, BASE_PT, mergeAdj, withPageNo } from '../page-adjust.js?v=2569.11.1-46';
import { mountPageEditor } from '../page-editor.js?v=2569.11.1-46';

// ค่าปรับหน้าที่ผู้ใช้ตั้งไว้ (จำในเบราว์เซอร์ ใช้กับทุกห้อง/ภาคเรียน) · ชื่อแผ่น → { mt, mb, ml, mr, font, row, col, scale, hCenter }
const ADJ_KEY = 'pp5-page-adjust';
const loadAdj = () => { try { return JSON.parse(localStorage.getItem(ADJ_KEY) || '{}') || {}; } catch { return {}; } };
// จัดหน้าอัตโนมัติทั้งชุด: ทุกหน้าของแต่ละแผ่นขนาดเท่ากัน จัดกึ่งกลาง ขอบเท่ากัน (10 มม.) — ค่า "ปรับหน้า…" รายแผ่นทับได้
const AUTO_KEY = 'pp5-auto-layout';
const loadAuto = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } };
const saveAuto = (v) => { try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* */ } };
const ORI_KEY = 'pp5-orient';      // แผ่น → 'portrait' | 'landscape' (ไม่มี = ตามแบบพิมพ์)
const loadOri = () => { try { return JSON.parse(localStorage.getItem(ORI_KEY) || '{}') || {}; } catch { return {}; } };
const saveOri = (o) => { try { localStorage.setItem(ORI_KEY, JSON.stringify(o)); } catch { /* */ } };
const saveAdj = (a) => { try { localStorage.setItem(ADJ_KEY, JSON.stringify(a)); } catch { /* */ } };
// ค่าพิมพ์ทั้งชุด (แผงขวา): { preset, mt, mb, ml, mr (ซม.), pt, scale, fit, row, col, pageNum, duplex } — จำไว้ · ไม่จำหน้าที่เลือกพิมพ์
const SET_KEY = 'pp5-print-settings';
const loadSet = () => { try { const o = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const saveSet = (o) => { try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch { /* */ } };

// zoom = ซูมบนจอ (% · 100 = ขนาดจริง) · off = แผ่นที่ติ๊กออก · offPg = หน้าที่ติ๊กออก (จำไว้ระหว่างเปลี่ยนหน้า ไม่จำข้ามการเปิดแอป)
// scope = ช่องตั้งค่าในแผงขวาแก้ 'set' (ทั้งชุด) หรือ 'one' (แผ่นที่ดูอยู่) · edit = โหมดแก้บนหน้ากระดาษ
const pref = { zoom: 80, scope: 'set', edit: false, guide: false, adv: false, pos: null, off: new Set(), manual: new Set(), offPg: new Set(), manualPg: new Set(), init: null };
// ทางลัดไปหน้าแก้ข้อมูลที่ขึ้นในใบ ปพ.5 (ข้อมูลทุกช่องในใบแก้ได้จากในระบบ)
const EDIT_LINKS = [['students', 'นักเรียน · บิดามารดา · ผู้ปกครอง · ที่อยู่'], ['setup', 'โรงเรียน · ห้อง · รายวิชา · ภาคเรียน'], ['scores', 'คะแนน · ตัวชี้วัด'], ['daily', 'เวลาเรียน'], ['health', 'น้ำหนัก-ส่วนสูง'], ['traits', 'คุณลักษณะ · กิจกรรม']];
const fileName = (room, term) => `ปพ.5 ${roomName(room)} ภาค${term.term}-${term.academic_year}`.replace(/[^0-9A-Za-zก-๙ ._()-]+/g, '-');
const clampN = (v, [a, b]) => Math.min(b, Math.max(a, v));
const pxOf = (pt, z) => Math.round(pt * z * 4 / 3);
const r2 = (x) => Math.round(x * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Number(v));

// ที่เลือกปีการศึกษา/ภาคเรียน/ห้อง (จำไว้ระหว่างเปลี่ยนหน้า) — ไม่เลือก = ภาคเรียนปัจจุบัน
const sel = { year: null, termId: null, roomId: null };
const ATT_NAMES = new Set(ATT_MONTHS.map((x) => x[0]));
const levelOrder = (c) => ['อ', 'ป', 'ม'].indexOf(c.level[0]) * 100 + Number(c.level.split('.')[1]) * 10 + c.room;
// ห้องของปีการศึกษาใดก็ได้ (ctx.classrooms มีเฉพาะปีปัจจุบัน) · ครูเห็นเฉพาะห้องที่เป็นครูประจำชั้น
async function roomsOfYear(ctx, year) {
  let list = year === ctx.term.academic_year ? ctx.classrooms : await ctx.db.select('classrooms', { eq: { academic_year: year } });
  list = [...list].sort((a, b) => levelOrder(a) - levelOrder(b));
  if (!ctx.isAdmin) { const mine = new Set(ctx.classroomTeacherRows.filter((x) => x.teacher_id === ctx.me.id).map((x) => x.classroom_id)); list = list.filter((c) => mine.has(c.id)); }
  return list;
}

const CSS = `
.main-inner:has(.p5x){max-width:none}
.p5x{display:grid;grid-template-columns:232px minmax(0,1fr) 290px;gap:12px;height:calc(100dvh - 150px);min-height:400px}
.p5x .field input,.p5x .field select{min-height:34px;padding-block:4px}
.p5x-col{min-height:0;display:flex;flex-direction:column;background:var(--sheet);border:1px solid var(--rule);border-radius:var(--r-lg)}
.p5x-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px;display:flex;flex-direction:column;gap:14px}
.p5x-scroll[hidden]{display:none}
.p5x-warn{font-size:.78rem;border:1px solid var(--amber);background:var(--amber-wash);color:var(--on-amber-wash);border-radius:8px;padding:6px 8px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.p5x h4{margin:0 0 6px;font-size:.8rem;color:var(--ink-soft);font-weight:600;letter-spacing:.02em}
.p5x .field{margin:0 0 6px}
.p5x .field select,.p5x .field input{width:100%}
.p5x-docs{display:flex;flex-direction:column;gap:2px}
.p5x-docs button{all:unset;box-sizing:border-box;width:100%;padding:6px 10px;border-radius:8px;font-size:.85rem;cursor:pointer;color:var(--ink)}
.p5x-docs button:hover{background:color-mix(in srgb,var(--pen) 8%,transparent)}
.p5x-docs button[aria-current=true]{background:var(--chosen);color:var(--on-chosen);font-weight:600}
.p5x-docs button:focus-visible,.p5x-sheets button:focus-visible{outline:2px solid var(--pen);outline-offset:1px}
.p5x-sheets{display:flex;flex-direction:column;gap:1px;font-size:.82rem}
.p5x-sheets .it{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:6px}
.p5x-sheets .it.cur{background:var(--chosen)}
.p5x-sheets .it button{all:unset;flex:1;cursor:pointer;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p5x-sheets .it .n{color:var(--ink-soft);font-size:.75rem}
.p5x-sheets .it.off button{color:var(--ink-soft);text-decoration:line-through}
.p5x-check{border-top:1px solid var(--rule);padding:10px 12px;max-height:32%;overflow:auto;font-size:.8rem;flex:none}
.p5x-check summary{cursor:pointer}
.p5x-check ul{margin:4px 0 0;padding-left:18px}
.p5x-check .ok{color:var(--pen)}
.p5x-check .warn b{color:var(--amber)}
.p5x-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border-bottom:1px solid var(--rule);font-size:.85rem}
.p5x-bar input[type=number]{width:58px;padding:3px 6px;min-height:30px}
.p5x-bar .sp{flex:1}
.p5x-bar[hidden]{display:none}
.p5x-bar .grp{display:inline-flex;align-items:center;gap:4px}
.p5x-bar .chk{display:inline-flex;align-items:center;gap:4px;color:var(--ink);font-size:.85rem}
.p5x-bar .btn-sm{min-width:30px;min-height:30px;padding:2px 8px}
.p5x-bar input[type=number]{width:52px}
.p5x-stage{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;background:var(--surface-highest);padding:16px;display:flex;justify-content:safe center;align-items:flex-start}
.p5x-stage .pv-box{flex:none}
.p5x-stage .pv-box.off{opacity:.4}
.p5x-offpg .pe-paper{opacity:.4}
.p5x-scope{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--rule-strong);border-radius:10px;overflow:hidden}
.p5x-scope button{border:0;background:transparent;padding:7px 6px;font:inherit;font-size:.85rem;color:var(--ink);cursor:pointer;min-height:34px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p5x-scope button+button{border-left:1px solid var(--rule-strong)}
.p5x-scope button[aria-pressed=true]{background:var(--pen);color:#fff;font-weight:600}
.p5x h4{display:flex;align-items:center;flex-wrap:wrap}
.p5x h4 .own{font-weight:400;color:var(--pen);margin-left:6px}
.p5x h4 .own button{all:unset;cursor:pointer;text-decoration:underline;margin-left:6px;font-size:.75rem}
.p5x-edsec{border:1px solid var(--pen);border-radius:10px;padding:8px}
#p5-edit[aria-pressed=true]{background:var(--pen);color:#fff;border-color:var(--pen)}
.p5x-sec{border-top:2px solid var(--rule);padding-top:12px}
.p5x-guide{position:absolute;border:1px dashed #2563eb;pointer-events:none;box-sizing:border-box}
.p5x-sum{font-size:.85rem;display:flex;flex-direction:column;gap:2px}
.p5x-sum b.big{font-size:1.5rem;line-height:1.1;color:var(--ink)}
.p5x-seg{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--rule-strong);border-radius:8px;overflow:hidden;margin:0 0 8px}
.p5x-seg button{border:0;background:transparent;padding:6px 4px;font:inherit;font-size:.8rem;color:var(--ink);cursor:pointer;min-height:32px}
.p5x-seg button+button{border-left:1px solid var(--rule-strong)}
.p5x-seg button[aria-pressed=true]{background:var(--chosen);color:var(--on-chosen);font-weight:600}
.p5x-4{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 8px}
.p5x-4 .field{margin:0}
.p5x-row{display:flex;gap:6px;align-items:flex-end}
.p5x-row .field{flex:1;margin:0}
.p5x .chkl{display:flex;gap:6px;align-items:flex-start;font-size:.85rem;color:var(--ink);margin:0 0 4px}
.p5x .hint{font-size:.75rem;color:var(--ink-soft);margin:2px 0 0}
.p5x details>summary{cursor:pointer;font-size:.85rem;font-weight:600;padding:4px 0}
.p5x details .sub{border-top:1px solid var(--rule);padding-top:8px;margin-top:8px}
.p5x-links{display:flex;flex-wrap:wrap;gap:4px}
.p5x-foot{border-top:1px solid var(--rule);padding:10px 12px}
.p5x-foot .btn{width:100%;justify-content:center}
`;
function ensureP5Css() {
  if (document.getElementById('p5x-css')) return;
  const st = document.createElement('style'); st.id = 'p5x-css'; st.textContent = CSS; document.head.appendChild(st);
}

/**
 * @param host  กล่องแสดงผล
 * @param room0 ห้องที่เลือกไว้ในหน้าพิมพ์
 * @param nav   { docs: [[key, label]], cur, onDoc(key) } — รายการชุดเอกสารในแผงซ้าย (สลับไปเอกสารอื่นของหน้าพิมพ์ ปพ.)
 */
export async function pp5FormsView(host, ctx, room0, nav = null) {
  ensureCss(); ensureP5Css();
  const again = () => pp5FormsView(host, ctx, room0, nav);
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
  const S = loadSet();
  const docsHtml = nav ? `<section><h4 id="p5-docs-h">ชุดเอกสาร</h4><div class="p5x-docs" role="list" aria-labelledby="p5-docs-h">${nav.docs.map(([k, l]) => `<button type="button" role="listitem" data-doc-go="${esc(k)}" aria-current="${k === nav.cur}">${esc(l)}</button>`).join('')}</div></section>` : '';
  host.innerHTML = `<div class="p5x no-print">
    <aside class="p5x-col" aria-label="เลือกเอกสาร">
      <div class="p5x-scroll">
        ${docsHtml}
        <section><h4>ห้อง / ภาคเรียน</h4>
          <label class="field">ปีการศึกษา<select id="p5-year">${years.map((y) => `<option value="${y}" ${y === sel.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          <label class="field">ภาคเรียน<select id="p5-term">${yTerms.map((t) => `<option value="${esc(t.id)}" ${t.id === sel.termId ? 'selected' : ''}>ภาคเรียนที่ ${t.term}${t.id === ctx.term.id ? ' (ปัจจุบัน)' : ''}</option>`).join('')}</select></label>
          <label class="field">ห้อง<select id="p5-room" ${rooms.length ? '' : 'disabled'}>${rooms.length ? rooms.map((r) => `<option value="${esc(r.id)}" ${r.id === sel.roomId ? 'selected' : ''}>ห้อง ${esc(roomName(r))}</option>`).join('') : '<option>— ไม่มีห้อง —</option>'}</select></label>
          ${isCurrent ? '' : '<span class="chip chip-info" title="ข้อมูลย้อนหลังอ่านจากฐานข้อมูลตามภาคเรียนที่เลือก">ดูภาคเรียนย้อนหลัง/ล่วงหน้า</span>'}
        </section>
        <section id="p5-sheets-sec"></section>
      </div>
      <div class="p5x-check" id="p5-check" aria-live="polite"></div>
    </aside>
    <section class="p5x-col" aria-label="ตัวอย่างก่อนพิมพ์" id="p5-center"><p class="muted" style="padding:16px">กำลังเตรียมแบบพิมพ์ ปพ.5…</p></section>
    <aside class="p5x-col" aria-label="ตั้งค่าและพิมพ์" id="p5-right"></aside>
  </div>`;
  const grid = $('.p5x', host);
  // ให้ทั้งสามคอลัมน์พอดีความสูงจอ (ปุ่มพิมพ์อยู่ล่างสุดของแผงขวา ไม่ถูกตัด)
  // ความสูง = จอ − ตำแหน่งบนสุดของกริดในหน้า − ระยะเว้นล่างของแอป → หน้าเว็บไม่ยาวเกินจอ จึงไม่เลื่อนทั้งหน้า (แผงขวาไม่กระตุก)
  const fitH = () => {
    if (!grid.isConnected) { removeEventListener('resize', fitH); return; }
    const top = grid.getBoundingClientRect().top + scrollY; const main = grid.closest('.main');
    const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    grid.style.height = `${Math.max(400, Math.floor(innerHeight - top - pad - 8))}px`;
  };
  addEventListener('resize', fitH); requestAnimationFrame(fitH);
  $$('[data-doc-go]', host).forEach((b) => b.addEventListener('click', () => nav.onDoc(b.dataset.docGo)));
  $('#p5-year', host).addEventListener('change', (e) => { sel.year = Number(e.target.value); sel.termId = null; sel.roomId = null; again(); });
  $('#p5-term', host).addEventListener('change', (e) => { sel.termId = e.target.value; again(); });
  $('#p5-room', host).addEventListener('change', (e) => { sel.roomId = e.target.value; again(); });
  const center = $('#p5-center', host); const right = $('#p5-right', host); const check = $('#p5-check', host); const sheetsSec = $('#p5-sheets-sec', host);
  if (!room) { center.innerHTML = `<div class="empty">ไม่มีห้องเรียนของปีการศึกษา ${sel.year} ${ctx.isAdmin ? '' : '(ที่คุณเป็นครูประจำชั้น) '}</div>`; return; }
  const term = termObj.term;
  let sheets = []; const groups = []; let data; let F; let m;
  const renderers = new Map();      // ตามฐาน dpi ของแต่ละแผ่น (ดู pp5Layout)
  const adjAll = loadAdj(); let auto = loadAuto(); const oriAll = loadOri();
  // วาดแผ่นเดียว: ค่าตั้งต้นของใบตัวอย่าง (pp5Layout) < ค่าทั้งชุด (แผงขวา) < ค่าที่ปรับรายแผ่น
  const conts = new Map();
  const baseOf = (n) => conts.get(n)?.base || n;          // ชื่อแผ่น "วิชาที่ n · ตัวชี้วัด 37–72" → หน้าตัวชี้วัดต่อของวิชานั้น
  const renderGroup = (n, ovr, oriOvr) => {       // ovr = ค่าปรับที่ใช้ทดลอง (ตัวลากปรับ) · ไม่ระบุ = ค่าที่จำไว้
    const ct = conts.get(n); const base = ct ? ct.base : n; const mm = ct ? continuationModel(data, ct.n, ct.off) : m;
    if (!F.fill(base, mm)) return { n, pages: [], err: 'ยังไม่มีแบบพิมพ์' };
    try {
      const { dpi, opt } = pp5Layout(base, mm);
      if (!renderers.has(dpi)) renderers.set(dpi, new Renderer(F.wb, F.eng, { dpi }));
      const bopt = { ...(opt.adj || {}) }; if (auto) { delete bopt.scale; Object.assign(bopt, AUTO_ADJ); }       // อัตโนมัติ: ไม่ใช้ค่าย่อ/ขยายตั้งต้นของแผ่น
      const adj = mergeAdj(bopt, S, ovr !== undefined ? ovr : adjAll[n]);
      const pages = renderers.get(dpi).renderSheet(base, { ...opt, orientation: (oriOvr !== undefined ? oriOvr : oriAll[n]) || undefined, adj, overlays: pp5Overlays(base, mm) });
      return { n, pages: ct ? pages.slice(0, 2) : pages };      // หน้าตัวชี้วัดต่อ = 2 หน้าแรกของแผ่น (หน้าคะแนนไม่ต้องพิมพ์ซ้ำ)
    } catch (err) { return { n, pages: [], err: err.message }; }
  };
  try {
    await useThaiFont();
    data = await buildBookData(ctx, room, { term: termObj });
    m = classModel(data);
    F = await Forms.open(await loadFormsBytes());
    sheets = pp5Set(term, data.subjects.length);
    const contList = indicatorContinuations(data); contList.forEach((c) => conts.set(c.name, c));
    sheets = sheets.flatMap((n) => [n, ...contList.filter((c) => c.base === n).map((c) => c.name)]);   // หน้าตัวชี้วัดต่อวางต่อจากแผ่นวิชานั้น
    for (const n of sheets) groups.push(renderGroup(n));
  } catch (err) { console.error(err); center.innerHTML = `<div class="empty">เตรียมแบบพิมพ์ไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); return; }

  // เปิดห้อง/ภาคนี้ครั้งแรก: ติ๊กออกแผ่นโภชนาการของครั้งที่ยังไม่ได้ชั่งน้ำหนัก-วัดส่วนสูง (ติ๊กกลับเองได้)
  const emptyRound = new Set();
  [0, 1, 2, 3].forEach((k) => { if (!data.rounds?.[k]) for (const n of [`โภชนาการ ${k + 1}`, `ความชุก ${k + 1}`, `สรุปโภชนาการ ${k + 1}`]) emptyRound.add(n); });
  const initKey = `${room.id}|${termObj.id}`;
  if (pref.init !== initKey) { pref.init = initKey; pref.off = new Set(); pref.manual = new Set(); pref.offPg = new Set(); pref.manualPg = new Set(); pref.pos = null; }
  // แผ่นโภชนาการของครั้งที่ยังไม่ได้ชั่ง = ติ๊กออกให้ · ตรวจใหม่ทุกครั้งที่เปิดหน้านี้ (กรอกน้ำหนักเพิ่มแล้วกลับมา แผ่นจะติ๊กกลับเอง) · แผ่นที่ผู้ใช้ติ๊กเองแล้วไม่แตะต้อง
  for (const n of sheets) if (/^(โภชนาการ|ความชุก|สรุปโภชนาการ) \d$/.test(n) && !pref.manual.has(n)) { if (emptyRound.has(n)) pref.off.add(n); else pref.off.delete(n); }
  // หน้าว่างในแผ่นวิชา: หน้า 1–2 = ตัวชี้วัด (ไม่มีตัวชี้วัด = 2 หน้าแรกว่าง) · หน้า 3–4 = คะแนนชิ้นที่ 13+ (AP–BG 18, BH–BY 18) · หน้า 5 = BZ–CK ใช้เสมอ
  const blankIdx = (g) => {
    const ct = conts.get(g.n); if (!ct && !/^วิชาที่ \d+$/.test(g.n)) return [];
    const k = ct ? ct.n : Number(g.n.replace('วิชาที่ ', '')); const sub = data.subjects[k - 1]; if (!sub) return [];
    const ind = ct ? Math.min(IND_PER_SHEET, sub.indicators.length - ct.off) : sub.indicators.length; const items = sub.items.length; const out = [];
    if (ct) return g.pages.length === 2 && ind <= 20 ? [1] : [];
    if (g.pages.length !== 5) return [];
    if (!ind) out.push(0, 1); if (items <= 12) out.push(2); if (items <= 30) out.push(3);
    return out;
  };
  for (const g of groups) blankIdx(g).forEach((i) => { const key = `${g.n}#${i}`; if (!pref.manualPg.has(key)) pref.offPg.add(key); });
  const pgOn = (g, i) => !pref.offPg.has(`${g.n}#${i}`);
  const pagesOn = (g) => g.pages.filter((_, i) => pgOn(g, i));
  const on = () => groups.filter((g) => !pref.off.has(g.n));
  const issuesNow = () => bookChecks({ ...data, warnings: (data.warnings || []).filter((w) => !/ตัวชี้วัดเกิน 36/.test(w)) }, on().map((g) => g.n), sheets.filter((n) => !emptyRound.has(n)), term);
  // หน้าที่จะพิมพ์ (ตามลำดับ) + เลขหน้า
  const printList = () => { const list = on().flatMap((g) => pagesOn(g)); return S.pageNum ? list.map((p, k) => ({ ...p, html: withPageNo(p.html, k + 1, p.info?.margins?.bottom) })) : list; };

  // ---- วาดใหม่แบบทยอย: แผ่นที่กำลังดูก่อน (ตัวอย่างขึ้นทันที) แผ่นอื่นทำต่อเบื้องหลัง ----
  let pending = []; let timer = null;
  const replace = (n) => { const i = groups.findIndex((g) => g.n === n); if (i >= 0) groups[i] = renderGroup(n); };
  const flush = () => { clearTimeout(timer); timer = null; while (pending.length) replace(pending.shift()); };
  const pump = () => {
    clearTimeout(timer); if (!pending.length) return;
    timer = setTimeout(() => {
      if (!host.isConnected) { pending = []; return; }
      const t0 = performance.now(); while (pending.length && performance.now() - t0 < 30) replace(pending.shift());
      if (pending.length) { updSummary(); pump(); } else updAll();
    }, 0);
  };
  const rerender = (names) => {
    const cur = curGroup()?.n;
    if (names.includes(cur)) replace(cur);
    pending = [...new Set([...pending, ...names.filter((n) => n !== cur)])];
    updAll(); pump();
    if (ed && names.includes(edN)) ed.reload();       // ค่าทั้งชุดเปลี่ยน → ตัวจัดหน้าวาดแผ่นนี้ใหม่ (คงประวัติย้อนกลับ)
  };
  const rerenderAll = () => rerender(groups.map((g) => g.n));

  // ---- ตำแหน่งหน้าที่กำลังดู ----
  const flat = () => on().flatMap((g) => (g.pages.length ? g.pages.map((p, i) => ({ g, p, i })) : [{ g, p: null, i: 0 }]));
  const curIdx = (list = flat()) => { const k = pref.pos ? list.findIndex((x) => x.g.n === pref.pos.n && x.i === pref.pos.i) : -1; if (k >= 0) return k; const j = pref.pos ? list.findIndex((x) => x.g.n === pref.pos.n) : -1; return Math.max(0, j); };
  const curGroup = () => { const list = flat(); return list[curIdx(list)]?.g; };
  const goTo = (k) => { const list = flat(); if (!list.length) return; const x = list[clampN(k, [0, list.length - 1])]; pref.pos = { n: x.g.n, i: x.i }; updCenter(); updLeft(); syncInputs(); updSummary(); };
  const goSheet = (n) => { pref.pos = { n, i: 0 }; if (pref.off.has(n)) { pref.off.delete(n); pref.manual.add(n); } updAll(); };

  // ================= แผงซ้าย: แผ่นที่พิมพ์ + ผลตรวจ =================
  const updLeft = () => {
    const curN = curGroup()?.n;
    sheetsSec.innerHTML = `<h4>แผ่นที่พิมพ์ <span class="small muted" style="font-weight:400">(${on().length}/${groups.length})</span></h4>
      <div class="p5x-sheets">${groups.map((g) => { const off = pref.off.has(g.n); const n = pagesOn(g).length;
        return `<div class="it ${off ? 'off' : ''} ${g.n === curN ? 'cur' : ''}"><input type="checkbox" data-n="${esc(g.n)}" ${off ? '' : 'checked'} aria-label="พิมพ์แผ่น ${esc(g.n)}">
          <button type="button" data-see="${esc(g.n)}" title="ดูตัวอย่าง ${esc(g.n)}">${esc(g.n)}</button><span class="n">${g.err ? '⚠' : `${n}/${g.pages.length}`}</span>${adjAll[g.n] ? '<span class="n" title="ปรับหน้ารายแผ่นไว้">●</span>' : ''}</div>`; }).join('')}</div>`;
    $$('input[data-n]', sheetsSec).forEach((cb) => cb.addEventListener('change', () => { pref.manual.add(cb.dataset.n); if (cb.checked) pref.off.delete(cb.dataset.n); else pref.off.add(cb.dataset.n); updAll(); }));
    $$('[data-see]', sheetsSec).forEach((b) => b.addEventListener('click', () => goSheet(b.dataset.see)));
    const issues = issuesNow(); const errs = groups.filter((g) => g.err && !pref.off.has(g.n));
    const all = [...errs.map((g) => `${g.n}: ${g.err}`), ...issues.map((x) => x.text)];
    check.innerHTML = all.length
      ? `<details class="warn" ${pref.checkClosed ? '' : 'open'}><summary><b>⚠ ตรวจก่อนพิมพ์ — พบ ${all.length} ข้อ</b></summary><ul>${all.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`
      : '<div class="ok">✓ ตรวจแล้ว: ไม่พบหน้าที่ขาดหรือข้อมูลที่ยังไม่ได้ลง</div>';
    $('details', check)?.addEventListener('toggle', (e) => { pref.checkClosed = !e.target.open; });
  };

  // ================= กลาง: ตัวอย่าง A4 ทีละหน้า =================
  center.innerHTML = `
    <div class="p5x-bar">
      <span class="grp"><button type="button" class="btn btn-sm" id="p5-prev" aria-label="หน้าก่อนหน้า">‹</button>
        <label class="grp">หน้า <input type="number" id="p5-pg" min="1" step="1" aria-label="ไปที่หน้า"></label><span id="p5-pgn" class="muted"></span>
        <button type="button" class="btn btn-sm" id="p5-next" aria-label="หน้าถัดไป">›</button></span>
      <label class="chk"><input type="checkbox" id="p5-pg-on"> พิมพ์หน้านี้</label>
      <span class="sp"></span>
      <span class="grp"><button type="button" class="btn btn-sm" id="p5-zout" aria-label="ซูมออก">−</button>
        <label class="grp"><input type="number" id="p5-zoom" min="${SET_LIMITS.zoom[0]}" max="${SET_LIMITS.zoom[1]}" step="5" value="${pref.zoom}" aria-label="ซูมบนจอ (%)">%</label>
        <button type="button" class="btn btn-sm" id="p5-zin" aria-label="ซูมเข้า">+</button></span>
      <button type="button" class="btn btn-sm" id="p5-edit" aria-pressed="${pref.edit}" title="ลากขอบ/คอลัมน์/แถว ย้ายตาราง และจัดรูปแบบเซลล์ บนหน้ากระดาษของแผ่นที่ดูอยู่">✎ แก้บนหน้า</button>
    </div>
    <div class="p5x-bar" id="p5-edbar" ${pref.edit ? '' : 'hidden'}></div>
    <div class="small muted" id="p5-where" style="padding:4px 10px 0"></div>
    <div class="p5x-stage" id="p5-stage" tabindex="0" aria-label="หน้ากระดาษตัวอย่าง (ใช้ลูกศรซ้าย/ขวาเลื่อนหน้า)"></div>`;
  const stage = $('#p5-stage', center);
  const updCenter = () => {
    let list = flat(); let k = curIdx(list); let x = list[k];
    if (x && pending.includes(x.g.n)) { pending = pending.filter((n) => n !== x.g.n); replace(x.g.n); list = flat(); k = curIdx(list); x = list[k]; }
    $('#p5-pg', center).value = list.length ? k + 1 : ''; $('#p5-pg', center).max = list.length;
    $('#p5-pgn', center).textContent = `/ ${list.length}`;
    $('#p5-prev', center).disabled = k <= 0; $('#p5-next', center).disabled = k >= list.length - 1;
    const cb = $('#p5-pg-on', center);
    if (!x || !x.p) killEditor();
    if (!x) { stage.innerHTML = '<div class="empty">ไม่ได้เลือกแผ่นที่จะพิมพ์ (ติ๊กแผ่นในแผงซ้าย)</div>'; cb.disabled = true; $('#p5-where', center).textContent = ''; return; }
    pref.pos = { n: x.g.n, i: x.i };
    $('#p5-where', center).textContent = `${x.g.n}${x.g.pages.length > 1 ? ` · หน้า ${x.i + 1}/${x.g.pages.length} ของแผ่น` : ''}${x.p?.orient === 'landscape' ? ' · แนวนอน' : ''}${adjAll[x.g.n] ? ' · ● ปรับรายแผ่นไว้' : ''}`;
    if (!x.p) { stage.innerHTML = `<div class="empty">${esc(x.g.n)}: ${esc(x.g.err || 'ไม่มีหน้า')}</div>`; cb.disabled = true; return; }
    const isOn = pgOn(x.g, x.i); cb.disabled = false; cb.checked = isOn;
    stage.classList.toggle('p5x-offpg', !isOn);
    if (pref.edit) { syncEditor(x); return; }       // โหมดแก้บนหน้ากระดาษ: ตัวจัดหน้าวาดหน้านี้เอง (มีไม้บรรทัด/จุดลาก)
    killEditor();
    const z = pref.zoom / 100;
    stage.innerHTML = `<span class="pv-box ${isOn ? '' : 'off'}" style="width:${pxOf(x.p.w, z)}px;height:${pxOf(x.p.h, z)}px"><span class="pv-inner" style="transform:scale(${z})">${pageHtml(x.g, x.i, x.p)}</span></span>`;
  };
  // html ของหน้าที่แสดง: + เลขหน้า (ถ้าเปิดและหน้านี้พิมพ์) + เส้นขอบ (ไม่พิมพ์ออก)
  const pageHtml = (g, i, p) => {
    let html = p.html;
    if (S.pageNum && pgOn(g, i) && on().includes(g)) { const before = on().slice(0, on().indexOf(g)).reduce((s, x) => s + pagesOn(x).length, 0) + g.pages.slice(0, i).filter((_, j) => pgOn(g, j)).length; html = withPageNo(html, before + 1, p.info?.margins?.bottom); }
    const mg = p.info?.margins;
    return html + (pref.guide && mg ? `<div class="p5x-guide" style="left:${mg.left}pt;top:${mg.top}pt;width:${p.w - mg.left - mg.right}pt;height:${p.h - mg.top - mg.bottom}pt"></div>` : '');
  };
  $('#p5-prev', center).addEventListener('click', () => goTo(curIdx() - 1));
  $('#p5-next', center).addEventListener('click', () => goTo(curIdx() + 1));
  $('#p5-pg', center).addEventListener('change', (e) => goTo((Number(e.target.value) || 1) - 1));
  stage.addEventListener('keydown', (e) => { if (ed && ed.tool() === 'move') return; if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(curIdx() + 1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(curIdx() - 1); } });
  $('#p5-pg-on', center).addEventListener('change', (e) => { const key = `${pref.pos.n}#${pref.pos.i}`; pref.manualPg.add(key); if (e.target.checked) pref.offPg.delete(key); else pref.offPg.add(key); updAll(); });
  const setZoom = (v) => { pref.zoom = clampN(Math.round((Number(v) || 100) / 5) * 5, SET_LIMITS.zoom); $('#p5-zoom', center).value = pref.zoom; updCenter(); ed?.refresh(); };
  $('#p5-zoom', center).addEventListener('change', (e) => setZoom(e.target.value));
  $('#p5-zout', center).addEventListener('click', () => setZoom(pref.zoom - 5));
  $('#p5-zin', center).addEventListener('click', () => setZoom(pref.zoom + 5));

  // ---- โหมดแก้บนหน้ากระดาษ: ตัวจัดหน้าแบบ Office ของแผ่นที่ดูอยู่ (บันทึกอัตโนมัติ · ย้อนกลับได้) ----
  let ed = null; let edN = null; let edSave = null;
  const killEditor = () => { if (ed) { ed.destroy(); ed = null; edN = null; $('#p5-edbar', center).innerHTML = ''; $('#p5-ed-cells', right).innerHTML = ''; } };
  const reloadEditor = (names = null) => { if (ed && (!names || names.includes(edN))) { killEditor(); updCenter(); } };
  const syncEditor = (x) => {
    if (ed && edN === x.g.n) { ed.setPage(x.i); ed.refresh(); return; }
    killEditor(); const n = x.g.n; edN = n;
    ed = mountPageEditor({ render: (a, o) => renderGroup(n, a || null, o || null).pages, adj: adjAll[n], orient: oriAll[n] || null, page: x.i,
      bar: $('#p5-edbar', center), cells: $('#p5-ed-cells', right), stage, zoom: () => pref.zoom / 100, fitOnMargin: true,
      decorate: (p, i) => { const g = groups.find((y) => y.n === n); return g ? pageHtml(g, i, p) : p.html; },
      onChange: (st) => {
        if (st.adj) adjAll[n] = st.adj; else delete adjAll[n];
        if (st.orient) oriAll[n] = st.orient; else delete oriAll[n];
        saveAdj(adjAll); saveOri(oriAll); syncInputs();
        clearTimeout(edSave); edSave = setTimeout(() => { replace(n); updLeft(); updSummary(); }, 300);
      } });
  };

  // ================= แผงขวา: สรุป · ตั้งค่าชุดเดียว [ทั้งชุด | แผ่นนี้] · พิมพ์ =================
  const own = (g) => `<span class="own" data-own="${g}" hidden>● ตั้งเฉพาะแผ่นนี้<button type="button" data-unown="${g}" title="ลบค่าเฉพาะแผ่นนี้ กลับไปใช้ค่าทั้งชุด">↺ ใช้ค่าทั้งชุด</button></span>`;
  const mInput = (k, l) => `<label class="field">${l}<input type="number" id="p5-${k}" data-m="${k}" min="${SET_LIMITS.m[0]}" max="${SET_LIMITS.m[1]}" step="0.1" inputmode="decimal" placeholder="ตามแบบ"></label>`;
  const pctInput = (k, l) => `<label class="field">${l}<input type="number" id="p5-${k}" data-pct="${k}" min="${SET_LIMITS.pct[0]}" max="${SET_LIMITS.pct[1]}" step="5" inputmode="decimal" placeholder="100"></label>`;
  const segBtns = (attr, items) => items.map(([v, l, t]) => `<button type="button" ${attr}="${v}" title="${esc(t || l)}">${l}</button>`).join('');
  right.innerHTML = `
    <div class="p5x-scroll" id="p5-pane">
      <section class="p5x-sum" id="p5-sum" aria-live="polite"></section>
      <section class="p5x-edsec" id="p5-ed-sec" ${pref.edit ? '' : 'hidden'}><h4>แก้บนหน้ากระดาษ</h4>
        <p class="hint" style="margin:0 0 6px">เลือกเครื่องมือบนแถบเหนือหน้ากระดาษ · ทุกการแก้บันทึกเป็นค่าเฉพาะแผ่นนี้ทันที</p>
        <div id="p5-ed-cells"></div></section>
      <section><div class="p5x-scope" role="group" aria-label="ตั้งค่าให้">
          <button type="button" data-scope="set" title="ค่าที่ใช้กับทุกแผ่น">ทั้งชุด</button>
          <button type="button" data-scope="one" id="p5-scope-one" title="ค่าเฉพาะแผ่นที่ดูอยู่ (ชนะค่าทั้งชุด)">แผ่นนี้</button></div>
        <p class="hint" id="p5-scope-note"></p><div id="p5-conflict"></div></section>
      <section><h4>แนวกระดาษ ${own('ori')}</h4>
        <div class="p5x-seg" role="group" aria-label="แนวกระดาษ">${segBtns('data-ori', [['', 'ตามแบบ', 'ตามแบบพิมพ์โรงเรียน'], ['portrait', '▯ แนวตั้ง'], ['landscape', '▭ แนวนอน']])}</div></section>
      <section><h4>ขอบกระดาษ (ซม.) ${own('m')}</h4>
        <div class="p5x-seg" role="group" aria-label="ขอบกระดาษแบบสำเร็จรูป">
          ${Object.entries(MARGIN_PRESETS).map(([k, [l, v]]) => `<button type="button" data-preset="${k}" title="บน ${v.mt} ล่าง ${v.mb} ซ้าย ${v.ml} ขวา ${v.mr} ซม.">${l}</button>`).join('')}
          <button type="button" data-preset="custom" title="พิมพ์ค่าเองในช่องด้านล่าง">กำหนดเอง</button></div>
        <div class="p5x-4">${mInput('mt', 'บน')}${mInput('mb', 'ล่าง')}${mInput('ml', 'ซ้าย')}${mInput('mr', 'ขวา')}</div>
        <p class="hint">ตั้งขอบแล้วตารางย่อ/ขยายให้พอดีพื้นที่ในขอบ (ขนาด = พอดีขอบ) · เว้นว่าง = ตามแบบพิมพ์</p>
        <label class="chkl" title="เส้นประตามระยะขอบบนตัวอย่าง (ไม่พิมพ์ออก)"><input type="checkbox" id="p5-guide" ${pref.guide ? 'checked' : ''}> <span>แสดงเส้นขอบบนตัวอย่าง</span></label></section>
      <section><h4>ขนาดตาราง ${own('size')}</h4>
        <div class="p5x-seg" role="group" aria-label="ขนาดตาราง">${segBtns('data-size', [['tpl', 'ตามแบบ', 'ขนาดตามแบบพิมพ์โรงเรียน'], ['fit', 'พอดีขอบ', 'ย่อ/ขยายให้ตารางเต็มพื้นที่ในขอบ ไม่ล้นไปหน้าถัดไป'], ['pct', 'กำหนด %', 'กำหนดเปอร์เซ็นต์เอง']])}</div>
        <label class="field">ย่อ/ขยาย (%)<input type="number" id="p5-scale" min="${SET_LIMITS.scale[0]}" max="${SET_LIMITS.scale[1]}" step="1" inputmode="decimal"></label>
        <p class="hint" id="p5-scale-note"></p></section>
      <section><h4>ตัวอักษร ${own('pt')}</h4>
        <label class="field">ขนาดตัวอักษร (pt)<input type="number" id="p5-pt" min="${SET_LIMITS.pt[0]}" max="${SET_LIMITS.pt[1]}" step="0.5" inputmode="decimal" placeholder="16"></label>
        <p class="hint" style="margin:0 0 6px">16 pt = ขนาดตามแบบพิมพ์ · ทุกช่องในใบย่อ/ขยายตามสัดส่วน</p>
        <div class="field"><span class="small muted">ฟอนต์ (ใช้กับทั้งชุด)</span>${fontSelectHtml('p5-font')}</div></section>
      <section><h4>พิมพ์ (ทั้งชุด)</h4>
        <label class="chkl"><input type="checkbox" id="p5-pgno"> <span>ใส่เลขหน้าที่ขอบล่าง</span></label>
        <label class="chkl"><input type="checkbox" id="p5-duplex"> <span>พิมพ์สองด้าน</span></label>
        <p class="hint" id="p5-duplex-hint" hidden>เว็บสั่งพิมพ์สองด้านเองไม่ได้ — ในหน้าต่างพิมพ์ให้เลือก "พิมพ์สองด้าน / Two-sided" แบบพลิกด้านยาว</p></section>
      <section><button type="button" class="btn btn-sm btn-ghost" id="p5-reset"></button></section>
      <details id="p5-adv" ${pref.adv ? 'open' : ''}><summary>ตั้งค่าขั้นสูง</summary>
        <div class="sub"><h4>ระยะบรรทัด / ความกว้างคอลัมน์ (%) ${own('rc')}</h4>
          <div class="p5x-4">${pctInput('row', 'ระยะบรรทัด')}${pctInput('col', 'ความกว้างคอลัมน์')}</div>
          <p class="hint">100 = ตามแบบพิมพ์ · เว้นว่าง = ไม่ปรับ · ใช้กับ${'"'}ทั้งชุด/แผ่นนี้${'"'}ตามที่เลือกด้านบน</p></div>
        <div class="sub">
          <label class="field" title="อัตโนมัติ: ทุกหน้าของแต่ละแผ่นขนาดเท่ากัน จัดกึ่งกลางทั้งแนวนอนและแนวตั้ง ขอบ 10 มม. เท่ากันทุกหน้า">การจัดหน้า (ทั้งชุด)<select id="p5-auto"><option value="0" ${auto ? '' : 'selected'}>ตามแบบพิมพ์โรงเรียน</option><option value="1" ${auto ? 'selected' : ''}>อัตโนมัติ: กึ่งกลาง ขนาดเท่ากัน</option></select></label>
          <div class="p5x-links">
            <button type="button" class="btn btn-sm" id="p5-adj-multi" title="เลือกหลายแผ่นแล้วปรับขอบ/ขนาดตัวอักษร/ย่อขยายด้วยค่าเดียวกัน">ปรับหน้าหลายแผ่น…</button>
            <button type="button" class="btn btn-sm" id="p5-one-adj" title="ขอบ ขนาดตัวอักษร ระยะบรรทัด ความกว้างคอลัมน์ ย่อ/ขยาย จัดกึ่งกลาง ของแผ่นที่ดูอยู่ แบบกรอกตัวเลข">ตั้งค่าแผ่นนี้แบบตัวเลข…</button>
            <button type="button" class="btn btn-sm" id="p5-one-others" title="ใช้ขอบ/แนวกระดาษ/ขนาด/ตำแหน่งของแผ่นที่ดูอยู่กับแผ่นอื่นที่เลือก">ใช้ค่าแผ่นนี้กับแผ่นอื่น…</button></div></div>
        <div class="sub"><h4>แก้ข้อมูลต้นทาง</h4><div class="p5x-links">
          ${EDIT_LINKS.filter(([v]) => ctx.menus?.has(v)).map(([v, l]) => `<button type="button" class="btn btn-sm" data-go="${v}">${l}</button>`).join('')}
          ${ctx.menus?.has('scores') ? data.subjects.filter((x) => x.courseId && ctx.courseById?.[x.courseId]).map((x) => `<button type="button" class="btn btn-sm" data-ind="${x.courseId}" title="บันทึกตัวชี้วัด ผ/มผ รายคน">ตัวชี้วัด ผ/มผ: ${esc(x.name)}</button>`).join('') : ''}</div></div>
      </details>
    </div>
    <div class="p5x-foot"><button type="button" class="btn btn-primary" id="p5-print">พิมพ์ / บันทึกเป็น PDF</button></div>`;

  const curN = () => curGroup()?.n || null;
  const pageCount = (n) => groups.find((g) => g.n === n)?.pages.length || 0;
  // ---- ค่าที่แสดงในช่อง (หน่วยเดียวกันทั้งสองแบบ: ขอบ ซม. · ตัวอักษร pt · ขนาด %) ----
  const sizeOfSet = () => (S.fit ? 'fit' : Number.isFinite(S.scale) ? S.scale : 'tpl');
  const sizeOfOwn = (a) => (Number.isFinite(a.scale) ? a.scale : a.autoFit === true ? 'fit' : a.autoFit === false ? 'tpl' : undefined);
  const ownFlags = (n) => { const a = adjAll[n] || {}; return { ori: !!oriAll[n], m: ['mt', 'mb', 'ml', 'mr'].some((k) => Number.isFinite(a[k])), size: sizeOfOwn(a) !== undefined, pt: Number.isFinite(a.font), rc: Number.isFinite(a.row) || Number.isFinite(a.col) }; };
  const shown = () => {
    if (pref.scope === 'set') {
      const os = [...new Set(on().map((g) => oriAll[g.n] || ''))];
      return { ori: os.length === 1 ? os[0] : null, mt: S.mt, mb: S.mb, ml: S.ml, mr: S.mr, size: sizeOfSet(), pt: S.pt, row: S.row, col: S.col };
    }
    const n = curN(); const a = adjAll[n] || {}; const v = {};
    v.ori = oriAll[n] || '';
    for (const k of ['mt', 'mb', 'ml', 'mr']) v[k] = Number.isFinite(a[k]) ? r2(a[k] / 10) : S[k];
    v.size = sizeOfOwn(a) ?? sizeOfSet();
    v.pt = Number.isFinite(a.font) ? Math.round(a.font * BASE_PT / 100 * 2) / 2 : S.pt;
    v.row = Number.isFinite(a.row) ? a.row : S.row; v.col = Number.isFinite(a.col) ? a.col : S.col;
    return v;
  };
  const presetOf = (v) => { const has = ['mt', 'mb', 'ml', 'mr'].filter((k) => Number.isFinite(v[k])); if (!has.length) return null;
    const hit = Object.entries(MARGIN_PRESETS).find(([, [, p]]) => ['mt', 'mb', 'ml', 'mr'].every((k) => Math.abs((v[k] ?? -1) - p[k]) < 0.005)); return hit ? hit[0] : 'custom'; };

  // ค่าในช่องตั้งค่า ← S / ค่าเฉพาะแผ่น
  const syncInputs = () => {
    const one = pref.scope === 'one'; const n = curN(); const v = shown(); const fl = one && n ? ownFlags(n) : {};
    $$('[data-scope]', right).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === pref.scope)));
    $('#p5-scope-one', right).textContent = n ? `แผ่นนี้: ${n}` : 'แผ่นนี้';
    $('#p5-scope-note', right).textContent = one ? (n ? `ค่าด้านล่างใช้กับแผ่น "${n}" เท่านั้น (มีผลทั้ง ${pageCount(n)} หน้าของแผ่น) · ● = ต่างจากค่าทั้งชุด` : '') : 'ค่าด้านล่างใช้กับทุกแผ่น · แผ่นที่ตั้งค่าเฉพาะแผ่นไว้จะใช้ค่าของแผ่นนั้น';
    $$('[data-own]', right).forEach((x) => { x.hidden = !fl[x.dataset.own]; });
    $$('[data-ori]', right).forEach((b) => b.setAttribute('aria-pressed', String(v.ori !== null && b.dataset.ori === v.ori)));
    const pre = one ? presetOf(v) : (S.preset || presetOf(v));
    $$('[data-preset]', right).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === pre)));
    for (const k of ['mt', 'mb', 'ml', 'mr']) { const el = $(`#p5-${k}`, right); if (document.activeElement !== el) el.value = v[k] ?? ''; }
    const sz = typeof v.size === 'number' ? 'pct' : v.size;
    $$('[data-size]', right).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === sz)));
    const sc = $('#p5-scale', right); if (document.activeElement !== sc) sc.value = typeof v.size === 'number' ? v.size : '';
    sc.placeholder = sz === 'fit' ? 'พอดีขอบ' : 'ตามแบบ';
    const pt = $('#p5-pt', right); if (document.activeElement !== pt) pt.value = v.pt ?? '';
    $('#p5-row', right).value = v.row ?? ''; $('#p5-col', right).value = v.col ?? '';
    $('#p5-pgno', right).checked = !!S.pageNum; $('#p5-duplex', right).checked = !!S.duplex; $('#p5-duplex-hint', right).hidden = !S.duplex;
    const rs = $('#p5-reset', right);
    if (one) { rs.textContent = 'ล้างค่าเฉพาะแผ่นนี้ทั้งหมด'; rs.title = 'ลบทุกค่าที่ตั้งเฉพาะแผ่นนี้ (รวมที่ลากปรับ/จัดรูปแบบเซลล์) กลับไปใช้ค่าทั้งชุด'; rs.disabled = !n || (!adjAll[n] && !oriAll[n]); }
    else { rs.textContent = 'ล้างค่าทั้งชุด (ตามแบบพิมพ์)'; rs.title = 'ล้างค่าขอบ ตัวอักษร ขนาด ระยะ ทั้งชุด กลับเป็นตามแบบพิมพ์ (ไม่ล้างค่าเฉพาะแผ่น)'; rs.disabled = false; }
    $('#p5-one-adj', right).disabled = !n; $('#p5-one-others', right).disabled = !n || (!adjAll[n] && !oriAll[n]);
    $('#p5-ed-sec', right).hidden = !pref.edit;
  };

  const updSummary = () => {
    const list = on(); const total = list.reduce((s, g) => s + pagesOn(g).length, 0); const hiddenPg = list.reduce((s, g) => s + g.pages.length - pagesOn(g).length, 0);
    const ownN = list.filter((g) => adjAll[g.n] || oriAll[g.n]).length;
    $('#p5-sum', right).innerHTML = `<span class="muted">ปพ.5 ห้อง ${esc(roomName(room))} · ภาค ${term}/${termObj.academic_year}</span>
      <span><b class="big">${total}</b> หน้า จาก ${list.length} แผ่น${S.duplex ? ` · กระดาษ ${Math.ceil(total / 2)} แผ่น (สองด้าน)` : ''}</span>
      ${hiddenPg ? `<span class="muted">ไม่พิมพ์ ${hiddenPg} หน้า (ติ๊กออก)</span>` : ''}
      ${ownN ? `<span class="muted">● ${ownN} แผ่นมีค่าเฉพาะแผ่น</span>` : ''}
      ${pending.length ? '<span class="muted">กำลังจัดหน้าแผ่นอื่นต่อ…</span>' : ''}`;
    const scs = (pref.scope === 'one' ? groups.filter((g) => g.n === curN()) : list).filter((g) => g.pages.length && !pending.includes(g.n)).map((g) => Math.round(g.pages[0].scale * 100));
    $('#p5-scale-note', right).textContent = scs.length ? `ขนาดจริงตอนนี้ ${Math.min(...scs) === Math.max(...scs) ? `${scs[0]}%` : `${Math.min(...scs)}–${Math.max(...scs)}% (ต่างกันตามแผ่น)`}` : '';
    const btn = $('#p5-print', right); if (!btn.dataset.busy) { btn.disabled = !total; btn.textContent = `พิมพ์ / บันทึกเป็น PDF (${total} หน้า)`; }
    updConflict();
  };
  // ทั้งชุด: แผ่นที่ตั้งค่าเฉพาะแผ่นทับค่าทั้งชุดที่ตั้งอยู่ → บอกให้เห็น และกดใช้ค่าทั้งชุดกับทุกแผ่นได้
  const activeKeys = () => [...['mt', 'mb', 'ml', 'mr'].filter((k) => Number.isFinite(S[k])), ...(Number.isFinite(S.pt) ? ['font'] : []),
    ...(S.fit || Number.isFinite(S.scale) ? ['scale', 'autoFit'] : []), ...['row', 'col'].filter((k) => Number.isFinite(S[k]))];
  const overridden = () => { const ks = activeKeys(); return ks.length ? groups.filter((g) => adjAll[g.n] && ks.some((k) => adjAll[g.n][k] !== undefined)).map((g) => g.n) : []; };
  const updConflict = () => {
    const box = $('#p5-conflict', right); const names = pref.scope === 'set' ? overridden() : [];
    if (!names.length) { box.innerHTML = ''; return; }
    const ks = new Set(activeKeys().filter((k) => names.some((n) => adjAll[n][k] !== undefined)));
    const what = [['mt', 'ขอบ'], ['mb', 'ขอบ'], ['ml', 'ขอบ'], ['mr', 'ขอบ'], ['font', 'ตัวอักษร'], ['scale', 'ขนาด'], ['autoFit', 'ขนาด'], ['row', 'ระยะบรรทัด'], ['col', 'ความกว้างคอลัมน์']].filter(([k]) => ks.has(k)).map(([, l]) => l);
    box.innerHTML = `<div class="p5x-warn" role="status"><span>⚠ ${names.length} แผ่นตั้ง${[...new Set(what)].join('/')}เฉพาะแผ่นไว้ จึงไม่เปลี่ยนตามค่าทั้งชุด (${esc(names.slice(0, 3).join(', '))}${names.length > 3 ? '…' : ''})</span>
      <button type="button" class="btn btn-sm" id="p5-unover">ใช้ค่าทั้งชุดกับทุกแผ่น</button></div>`;
    $('#p5-unover', box).addEventListener('click', () => {
      const ks2 = activeKeys();
      for (const n of names) { const a = { ...adjAll[n] }; for (const k of ks2) delete a[k]; if (Object.keys(a).length) adjAll[n] = a; else delete adjAll[n]; }
      saveAdj(adjAll); edPush(names); rerender(names); toast(`${names.length} แผ่นใช้ค่าทั้งชุดแล้ว (ค่าอื่น เช่น คอลัมน์/รูปแบบเซลล์ ยังอยู่)`);
    });
  };
  const updAll = () => { updLeft(); updCenter(); updSummary(); syncInputs(); };

  // ---- เขียนค่าจากช่องตั้งค่า (patch หน่วยที่แสดง: ori · mt..mr ซม. · size 'tpl'|'fit'|% · pt · row · col · undefined = ล้าง) ----
  // ตัวจัดหน้าที่เปิดอยู่รับค่าใหม่ของแผ่นนั้น (ย้อนกลับได้)
  const edPush = (names) => { if (ed && names.includes(edN)) ed.setState(adjAll[edN], oriAll[edN] || null); };
  let deb = null;
  const apply = (patch, { now = true } = {}) => {
    const mKeys = ['mt', 'mb', 'ml', 'mr'].filter((k) => k in patch);
    if (pref.scope === 'set') {
      if ('ori' in patch) { setOri(on().map((g) => g.n), patch.ori || ''); delete patch.ori; }
      for (const k of mKeys) S[k] = patch[k];
      // ขอบมีผลจริง: ตั้งขอบตอนขนาดยัง "ตามแบบ" → ให้ตารางพอดีขอบ
      if (mKeys.some((k) => patch[k] !== undefined) && !('size' in patch) && sizeOfSet() === 'tpl') patch.size = 'fit';
      if ('size' in patch) { const z = patch.size; S.fit = z === 'fit'; if (typeof z === 'number') S.scale = z; else delete S.scale; }
      for (const k of ['pt', 'row', 'col']) if (k in patch) S[k] = patch[k];
      saveSet(S); syncInputs(); clearTimeout(deb);
      if (Object.keys(patch).length) { if (now) rerenderAll(); else deb = setTimeout(rerenderAll, 250); }
      return;
    }
    const n = curN(); if (!n) return; const a = { ...(adjAll[n] || {}) };
    if ('ori' in patch) { if (patch.ori) oriAll[n] = patch.ori; else delete oriAll[n]; saveOri(oriAll); }
    for (const k of mKeys) { if (patch[k] === undefined) delete a[k]; else a[k] = Math.round(patch[k] * 100) / 10; }
    if (mKeys.some((k) => patch[k] !== undefined) && !('size' in patch) && (sizeOfOwn(a) ?? sizeOfSet()) === 'tpl') patch.size = 'fit';
    if ('size' in patch) { const z = patch.size; delete a.scale; delete a.autoFit; if (z === 'fit') a.autoFit = true; else if (z === 'tpl') a.autoFit = false; else if (typeof z === 'number') a.scale = z; }
    if ('pt' in patch) { if (patch.pt === undefined) delete a.font; else a.font = Math.round(patch.pt / BASE_PT * 1000) / 10; }
    for (const k of ['row', 'col']) if (k in patch) { if (patch[k] === undefined) delete a[k]; else a[k] = patch[k]; }
    if (Object.keys(a).length) adjAll[n] = a; else delete adjAll[n];
    saveAdj(adjAll); edPush([n]); syncInputs(); clearTimeout(deb);
    if (now) rerender([n]); else deb = setTimeout(() => rerender([n]), 250);
  };
  const setOri = (names, v) => { for (const t of names) { if (v) oriAll[t] = v; else delete oriAll[t]; } saveOri(oriAll); edPush(names); rerender(names); };
  const setScope = (sc) => { pref.scope = sc; syncInputs(); updSummary(); };
  const setEdit = (v) => {
    pref.edit = v; $('#p5-edit', center).setAttribute('aria-pressed', String(v)); $('#p5-edbar', center).hidden = !v;
    if (v) pref.scope = 'one';          // แก้บนหน้ากระดาษ = ค่าเฉพาะแผ่น → ช่องตั้งค่าแสดงค่าของแผ่นนี้ให้เห็นตาม
    updCenter(); syncInputs(); updSummary();
  };
  $$('[data-scope]', right).forEach((b) => b.addEventListener('click', () => setScope(b.dataset.scope)));
  $('#p5-edit', center).addEventListener('click', () => setEdit(!pref.edit));
  $$('[data-ori]', right).forEach((b) => b.addEventListener('click', () => {
    apply({ ori: b.dataset.ori });
    if (pref.scope === 'set') toast(b.dataset.ori === '' ? 'ทุกแผ่นกลับเป็นแนวตามแบบพิมพ์' : `ทุกแผ่นเป็น${b.dataset.ori === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}แล้ว`);
  }));
  $$('[data-preset]', right).forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.preset;
    if (MARGIN_PRESETS[k]) { if (pref.scope === 'set') S.preset = k; apply({ ...MARGIN_PRESETS[k][1] }); return; }
    // กำหนดเอง: เริ่มจากขอบที่เห็นอยู่ของหน้านี้ แล้วแก้ต่อในช่องด้านล่าง
    if (pref.scope === 'set') S.preset = 'custom';
    const v = shown();
    if (!['mt', 'mb', 'ml', 'mr'].some((x) => Number.isFinite(v[x]))) {
      const mg = flat()[curIdx()]?.p?.info?.margins; const cm = (pt) => Math.round(pt / 72 * 25.4) / 10;
      if (mg) apply({ mt: cm(mg.top), mb: cm(mg.bottom), ml: cm(mg.left), mr: cm(mg.right) });
    } else syncInputs();
    $('#p5-mt', right).focus();
  }));
  $$('[data-m]', right).forEach((inp) => inp.addEventListener('input', () => {
    const v = num(inp.value); if (pref.scope === 'set') S.preset = 'custom';
    apply({ [inp.dataset.m]: v === undefined ? undefined : clampN(Math.round(v * 100) / 100, SET_LIMITS.m) }, { now: false });
  }));
  $$('[data-m]', right).forEach((inp) => inp.addEventListener('change', () => { inp.blur(); syncInputs(); }));
  $$('[data-size]', right).forEach((b) => b.addEventListener('click', () => {
    const z = b.dataset.size;
    if (z === 'pct') { const cur = shown().size; const actual = flat()[curIdx()]?.p?.scale; apply({ size: typeof cur === 'number' ? cur : clampN(Math.round((actual || 1) * 100), SET_LIMITS.scale) }); $('#p5-scale', right).focus(); return; }
    apply({ size: z });
  }));
  $('#p5-scale', right).addEventListener('change', (e) => { const v = num(e.target.value); e.target.blur(); apply({ size: v === undefined ? 'tpl' : clampN(Math.round(v), SET_LIMITS.scale) }); });
  $('#p5-pt', right).addEventListener('change', (e) => { const v = num(e.target.value); e.target.blur(); apply({ pt: v === undefined ? undefined : clampN(Math.round(v * 2) / 2, SET_LIMITS.pt) }); });
  $$('[data-pct]', right).forEach((inp) => inp.addEventListener('change', () => { const v = num(inp.value); apply({ [inp.dataset.pct]: v === undefined ? undefined : clampN(Math.round(v), SET_LIMITS.pct) }); }));
  // ↺ ใช้ค่าทั้งชุด (ลบค่าเฉพาะแผ่นของกลุ่มนั้น)
  $$('[data-unown]', right).forEach((b) => b.addEventListener('click', () => {
    const g = b.dataset.unown;
    const patch = g === 'ori' ? { ori: '' } : g === 'm' ? { mt: undefined, mb: undefined, ml: undefined, mr: undefined } : g === 'size' ? { size: null } : g === 'pt' ? { pt: undefined } : { row: undefined, col: undefined };
    if (g === 'size') { const n = curN(); const a = { ...(adjAll[n] || {}) }; delete a.scale; delete a.autoFit; if (Object.keys(a).length) adjAll[n] = a; else delete adjAll[n]; saveAdj(adjAll); edPush([n]); syncInputs(); rerender([n]); return; }
    if (g === 'm') { const n = curN(); const a = { ...(adjAll[n] || {}) }; for (const k of ['mt', 'mb', 'ml', 'mr']) delete a[k]; if (Object.keys(a).length) adjAll[n] = a; else delete adjAll[n]; saveAdj(adjAll); edPush([n]); syncInputs(); rerender([n]); return; }
    apply(patch);
  }));
  $('#p5-guide', right).addEventListener('change', (e) => { pref.guide = e.target.checked; if (ed) ed.refresh(); else updCenter(); });
  $('#p5-pgno', right).addEventListener('change', (e) => { S.pageNum = e.target.checked; saveSet(S); if (ed) ed.refresh(); else updCenter(); });
  $('#p5-duplex', right).addEventListener('change', (e) => { S.duplex = e.target.checked; saveSet(S); syncInputs(); updSummary(); });
  $('#p5-reset', right).addEventListener('click', () => {
    if (pref.scope === 'one') { const n = curN(); if (!n) return; delete adjAll[n]; delete oriAll[n]; saveAdj(adjAll); saveOri(oriAll); edPush([n]); rerender([n]); toast(`ล้างค่าเฉพาะแผ่น ${n} แล้ว (ใช้ค่าทั้งชุด)`); return; }
    for (const k of ['preset', 'mt', 'mb', 'ml', 'mr', 'pt', 'scale', 'fit', 'row', 'col']) delete S[k];
    saveSet(S); syncInputs(); rerenderAll(); toast('กลับเป็นตามแบบพิมพ์แล้ว (ค่าเฉพาะแผ่นยังอยู่)');
  });
  $('#p5-adv', right).addEventListener('toggle', (e) => { pref.adv = e.target.open; });
  $('#p5-font', right).addEventListener('change', (e) => { setThaiFont(e.target.value); toast('เปลี่ยนฟอนต์แล้ว กำลังจัดหน้าใหม่'); again(); });

  // ---- ตั้งค่าขั้นสูง (ฟังก์ชันเดิม) ----
  $('#p5-auto', right).addEventListener('change', (e) => {
    auto = e.target.value === '1'; saveAuto(auto); rerenderAll();
    toast(auto ? 'จัดหน้าอัตโนมัติทั้งชุดแล้ว (ค่าเฉพาะแผ่นทับได้)' : 'กลับเป็นการจัดหน้าตามแบบพิมพ์โรงเรียน');
  });
  $('#p5-adj-multi', right).addEventListener('click', async () => {
    const names = await pickSheetsDialog(on().map((g) => g.n), [
      ['ทุกวิชา', (n) => /^วิชาที่ /.test(n)], ['เวลาเรียน', (n) => ATT_NAMES.has(n) || /^เวลา รวม/.test(n)],
      ['น้ำหนัก-ส่วนสูง/โภชนาการ', (n) => /^(น้ำหนัก-ส่วนสูง|โภชนาการ|ความชุก|สรุปโภชนาการ)/.test(n)],
      ['อื่น ๆ', (n) => !/^(วิชาที่ |เวลา รวม|น้ำหนัก-ส่วนสูง|โภชนาการ|ความชุก|สรุปโภชนาการ)/.test(n) && !ATT_NAMES.has(n)]], new Set(Object.keys(adjAll)));
    if (!names) return;
    const same = names.every((n) => JSON.stringify(adjAll[n] || null) === JSON.stringify(adjAll[names[0]] || null));
    const res = await adjustDialog(`${names.length} แผ่น`, same ? adjAll[names[0]] : undefined,
      { margins: F.wb.sheet(baseOf(names[0]))?.page.margins, scale: null, noAll: true }, `แผ่นที่เลือก ${names.length} แผ่น (${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}) ในการดูตัวอย่าง/พิมพ์/PDF`);
    if (!res) return;
    for (const t of names) { if (res.adj) adjAll[t] = { ...res.adj }; else delete adjAll[t]; }
    saveAdj(adjAll); edPush(names); rerender(names); toast(res.adj ? `ปรับหน้า ${names.length} แผ่นแล้ว` : `ล้างค่าปรับหน้า ${names.length} แผ่นแล้ว`);
  });
  $('#p5-one-others', right).addEventListener('click', async () => {
    const n = curN(); if (!n) return; const a = adjAll[n];
    if (!a && !oriAll[n]) { toast('แผ่นนี้ยังไม่ได้ตั้งค่าเฉพาะแผ่น', 'err'); return; }
    const KEYS = ['mt', 'mb', 'ml', 'mr', 'scale', 'font', 'row', 'col', 'ox', 'oy', 'hCenter', 'vCenter', 'autoFit'];
    const names = await pickSheetsDialog(on().map((g) => g.n).filter((x) => x !== n), [], new Set(Object.keys(adjAll)));
    if (!names) return;
    for (const t of names) {
      if (oriAll[n]) oriAll[t] = oriAll[n]; else delete oriAll[t];
      const next = { ...(adjAll[t] || {}) }; for (const k of KEYS) { if (a?.[k] !== undefined) next[k] = a[k]; else delete next[k]; }
      if (Object.keys(next).length) adjAll[t] = next; else delete adjAll[t];
    }
    saveAdj(adjAll); saveOri(oriAll); rerender(names); toast(`ใช้ค่าของแผ่นนี้กับ ${names.length} แผ่นแล้ว (รูปแบบเซลล์/ความกว้างคอลัมน์ที่ลากไว้ใช้เฉพาะแผ่นนี้)`);
  });
  $('#p5-one-adj', right).addEventListener('click', async () => {
    const n = curN(); if (!n) return; const { opt } = pp5Layout(baseOf(n), m);
    const res = await adjustDialog(n, adjAll[n], { margins: F.wb.sheet(baseOf(n))?.page.margins, scale: opt.adj?.scale ?? null });
    if (!res) return;
    const targets = res.all ? on().map((g) => g.n) : [n];
    for (const t of targets) { if (res.adj) adjAll[t] = { ...res.adj }; else delete adjAll[t]; }
    saveAdj(adjAll); edPush(targets); rerender(targets);
  });
  $$('[data-ind]', right).forEach((b) => b.addEventListener('click', () => ctx.go('scores', { course: b.dataset.ind, tab: 'indicators' })));
  $$('[data-go]', right).forEach((b) => b.addEventListener('click', () => ctx.go(b.dataset.go)));

  // ---- พิมพ์ / PDF (ตรวจก่อนพิมพ์เหมือนเดิม) ----
  $('#p5-print', right).addEventListener('click', async (e) => {
    const btn = e.currentTarget;   // จับปุ่มไว้ก่อน await (หลังรอหน้าต่างยืนยัน e.currentTarget จะเป็นค่าว่าง)
    flush(); updAll();
    const issues = issuesNow();
    if (issues.length && (await modal('ตรวจก่อนพิมพ์', `<p style="margin:0">พบ ${issues.length} ข้อที่ควรตรวจก่อนพิมพ์:</p><ul class="small" style="margin:6px 0 0;padding-left:20px;max-height:50vh;overflow:auto">${issues.map((x) => `<li>${esc(x.text)}</li>`).join('')}</ul>`, { okText: 'พิมพ์ต่อ', cancelText: 'กลับไปตรวจ' })) === null) return;
    btn.dataset.busy = '1';
    try { await printWithStatus(btn, printList(), fileName(room, termObj)); } finally { delete btn.dataset.busy; updSummary(); }
  });

  updAll(); fitH();
}
