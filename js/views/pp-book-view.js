// =====================================================================
//  เล่ม ปพ. จากไฟล์ต้นฉบับของโรงเรียน
//  - เลือกแผ่น · เรียงลำดับ · แนวกระดาษ · การย่อ (รายแผ่น)
//  - ดูตัวอย่างทุกหน้า เลือกพิมพ์รายหน้า → พิมพ์ / บันทึกเป็น PDF ได้ในแอป (ไม่ต้องมี Excel)
//  - หรือสร้างไฟล์ Excel ที่หน้าตาเหมือนต้นฉบับ
// =====================================================================
import { esc, $, $$, toast, roomName, confirmBox } from '../util.js?v=2569.10.31-7';
import { Template } from '../xlsx-template.js?v=2569.10.31-7';
import { buildBookData, makeBook, prepareBook, defaultBook } from '../pp-book.js?v=2569.10.31-7';
import { downloadBytes } from '../xlsx-write.js?v=2569.10.31-7';
import { Workbook } from '../xl-model.js?v=2569.10.31-7';
import { Engine } from '../xl-formula.js?v=2569.10.31-7';
import { Renderer, XL_CSS, legacyThaiAvailable, hasLocalFont } from '../xl-render.js?v=2569.10.31-7';
import { useThaiFont, getThaiFont, setThaiFont, fontFaceCss, fontSelectHtml } from '../thai-fonts.js?v=2569.10.31-7';

const PATH = 'pp/template';
let cache = { at: null, bytes: null, t: null };          // ไฟล์ต้นฉบับที่โหลดแล้ว (อยู่ในหน่วยความจำ)
let book = null;                                         // ข้อมูลที่เติมแล้ว + เครื่องคำนวณ + หน้าที่วาดแล้ว
const layoutKey = (name) => `pp-book-layout:${name || 'template'}`;
const loadLayout = (name) => { try { return JSON.parse(localStorage.getItem(layoutKey(name)) || 'null'); } catch { return null; } };
const saveLayout = (name, l) => { try { localStorage.setItem(layoutKey(name), JSON.stringify(l)); } catch { /* */ } };
const O_LABEL = { '': 'ตามต้นฉบับ', portrait: 'แนวตั้ง', landscape: 'แนวนอน' };
const F_LABEL = { '': 'ตามต้นฉบับ', page: 'พอดี 1 หน้า', width: 'พอดีความกว้าง', none: 'ไม่ย่อ (100%)' };
const DPI = { 96: 'จอ 100%', 120: 'จอ 125% (ค่าเริ่มต้น ตรงกับไฟล์ต้นฉบับ)', 144: 'จอ 150%' };
const ZOOM = { 0.22: 'เล็ก', 0.32: 'กลาง', 0.5: 'ใหญ่', 0.8: 'ใหญ่มาก' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };

export async function bookView(paper, ctx, room) {
  const tplName = ctx.settings.pp_template_name || '';
  const isAdmin = ctx.isAdmin;
  paper.innerHTML = '<p class="muted">กำลังตรวจไฟล์ต้นฉบับ…</p>';
  let info = null;
  try { info = await ctx.db.files.info(PATH); } catch (err) { paper.innerHTML = `<div class="empty">อ่านที่เก็บไฟล์ไม่ได้: ${esc(err.message)}<br><span class="small">ถ้าเพิ่งอัปเดตแอป ให้ผู้ดูแลระบบรัน supabase/schema.sql ใหม่ (เพิ่มที่เก็บไฟล์ pp-files)</span></div>`; return; }

  const uploadCard = `
    <div class="card no-print"><div class="row" style="justify-content:space-between;align-items:center">
      <div><h3 style="margin:0">ไฟล์ต้นฉบับโปรแกรม ปพ.5-6</h3>
        <p class="small muted" style="margin:4px 0 0">${info ? `${esc(tplName || 'ไฟล์ต้นฉบับ')} · ${(info.size / 1048576).toFixed(1)} MB · อัปโหลดเมื่อ ${esc(String(info.updated_at || '').slice(0, 10))}`
          : 'ยังไม่มีไฟล์ต้นฉบับในระบบ'} · เก็บแบบส่วนตัวของโรงเรียน (ไม่เผยแพร่)</p></div>
      ${isAdmin ? `<div class="row"><label class="btn btn-sm ${info ? '' : 'btn-primary'}">${info ? 'เปลี่ยนไฟล์…' : 'อัปโหลดไฟล์ต้นฉบับ…'}<input type="file" id="tpl-up" accept=".xlsx,.xlsm" hidden></label>
        ${info ? '<button class="btn btn-sm btn-danger" id="tpl-del">ลบ</button>' : ''}</div>` : ''}
    </div>
    ${!info ? `<p class="small">ใช้ไฟล์ ปพ.5-6 ที่โรงเรียนใช้อยู่ (ไฟล์ .xlsb ให้เปิดใน Excel แล้ว "บันทึกเป็น" <b>.xlsm</b> หรือ <b>.xlsx</b> ก่อน) ระบบจะใส่ข้อมูลนักเรียน เวลาเรียน คะแนน น้ำหนัก-ส่วนสูง คุณลักษณะ และกิจกรรม
      ลงช่องกรอกของไฟล์นั้น แล้วคำนวณสูตรเดิมของไฟล์ทุกหน้า หน้าตาที่พิมพ์ออกมาจึงเหมือนต้นฉบับ${isAdmin ? '' : ' — กรุณาให้ผู้ดูแลระบบอัปโหลดไฟล์'}</p>` : ''}</div>`;

  if (!info) { paper.innerHTML = uploadCard; wireUpload(paper, ctx, () => bookView(paper, ctx, room)); return; }

  // โหลดไฟล์ต้นฉบับ (ครั้งเดียวต่อการเปิดหน้า)
  if (cache.at !== info.updated_at) {
    paper.innerHTML = `${uploadCard}<p class="muted">กำลังโหลดไฟล์ต้นฉบับ…</p>`;
    try {
      const bytes = await ctx.db.files.download(PATH);
      cache = { at: info.updated_at, bytes, t: await Template.open(bytes) };
      dropBook();
    } catch (err) { paper.innerHTML = `${uploadCard}<div class="empty">เปิดไฟล์ต้นฉบับไม่ได้: ${esc(err.message)}</div>`; wireUpload(paper, ctx, () => bookView(paper, ctx, room)); return; }
  }
  const t = cache.t;
  const nSubjects = ctx.courses.filter((k) => k.classroom_id === room.id && k.term_id === ctx.term.id).length;
  const all = t.sheets.filter((s) => s.state === 'visible');
  // เลย์เอาต์ที่จำไว้ (ต่อผู้ใช้/เบราว์เซอร์)
  let layout = loadLayout(tplName);
  const fresh = () => ({ order: all.map((s) => s.name), on: defaultBook(t.sheets, nSubjects), orient: {}, fit: {}, skip: {}, dpi: layout?.dpi || 120, zoom: layout?.zoom || 0.32 });
  if (!layout || !Array.isArray(layout.order)) layout = fresh();
  layout.order = [...layout.order.filter((n) => all.some((s) => s.name === n)), ...all.map((s) => s.name).filter((n) => !layout.order.includes(n))];
  layout.orient ||= {}; layout.fit ||= {}; layout.skip ||= {}; layout.dpi ||= 120; layout.zoom ||= 0.32;
  layout.who ||= {};
  const per = perStudentSheets(t);
  const on = new Set(layout.on);
  const store = () => { layout.on = layout.order.filter((n) => on.has(n)); saveLayout(tplName, layout); };
  const bookKey = `${room.id}|${ctx.term.id}|${cache.at}`;
  if (book && book.key !== bookKey) dropBook();

  paper.innerHTML = `${uploadCard}
    <div class="card no-print">
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="margin:0">จัดหน้าเล่ม ปพ. — ห้อง ${esc(roomName(room))} ภาคเรียนที่ ${ctx.term.term}/${ctx.term.academic_year}</h3>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn btn-sm" id="b-def">ค่าเริ่มต้น (ปก ปพ.5 รายชั้น → เกรดร้อยละ)</button>
          <button class="btn btn-sm" id="b-none">ไม่เลือกเลย</button>
          <button class="btn btn-primary" id="b-prev">ดูตัวอย่าง / พิมพ์ / PDF</button>
          <button class="btn" id="b-make">สร้างไฟล์ Excel</button>
        </div>
      </div>
      <p class="small muted">ติ๊กแผ่นที่จะพิมพ์ · ลูกศรเลื่อนลำดับ · เลือกแนวกระดาษและการย่อรายแผ่นได้ · แผ่นรายคน (เช่น ปพ.6) พิมพ์ทุกคนในห้อง หรือระบุเลขที่ เช่น 1-5, 8 · เลือก/ไม่เลือกรายหน้าได้ในตัวอย่าง · ระบบจำการจัดหน้าไว้ให้ครั้งต่อไป</p>
      <div class="tbl-wrap" style="max-height:52vh"><table class="tbl" id="b-list"><thead><tr><th class="n">พิมพ์</th><th class="n">ลำดับ</th><th>แผ่นงาน</th><th>แนวกระดาษ</th><th>การย่อ</th><th>นักเรียน <span class="small muted">(แผ่นรายคน)</span></th><th></th></tr></thead><tbody></tbody></table></div>
      <details style="margin-top:8px"><summary class="small">ขั้นสูง</summary>
        <label class="small">ความกว้างคอลัมน์คิดแบบ <select id="b-dpi">${Object.entries(DPI).map(([v, l]) => `<option value="${v}" ${+v === +layout.dpi ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="small muted" style="margin:4px 0 0">Excel คำนวณความกว้างคอลัมน์จากขนาดตัวอักษรบนจอ ไฟล์ ปพ. ต้นฉบับจัดหน้าบนจอ 125% ถ้าพิมพ์จาก Excel ในเครื่องที่ตั้งจอ 100% ตารางจะแคบลงเล็กน้อย</p>
      </details>
      <div id="b-out" class="small" style="margin-top:8px"></div>
    </div>
    <div class="card no-print" id="pv" hidden></div>`;

  const tbody = $('#b-list tbody', paper);
  const origOrient = (n) => (t.orientation(n) === 'landscape' ? 'แนวนอน' : 'แนวตั้ง');
  const draw = () => {
    let k = 0;
    tbody.innerHTML = layout.order.map((n, i) => {
      const sel = on.has(n); if (sel) k++;
      const o = layout.orient[n] || ''; const f = layout.fit[n] || '';
      return `<tr data-n="${esc(n)}" style="${sel ? '' : 'opacity:.55'}"><td class="n"><input type="checkbox" data-on ${sel ? 'checked' : ''} aria-label="พิมพ์ ${esc(n)}"></td>
        <td class="n">${sel ? k : ''}</td><td>${esc(n)}</td>
        <td><select data-o aria-label="แนวกระดาษ ${esc(n)}">${Object.entries(O_LABEL).map(([v, l]) => `<option value="${v}" ${o === v ? 'selected' : ''}>${l}${v === '' ? ` (${origOrient(n)})` : ''}</option>`).join('')}</select></td>
        <td><select data-f aria-label="การย่อ ${esc(n)}">${Object.entries(F_LABEL).map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td>${per.has(n) ? `<input data-w size="10" value="${esc(layout.who[n] || '')}" placeholder="ทุกคน" aria-label="เลขที่นักเรียนของ ${esc(n)}" title="เว้นว่าง = ทุกคน · เช่น 1-5, 8">` : ''}</td>
        <td class="n" style="white-space:nowrap"><button class="btn btn-sm btn-ghost" data-up ${i ? '' : 'disabled'} aria-label="เลื่อนขึ้น">↑</button><button class="btn btn-sm btn-ghost" data-down ${i < layout.order.length - 1 ? '' : 'disabled'} aria-label="เลื่อนลง">↓</button></td></tr>`;
    }).join('');
  };
  draw();
  const changed = () => { store(); draw(); if (!$('#pv', paper).hidden) schedulePreview(); };
  tbody.addEventListener('change', (e) => {
    const tr = e.target.closest('tr'); const n = tr.dataset.n;
    if (e.target.matches('[data-on]')) { if (e.target.checked) on.add(n); else on.delete(n); }
    if (e.target.matches('[data-o]')) { if (e.target.value) layout.orient[n] = e.target.value; else delete layout.orient[n]; delete layout.skip[n]; }
    if (e.target.matches('[data-f]')) { if (e.target.value) layout.fit[n] = e.target.value; else delete layout.fit[n]; delete layout.skip[n]; }
    if (e.target.matches('[data-w]')) { const v = e.target.value.trim(); if (v) layout.who[n] = v; else delete layout.who[n]; delete layout.skip[n]; }
    changed();
  });
  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-up],[data-down]'); if (!b) return;
    const n = b.closest('tr').dataset.n; const i = layout.order.indexOf(n); const j = i + (b.matches('[data-up]') ? -1 : 1);
    [layout.order[i], layout.order[j]] = [layout.order[j], layout.order[i]]; changed();
  });
  $('#b-def', paper).addEventListener('click', () => { const z = layout.zoom; const d = layout.dpi; layout = fresh(); layout.zoom = z; layout.dpi = d; on.clear(); layout.on.forEach((n) => on.add(n)); changed(); });
  $('#b-none', paper).addEventListener('click', () => { on.clear(); changed(); });
  $('#b-dpi', paper).addEventListener('change', (e) => { layout.dpi = +e.target.value; if (book) { book.R = null; book.pages.clear(); } changed(); });

  // ---------- ไฟล์ Excel ----------
  $('#b-make', paper).addEventListener('click', async (e) => {
    const sheets = layout.order.filter((n) => on.has(n));
    if (!sheets.length) { toast('กรุณาเลือกอย่างน้อย 1 แผ่น', 'err'); return; }
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'กำลังสร้าง…';
    const out = $('#b-out', paper);
    try {
      const data = await buildBookData(ctx, room);
      const pick = (obj) => Object.fromEntries(sheets.filter((n) => obj[n]).map((n) => [n, obj[n]]));
      const { bytes, report, macro } = await makeBook(cache.bytes, data, { sheets, orientation: pick(layout.orient), fit: pick(layout.fit) });
      const name = `${fileBase(ctx, room)}.${macro ? 'xlsm' : 'xlsx'}`;
      downloadBytes(bytes, name, macro ? 'application/vnd.ms-excel.sheet.macroEnabled.12' : undefined);
      out.innerHTML = `ดาวน์โหลดแล้ว: <b>${esc(name)}</b> · ${sheets.length} แผ่น · ${reportHtml(data, report)}
        <br><span class="muted">การเลือก/ไม่เลือกรายหน้าในตัวอย่างใช้กับการพิมพ์/PDF ในแอปเท่านั้น ไฟล์ Excel พิมพ์ทั้งแผ่นที่เลือก</span>`;
    } catch (err) { toast(err.message, 'err'); out.textContent = `สร้างไม่สำเร็จ: ${err.message}`; }
    finally { btn.disabled = false; btn.textContent = 'สร้างไฟล์ Excel'; }
  });

  // ---------- ตัวอย่าง / พิมพ์ ----------
  const pv = $('#pv', paper);
  let timer = null; let io = null; let runId = 0;
  const schedulePreview = () => { clearTimeout(timer); timer = setTimeout(() => showPreview(), 250); };

  async function ensureBook(force = false) {
    if (book && !force) return book;
    dropBook();
    pv.hidden = false;
    pv.innerHTML = '<p class="muted">กำลังเตรียมข้อมูลห้องและคำนวณสูตรของไฟล์ต้นฉบับ… (ครั้งแรกอาจใช้เวลาสักครู่)</p>';
    await new Promise((r) => setTimeout(r, 30));
    const data = await buildBookData(ctx, room);
    const { t: filled, report } = await prepareBook(cache.bytes, data);
    const overrides = new Map(); for (const [p, x] of filled.xml) overrides.set(p, x);
    overrides.set('xl/workbook.xml', filled.wb);
    const wb = new Workbook(filled.files, overrides);
    const eng = new Engine(wb.engineBook, { today: new Date() });
    book = { key: bookKey, data, report, wb, eng, R: null, pages: new Map(), urls: new Map() };
    return book;
  }
  function renderer() {
    if (book.R) return book.R;
    // ฟอนต์ที่ฝังในแอปต้องโหลดเสร็จก่อนวัดข้อความ (เรียก useThaiFont ก่อนแล้วใน pagesOfNow)
    const legacy = (n) => legacyThaiAvailable(n);
    book.R = new Renderer(book.wb, book.eng, {
      dpi: layout.dpi, legacyAvailable: legacy,
      imageUrl: (p) => {
        if (book.urls.has(p)) return book.urls.get(p);
        const ext = (p.split('.').pop() || '').toLowerCase(); const type = MIME[ext];
        const b = type ? book.wb.bytes(p) : null;
        const u = b ? URL.createObjectURL(new Blob([b], { type })) : null;
        book.urls.set(p, u); return u;
      },
    });
    return book.R;
  }
  // คิวเดียว: กันการจัดหน้าสองรอบพร้อมกัน (แผ่นรายคนเปลี่ยนค่าในเครื่องคำนวณ)
  function pagesOf(n, progress) {
    const job = () => pagesOfNow(n, progress);
    const pr = (book.lock || Promise.resolve()).then(job, job);
    book.lock = pr.catch(() => {});
    return pr;
  }
  async function pagesOfNow(n, progress) {
    if (book.font !== getThaiFont()) { await useThaiFont(); book.font = getThaiFont(); book.R = null; book.pages.clear(); }
    const p = per.get(n);
    const list = p ? parseWho(layout.who[n], book.data.students.length) : null;
    const k = `${n}|${book.font}|${layout.orient[n] || ''}|${layout.fit[n] || ''}|${layout.dpi}|${list ? list.join(',') : ''}`;
    if (book.pages.has(k)) return book.pages.get(k);
    const opt = { orientation: layout.orient[n] || null, fit: layout.fit[n] || null };
    let pages;
    if (!p) pages = renderer().renderSheet(n, opt);
    else {
      // แผ่นรายคน: เปลี่ยนเลขที่ในเซลล์ "No" แล้วคำนวณ/วาดใหม่ทีละคน (แบบเดียวกับแมโครของไฟล์ต้นฉบับ)
      pages = [];
      const orig = book.eng.value(n, p.r, p.c);
      for (const [j, no] of list.entries()) {
        progress?.(`${n} คนที่ ${no} (${j + 1}/${list.length})`);
        book.eng.setValue(n, p.r, p.c, no);
        for (const pg of renderer().renderSheet(n, opt)) pages.push({ ...pg, student: no });
        await new Promise((r) => setTimeout(r, 0));
      }
      book.eng.setValue(n, p.r, p.c, typeof orig === 'number' ? orig : 1);
    }
    book.pages.set(k, pages);
    return pages;
  }

  async function showPreview(force = false) {
    const sheets = layout.order.filter((n) => on.has(n));
    if (!sheets.length) { pv.hidden = false; pv.innerHTML = '<div class="empty">ยังไม่ได้เลือกแผ่นงาน</div>'; return; }
    try { await ensureBook(force); } catch (err) { pv.innerHTML = `<div class="empty">เตรียมตัวอย่างไม่สำเร็จ: ${esc(err.message)}</div>`; return; }
    pv.innerHTML = '<p class="muted" id="pv-prog">กำลังจัดหน้า…</p>';
    const prog = (msg) => { const el = $('#pv-prog', pv); if (el) el.textContent = `กำลังจัดหน้า… ${msg}`; };
    await new Promise((r) => setTimeout(r, 20));
    const groups = [];
    const myRun = ++runId;
    for (const n of sheets) {
      prog(n);
      try { groups.push({ n, pages: await pagesOf(n, prog) }); } catch (err) { groups.push({ n, pages: [], err: err.message }); }
      await new Promise((r) => setTimeout(r, 0));
      if (myRun !== runId) return;   // มีการเปลี่ยนแปลงระหว่างจัดหน้า เริ่มใหม่แล้ว
    }
    const total = groups.reduce((s, g) => s + g.pages.length, 0);
    const picked = () => groups.reduce((s, g) => s + g.pages.filter((_, i) => !(layout.skip[g.n] || []).includes(i)).length, 0);
    const legacyOk = true;   // ใช้ฟอนต์ที่ฝังในแอป (js/thai-fonts.js)
    const z = +layout.zoom;
    pv.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;position:sticky;top:0;background:var(--sheet);z-index:2;padding:4px 0">
        <h3 style="margin:0">ตัวอย่างเล่ม ปพ. <span class="small muted" id="pv-count"></span></h3>
        <div class="row" style="flex-wrap:wrap">
          ${fontSelectHtml('pv-font')}
          <label class="small">ขนาด <select id="pv-zoom">${Object.entries(ZOOM).map(([v, l]) => `<option value="${v}" ${+v === z ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn btn-sm" id="pv-all">เลือกทุกหน้า</button>
          <button class="btn btn-sm" id="pv-reload" title="ดึงข้อมูลล่าสุดของห้องมาใหม่">โหลดข้อมูลใหม่</button>
          <button class="btn btn-primary" id="pv-print">พิมพ์ / บันทึกเป็น PDF</button>
        </div>
      </div>
      <p class="small muted" style="margin:4px 0">${esc(reportHtml(book.data, book.report, true))} · ติ๊กออกเพื่อไม่พิมพ์หน้านั้น · ปุ่มพิมพ์จะเปิดหน้าต่างพิมพ์ของเบราว์เซอร์: เลือกเครื่องพิมพ์ หรือ <b>บันทึกเป็น PDF</b> · กระดาษ A4</p>
      ${legacyOk ? '' : `<p class="small" style="color:var(--amber);margin:4px 0">เครื่องนี้ไม่มีฟอนต์ TH SarabunPSK จึงใช้ฟอนต์ Sarabun แทน รูปร่างตัวอักษรต่างจากที่พิมพ์จาก Excel เล็กน้อย (ตำแหน่งและขนาดตารางเหมือนเดิม) — ติดตั้งฟอนต์ TH SarabunPSK ในเครื่องเพื่อให้เหมือนที่สุด</p>`}
      <div id="pv-body">${groups.map((g) => `
        <section class="pv-sec" data-n="${esc(g.n)}">
          <h4 style="margin:10px 0 4px">${esc(g.n)} <span class="small muted">· ${g.pages.length} หน้า${g.pages[0] ? ` · ${g.pages[0].orient === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'} · ย่อ ${Math.round(g.pages[0].scale * 100)}%` : ''}</span></h4>
          ${g.err ? `<p class="small" style="color:var(--red)">วาดหน้านี้ไม่สำเร็จ: ${esc(g.err)}</p>` : ''}
          <div class="pv-grid">${g.pages.map((p, i) => `
            <label class="pv-card ${(layout.skip[g.n] || []).includes(i) ? 'off' : ''}">
              <span class="pv-cap"><input type="checkbox" data-i="${i}" ${(layout.skip[g.n] || []).includes(i) ? '' : 'checked'}> หน้า ${i + 1}/${g.pages.length}${p.student ? ` · เลขที่ ${p.student}` : ''}</span>
              <span class="pv-box" style="width:${Math.round(p.w * z * 4 / 3)}px;height:${Math.round(p.h * z * 4 / 3)}px"><span class="pv-inner" data-i="${i}" style="transform:scale(${z})"></span></span>
            </label>`).join('')}</div>
        </section>`).join('')}</div>`;
    ensureCss();
    const count = () => { $('#pv-count', pv).textContent = `· พิมพ์ ${picked()} จาก ${total} หน้า`; };
    count();
    // วาดภาพย่อเมื่อเลื่อนมาถึง
    io?.disconnect();
    io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        const el = en.target; io.unobserve(el);
        const sec = el.closest('.pv-sec'); const g = groups.find((x) => x.n === sec.dataset.n);
        el.innerHTML = g.pages[+el.dataset.i].html;
      }
    }, { rootMargin: '600px' });
    $$('.pv-inner', pv).forEach((el) => io.observe(el));
    pv.onchange = (e) => {
      const cb = e.target.closest('input[data-i]'); if (!cb) return;
      const n = cb.closest('.pv-sec').dataset.n; const i = +cb.dataset.i;
      const s = new Set(layout.skip[n] || []); if (cb.checked) s.delete(i); else s.add(i);
      if (s.size) layout.skip[n] = [...s].sort((a, b) => a - b); else delete layout.skip[n];
      cb.closest('.pv-card').classList.toggle('off', !cb.checked);
      store(); count();
    };
    $('#pv-zoom', pv).addEventListener('change', (e) => { layout.zoom = +e.target.value; store(); showPreview(); });
    $('#pv-font', pv).addEventListener('change', (e) => { setThaiFont(e.target.value); book.R = null; book.pages.clear(); showPreview(); });
    $('#pv-all', pv).addEventListener('click', () => { for (const g of groups) delete layout.skip[g.n]; store(); showPreview(); });
    $('#pv-reload', pv).addEventListener('click', () => showPreview(true));
    $('#pv-print', pv).addEventListener('click', async (e) => {
      const list = []; for (const g of groups) g.pages.forEach((p, i) => { if (!(layout.skip[g.n] || []).includes(i)) list.push(p); });
      if (!list.length) { toast('ไม่ได้เลือกหน้าใดเลย', 'err'); return; }
      const btn = e.currentTarget; btn.disabled = true;
      // มือถือ/แท็บเล็ต: เปิดแท็บใหม่ทันที (ต้องเปิดในจังหวะที่กดปุ่ม ไม่งั้นถูกบล็อก)
      const tab = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? window.open('', '_blank') : null;
      try { await printPages(list, fileBase(ctx, room), tab); } catch (err) { toast(`พิมพ์ไม่สำเร็จ: ${err.message}`, 'err'); } finally { btn.disabled = false; }
    });
  }
  $('#b-prev', paper).addEventListener('click', () => { pv.hidden = false; showPreview(); pv.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (book) { pv.hidden = false; showPreview(); }
  wireUpload(paper, ctx, () => bookView(paper, ctx, room));
}

// แผ่นที่มีชื่อ "No" ประจำแผ่น (ไฟล์ต้นฉบับใช้แมโครพิมพ์ทีละคน) → Map(ชื่อแผ่น → {r, c})
function perStudentSheets(t) {
  const out = new Map();
  for (const m of t.wb.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g)) {
    const name = /\sname="([^"]*)"/.exec(m[1])?.[1]; const ls = /\slocalSheetId="(\d+)"/.exec(m[1])?.[1];
    if (!name || name.toLowerCase() !== 'no' || ls === undefined) continue;
    const sheet = t.sheets.find((s) => s.index === +ls); if (!sheet) continue;
    const ref = /!\$?([A-Z]{1,3})\$?(\d+)$/.exec(m[2].replace(/&apos;/g, "'"));
    if (!ref) continue;
    const c = [...ref[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    out.set(sheet.name, { r: +ref[2], c });
  }
  return out;
}
// "1-5, 8" → [1,2,3,4,5,8] (ว่าง = ทุกคน)
function parseWho(s, n) {
  if (!s || !s.trim()) return Array.from({ length: n }, (_, i) => i + 1);
  const out = new Set();
  for (const part of s.split(/[,\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim()); if (!m) continue;
    const a = +m[1]; const b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= Math.max(n, 1)) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

function dropBook() {
  if (book) for (const u of book.urls.values()) if (u) URL.revokeObjectURL(u);
  book = null;
}
const fileBase = (ctx, room) => `ปพ.5 ${roomName(room)} ภาค${ctx.term.term}-${ctx.term.academic_year}`.replace(/[\\/:*?"<>|]+/g, '-');
function reportHtml(data, report, plain = false) {
  const s = `นักเรียน ${data.students.length} คน · ${data.subjects.length} วิชา · ใส่ข้อมูล ${report.written.toLocaleString()} ช่อง`;
  if (plain) return s;
  return `${s}${report.skipped.length ? `<br><span style="color:var(--red)">ช่องที่ไฟล์ต้นฉบับล็อกไว้ (ข้าม): ${esc(report.skipped.join(' · '))}</span>` : ''}
    ${report.missing.length ? `<br>ไม่พบแผ่นงานในไฟล์ต้นฉบับ: ${esc(report.missing.join(', '))}` : ''}
    ${report.warnings.length ? `<br>${report.warnings.map(esc).join('<br>')}` : ''}`;
}

// สไตล์ของตัวอย่าง (ใส่ครั้งเดียว)
export function ensureCss() {
  if (document.getElementById('xl-css')) return;
  const st = document.createElement('style'); st.id = 'xl-css';
  st.textContent = `${XL_CSS}
.pv-grid{display:flex;flex-wrap:wrap;gap:12px}
.pv-card{display:flex;flex-direction:column;gap:4px;cursor:pointer}
.pv-card.off .pv-box{opacity:.35}
.pv-cap{font-size:.85rem;color:var(--ink-soft)}
.pv-box{position:relative;overflow:hidden;background:#fff;box-shadow:var(--shadow);border:1px solid var(--rule-strong);display:block}
.pv-inner{position:absolute;left:0;top:0;transform-origin:0 0;display:block}`;
  document.head.appendChild(st);
}

// พิมพ์ผ่าน iframe แยก: กระดาษ A4 ไม่มีระยะขอบของเบราว์เซอร์ หน้าแนวนอนใช้หน้ากระดาษแนวนอน
export async function printPages(list, title, tab = null) {
  let ifr = null; let doc;
  if (tab) doc = tab.document;
  else {
    ifr = document.createElement('iframe');
    ifr.setAttribute('aria-hidden', 'true');
    ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    document.body.appendChild(ifr);
    doc = ifr.contentDocument;
  }
  const fontLink = 'https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,400;0,700;1,400;1,700&display=swap';
  doc.open();
  doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="${fontLink}">
<style>${fontFaceCss()}
${XL_CSS}
@page{size:A4 portrait;margin:0} @page xl-land{size:A4 landscape;margin:0}
html,body{margin:0;padding:0;background:#fff}
.pg{break-after:page;page-break-after:always;overflow:hidden;position:relative;width:210mm;height:297mm}
.pg:last-child{break-after:auto;page-break-after:auto}
.pg.land{page:xl-land;width:297mm;height:210mm}
</style></head><body>${list.map((p) => `<div class="pg ${p.orient === 'landscape' ? 'land' : ''}">${p.html}</div>`).join('')}</body></html>`);
  doc.close();
  const win = tab || ifr.contentWindow;
  try { await Promise.race([win.document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]); } catch { /* */ }
  await Promise.all([...doc.images].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; setTimeout(r, 4000); }))));
  await new Promise((r) => setTimeout(r, 150));
  if (tab) { win.focus(); win.print(); return; }   // แท็บใหม่: ผู้ใช้ปิดเองได้ หรือสั่งพิมพ์ซ้ำจากเมนูเบราว์เซอร์
  const cleanup = () => setTimeout(() => ifr.remove(), 1000);
  win.addEventListener('afterprint', cleanup, { once: true });
  win.focus(); win.print();
  setTimeout(() => { if (document.body.contains(ifr)) ifr.remove(); }, 120000);
}

function wireUpload(paper, ctx, again) {
  $('#tpl-up', paper)?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const t = await Template.open(bytes);
      const need = ['รายวิชา', 'ปก ปพ.5 รายชั้น', 'วิชาที่ 1'];
      const lack = need.filter((n) => !t.sheet(n));
      if (lack.length && !await confirmBox(`ไฟล์นี้ไม่มีแผ่นงาน ${lack.join(', ')} อาจไม่ใช่ไฟล์โปรแกรม ปพ.5-6 ที่ระบบรองรับ ต้องการอัปโหลดต่อหรือไม่?`, 'อัปโหลดต่อ')) return;
      toast('กำลังอัปโหลด…');
      await ctx.db.files.upload(PATH, new Blob([bytes], { type: 'application/octet-stream' }));
      await ctx.db.upsert('school_settings', [{ id: 1, pp_template_name: file.name }], 'id');
      await ctx.refresh();
      cache = { at: null, bytes: null, t: null }; dropBook();
      toast(`อัปโหลดแล้ว: ${file.name} (${t.sheets.length} แผ่นงาน)`);
      again();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#tpl-del', paper)?.addEventListener('click', async () => {
    if (!await confirmBox('ลบไฟล์ต้นฉบับออกจากระบบ? (ไม่กระทบข้อมูลนักเรียน)', 'ลบ')) return;
    try { await ctx.db.files.remove(PATH); await ctx.db.upsert('school_settings', [{ id: 1, pp_template_name: null }], 'id'); await ctx.refresh(); cache = { at: null, bytes: null, t: null }; dropBook(); again(); }
    catch (err) { toast(err.message, 'err'); }
  });
}
void hasLocalFont;
