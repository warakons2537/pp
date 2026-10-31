// =====================================================================
//  วาดแผ่นงาน Excel เป็นหน้ากระดาษ A4 (HTML) ให้เหมือนสั่งพิมพ์จาก Excel
//  - ความกว้างคอลัมน์/ความสูงแถวแบบ Excel · พื้นที่พิมพ์ · หัวตารางซ้ำ · ตัวแบ่งหน้า
//  - ย่อ/ขยาย (scale) และ "พอดีหน้า" (fit to page) · จัดกึ่งกลางหน้า · ระยะขอบ
//  - ผสานเซลล์ · เส้นขอบ · สีพื้น · ฟอนต์ · การจัดแนว/ตัดบรรทัด/ข้อความล้นเซลล์ · หมุนข้อความ
//  - รูปแบบตัวเลข · การจัดรูปแบบตามเงื่อนไข · รูปภาพ/รูปร่าง/กล่องข้อความ
// =====================================================================
import { MAXCOL, XErr, Mat } from './xl-formula.js?v=2569.10.31-8';
import { formatValue, isDateFormat } from './xl-numfmt.js?v=2569.10.31-8';
import { parseDrawing, key } from './xl-model.js?v=2569.10.31-8';
import { shiftFormula } from './xlsx-template.js?v=2569.10.31-8';

export const PAPER = { 9: [595.28, 841.89], 1: [612, 792], 5: [612, 1008], 8: [841.89, 1190.55], 11: [419.53, 595.28] };
const PT_PER_PX = 0.75; const EMU_PER_PT = 12700;
const BLEED = 1.5;   // pt
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (x) => Math.round(x * 100) / 100;

// ฟอนต์ไทยแบบเก่า (ตัวเล็กในกรอบใหญ่) ถ้าเครื่องไม่มี จะใช้ Sarabun แล้วย่อให้ขนาดใกล้เคียง
const THAI_LEGACY = /^(TH ?Sarabun|THSarabun|TH ?Niramit|TH ?Kodchasal|TH ?Krub|TH ?Charm|TH ?Baijam|TH ?Fah ?kwang|TH ?Chakra|TH ?K2D|TH ?Mali|TH ?Srisakdi|TH ?Kanit|TH ?Charmonman|Angsana|AngsanaUPC|Browallia|BrowalliaUPC|Cordia|CordiaUPC|Eucrosia|Freesia|IrisUPC|Jasmine|Kodchiang|Lily)/i;
// ความกว้างตัวเลขเฉลี่ยต่อ em (ใช้หา MDW ของฟอนต์มาตรฐาน)
const DIGIT_EM = { arial: 0.556, calibri: 0.507, tahoma: 0.546, 'times new roman': 0.5, cambria: 0.556, 'th sarabunpsk': 0.38, 'th sarabun new': 0.38, 'angsana new': 0.34, cordiaupc: 0.34, 'cordia new': 0.34 };

// ฟอนต์ราชการที่ฝังในแอป (js/thai-fonts.js): ใช้แทน TH Sarabun ทุกแบบในแบบพิมพ์
let THAI_FACE = null;
const SARABUN = /^(TH ?Sarabun|THSarabun)/i;
export function setThaiFace(family) { THAI_FACE = family || null; }
const embedded = (name) => !!THAI_FACE && SARABUN.test(name || '');

export function fontStack(name) {
  const n = name || 'Calibri';
  if (embedded(n)) return `'${THAI_FACE}','${n}','TH SarabunPSK','Sarabun',sans-serif`;
  if (THAI_LEGACY.test(n)) return `'${n}','TH SarabunPSK','TH Sarabun New','THSarabunNew','XL Thai Fallback','Sarabun',sans-serif`;
  if (/^Arial Black$/i.test(n)) return "'Arial Black','Arial',sans-serif";
  if (/^(Arial|Helvetica|FreeSans|Liberation Sans)$/i.test(n)) return `'${n}','Arial','Liberation Sans','Helvetica',sans-serif`;
  if (/^Tahoma$/i.test(n)) return "'Tahoma','Verdana','DejaVu Sans',sans-serif";
  if (/^Calibri$/i.test(n)) return "'Calibri','Carlito',sans-serif";
  if (/^Times/i.test(n)) return "'Times New Roman','Liberation Serif',serif";
  return `'${n}','Sarabun',sans-serif`;
}

// ---------------------------------------------------------------------
//  วัดความกว้างข้อความ
// ---------------------------------------------------------------------
let canvasCtx = null;
export function makeMeasurer({ legacyAvailable = () => true } = {}) {
  if (typeof document === 'undefined') {
    return (text, font) => [...String(text)].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length * (font.sz || 11) * (THAI_LEGACY.test(font.name || '') ? 0.36 : 0.55);
  }
  return (text, font) => {
    if (!canvasCtx) canvasCtx = document.createElement('canvas').getContext('2d');
    const sz = (font.sz || 11) * (THAI_LEGACY.test(font.name || '') && !embedded(font.name) && !legacyAvailable(font.name) ? THAI_ADJ : 1);
    canvasCtx.font = `${font.i ? 'italic ' : ''}${font.b ? 'bold ' : ''}${sz}pt ${fontStack(font.name)}`;
    return canvasCtx.measureText(String(text)).width * PT_PER_PX * (96 / 72) * (72 / 96);
  };
}
// ตรวจว่าเครื่องนี้มีฟอนต์ติดตั้งอยู่หรือไม่ (เทียบความกว้างกับฟอนต์สำรอง)
const fontHas = new Map();
export function hasLocalFont(name) {
  if (typeof document === 'undefined') return false;
  if (fontHas.has(name)) return fontHas.get(name);
  const ctx = document.createElement('canvas').getContext('2d'); const txt = 'กขคงจฉ abcdefgWMi 0123456789 สวัสดีครับ';
  let ok = false;
  for (const base of ['monospace', 'serif']) {
    ctx.font = `32px ${base}`; const a = ctx.measureText(txt).width;
    ctx.font = `32px '${name}',${base}`; const b = ctx.measureText(txt).width;
    if (Math.abs(a - b) > 0.5) { ok = true; break; }
  }
  fontHas.set(name, ok);
  return ok;
}
export function legacyThaiAvailable(name) {
  return hasLocalFont(name) || ['TH SarabunPSK', 'TH Sarabun New', 'THSarabunNew'].some((n) => hasLocalFont(n));
}
// อัตราย่อเมื่อใช้ Sarabun แทน TH SarabunPSK (x-height ของ Sarabun ใหญ่กว่า)
export const THAI_ADJ = 0.74;

// ---------------------------------------------------------------------
//  ตัววาด
// ---------------------------------------------------------------------
export class Renderer {
  /**
   * @param wb Workbook · eng Engine
   * @param opts { measure, imageUrl(path) → url, legacyAvailable(name) → bool }
   */
  constructor(wb, eng, opts = {}) {
    this.wb = wb; this.eng = eng; this.st = wb.styles;
    const la = opts.legacyAvailable || (() => true);
    this.legacyAvailable = (n) => embedded(n) || la(n);
    this.measure = opts.measure || makeMeasurer({ legacyAvailable: this.legacyAvailable });
    this.imageUrl = opts.imageUrl || (() => null);
    const nf = this.st.normalFont || { name: 'Calibri', sz: 11 };
    const em = DIGIT_EM[(nf.name || '').toLowerCase()] ?? 0.55;
    // Excel คิดความกว้างคอลัมน์เป็นพิกเซลของหน้าจอ แล้วพิมพ์โดยถือว่า 96 พิกเซล/นิ้ว
    // ไฟล์ ปพ. ต้นฉบับจัดหน้าบนจอที่ตั้งขนาด 125% (120 dpi) จึงใช้ค่าเริ่มต้นนี้ (ตรวจกับค่า scale ที่ Excel บันทึกไว้)
    this.dpi = opts.dpi || 120;
    this.mdw = opts.mdw || Math.max(5, Math.round((nf.sz || 11) * (this.dpi / 72) * em));
    this.geo = new Map();
  }

  // ---- เรขาคณิตของแผ่น ----
  geometry(sh) {
    let g = this.geo.get(sh.name); if (g) return g;
    const mdw = this.mdw;
    const pxOfWidth = (w) => Math.trunc(((256 * w + Math.trunc(128 / mdw)) / 256) * mdw);
    const defW = sh.defaultColWidth ?? (Math.trunc(((sh.baseColWidth ?? 8) * mdw + 5) / mdw * 256) / 256);
    const colW = new Map();
    for (const c of sh.cols) for (let i = c.min; i <= Math.min(c.max, 16384); i++) colW.set(i, c.hidden ? 0 : pxOfWidth(c.width ?? defW) * PT_PER_PX);
    const defColPt = pxOfWidth(defW) * PT_PER_PX;
    const defRowPt = sh.zeroHeight ? 0 : sh.defaultRowHeight;
    const colStyle = new Map(); for (const c of sh.cols) if (c.style) for (let i = c.min; i <= Math.min(c.max, 16384); i++) colStyle.set(i, c.style);
    g = {
      cw: (c) => (colW.has(c) ? colW.get(c) : defColPt),
      rh: (r) => { const x = sh.rows.get(r); if (x) { if (x.hidden) return 0; if (x.ht !== null) return x.ht; } return defRowPt; },
      colStyle,
    };
    // ตำแหน่งสะสม (ใช้วางรูปวาด)
    const cx = [0]; const ry = [0];
    g.x = (c) => { while (cx.length <= c) cx.push(cx[cx.length - 1] + g.cw(cx.length)); return cx[c - 1]; };
    g.y = (r) => { while (ry.length <= r) ry.push(ry[ry.length - 1] + g.rh(ry.length)); return ry[r - 1]; };
    // ผสานเซลล์
    g.mergeAt = new Map(); g.inMerge = new Map();
    for (const m of sh.merges) {
      g.mergeAt.set(key(m.r1, m.c1), m);
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) g.inMerge.set(key(r, c), m);
    }
    this.geo.set(sh.name, g);
    return g;
  }

  styleIndex(sh, g, r, c, cell) {
    if (cell && cell.s !== undefined && !(cell.pending)) return cell.s;
    const row = sh.rows.get(r); if (row && row.style !== null && row.style !== undefined) return row.style;
    return g.colStyle.get(c) || 0;
  }

  // ---- ขอบเขตที่จะพิมพ์ ----
  usedRange(sh) {
    let r2 = 1; let c2 = 1;
    for (const [k, cell] of sh.cells) {
      if (cell.v === null && !cell.f && !cell.s) continue;
      const r = Math.floor(k / MAXCOL); const c = k % MAXCOL;
      if (cell.v === null && !cell.f) { const xf = this.st.cellXfs[cell.s]; if (!xf || (!xf.fillId && !xf.borderId)) continue; }
      if (r > r2) r2 = r; if (c > c2) c2 = c;
    }
    return { r1: 1, c1: 1, r2, c2 };
  }

  /**
   * แบ่งหน้า
   * @returns { pages: [{ rows:[[a,b]...], cols:[[a,b]...] }], scale, paper:{w,h}, orient, area }
   */
  paginate(name, { orientation = null, fit = null } = {}) {
    const sh = this.wb.sheet(name); if (!sh) return null;
    const g = this.geometry(sh);
    const info = this.wb.printInfo(name);
    const areas = info.areas.length ? info.areas.map((a) => ({ ...a, r2: Math.min(a.r2, Math.max(sh.maxRow, a.r1)), c2: Math.min(a.c2, Math.max(sh.maxCol, a.c1)) })) : [this.usedRange(sh)];
    const orient = orientation || sh.page.orientation || 'portrait';
    const base = PAPER[sh.page.paperSize] || PAPER[9];
    const paper = orient === 'landscape' ? { w: base[1], h: base[0] } : { w: base[0], h: base[1] };
    const m = sh.page.margins;
    const hasHF = !!(sh.headerFooter.oddHeader || sh.headerFooter.oddFooter);
    const top = m.top * 72; const bottom = m.bottom * 72;
    const availW = paper.w - (m.left + m.right) * 72; const availH = paper.h - top - bottom;
    const titles = info.titles;
    const sumW = (a, b) => { let s = 0; for (let c = a; c <= b; c++) s += g.cw(c); return s; };
    const sumH = (a, b) => { let s = 0; for (let r = a; r <= b; r++) s += g.rh(r); return s; };

    const split = (a, b, size, avail, manual, tit) => {
      // แบ่งช่วง [a,b] ให้แต่ละหน้าไม่เกิน avail (หน่วยก่อนย่อ) · tit = [t1,t2] หัวซ้ำ
      const segs = []; let start = a;
      const titleSize = tit ? (() => { let s = 0; for (let i = tit[0]; i <= tit[1]; i++) s += size(i); return s; })() : 0;
      while (start <= b) {
        const withTitle = tit && start > tit[1];
        let budget = avail - (withTitle ? titleSize : 0);
        let end = start; let used = size(start);
        while (end < b) {
          if (manual && manual.has(end)) break;
          const nx = size(end + 1);
          if (used + nx > budget + 0.01) break;
          used += nx; end++;
        }
        // ข้ามช่วงที่ซ่อนทั้งหมด
        let vis = false; for (let i = start; i <= end; i++) if (size(i) > 0) { vis = true; break; }
        if (vis) segs.push({ a: start, b: end, title: withTitle ? tit : null });
        start = end + 1;
      }
      return segs;
    };
    const run = (scale, useManual) => {
      const pages = [];
      for (const ar of areas) {
        const titR = titles.rows && titles.rows[0] <= ar.r2 ? [Math.max(titles.rows[0], 1), titles.rows[1]] : null;
        const titC = titles.cols ? [titles.cols[0], titles.cols[1]] : null;
        const rowSegs = split(ar.r1, ar.r2, g.rh, availH / scale, useManual ? new Set(sh.rowBreaks) : null, titR);
        const colSegs = split(ar.c1, ar.c2, g.cw, availW / scale, useManual ? new Set(sh.colBreaks) : null, titC);
        const order = sh.page.pageOrder === 'overThenDown';
        const outer = order ? rowSegs : colSegs; const inner = order ? colSegs : rowSegs;
        for (const o of outer) for (const i of inner) pages.push({ rs: order ? o : i, cs: order ? i : o, area: ar });
        pages.colCount = (pages.colCount || 0) + colSegs.length; pages.rowCount = Math.max(pages.rowCount || 0, rowSegs.length);
      }
      return pages;
    };
    // fit: null = ตามไฟล์ · 'page' = พอดี 1 หน้า · 'width' = พอดีความกว้าง 1 หน้า · 'none' = 100% แบ่งหน้าตามตัวแบ่งเดิม
    let scale = fit === 'none' ? 1 : Math.max(0.1, Math.min(4, (sh.page.scale || 100) / 100));
    let pages;
    const doFit = fit === 'page' || fit === 'width' || (fit === null && sh.page.fitToPage);
    if (doFit) {
      const fw = fit === 'page' || fit === 'width' ? 1 : sh.page.fitToWidth; const fh = fit === 'page' ? 1 : fit === 'width' ? 0 : sh.page.fitToHeight;
      // เริ่มจากค่าประมาณแล้วลดทีละ 1%
      let p = 100;
      if (areas.length === 1) {
        const ar = areas[0];
        const W = sumW(ar.c1, ar.c2); const H = sumH(ar.r1, ar.r2);
        const cand = [];
        // เผื่อเส้นขอบนอกสุด (BLEED) ไม่ให้ชนขอบกระดาษ
        if (fw > 0) cand.push((availW - 2 * BLEED) * fw / W); if (fh > 0) cand.push((availH - 2 * BLEED) * fh / H);
        if (cand.length) p = Math.min(100, Math.floor(Math.min(...cand) * 100 + 1e-9));
      }
      p = Math.max(10, p);
      for (;;) {
        pages = run(p / 100, false);
        const okW = !fw || pages.colCount <= fw; const okH = !fh || pages.rowCount <= fh;
        if ((okW && okH) || p <= 10) break;
        p--;
      }
      scale = p / 100;
    } else pages = run(scale, true);
    return { pages, scale, paper, orient, availW, availH, top, left: m.left * 72, hasHF, sh, g };
  }

  // ---- วาดทุกหน้าของแผ่น ----
  renderSheet(name, opts = {}) {
    const pg = this.paginate(name, opts); if (!pg) return [];
    return pg.pages.map((p, i) => ({ sheet: name, index: i, count: pg.pages.length, orient: pg.orient, w: pg.paper.w, h: pg.paper.h, scale: pg.scale, html: this.renderPage(pg, p, i, pg.pages.length) }));
  }

  renderPage(pg, p, pageNo, pageCount) {
    const { sh, g, scale } = pg;
    // แบ่งบล็อก: (หัวแถวซ้ำ?) × (หัวคอลัมน์ซ้ำ?)
    const rowBlocks = []; const colBlocks = [];
    if (p.rs.title) rowBlocks.push({ a: p.rs.title[0], b: p.rs.title[1] });
    rowBlocks.push({ a: p.rs.a, b: p.rs.b });
    if (p.cs.title) colBlocks.push({ a: p.cs.title[0], b: p.cs.title[1] });
    colBlocks.push({ a: p.cs.a, b: p.cs.b });
    let y = 0; for (const b of rowBlocks) { b.off = y; b.size = 0; for (let r = b.a; r <= b.b; r++) b.size += g.rh(r); y += b.size; }
    let x = 0; for (const b of colBlocks) { b.off = x; b.size = 0; for (let c = b.a; c <= b.b; c++) b.size += g.cw(c); x += b.size; }
    const contentW = x; const contentH = y;
    let ox = pg.left; let oy = pg.top;
    if (sh.page.hCenter) ox = pg.left + Math.max(0, (pg.availW - contentW * scale) / 2);
    if (sh.page.vCenter) oy = pg.top + Math.max(0, (pg.availH - contentH * scale) / 2);
    const parts = [];
    for (const rb of rowBlocks) for (const cb of colBlocks) parts.push(this.renderBlock(sh, g, rb, cb, p.area));
    let hf = '';
    if (sh.headerFooter.oddHeader) hf += this.headerFooter(sh.headerFooter.oddHeader, 'top', pg, pageNo, pageCount);
    if (sh.headerFooter.oddFooter) hf += this.headerFooter(sh.headerFooter.oddFooter, 'bottom', pg, pageNo, pageCount);
    return `<div class="xl-page" style="width:${f2(pg.paper.w)}pt;height:${f2(pg.paper.h)}pt"><div class="xl-content" style="left:${f2(ox)}pt;top:${f2(oy)}pt;width:${f2(contentW)}pt;height:${f2(contentH)}pt;transform:scale(${scale})">${parts.join('')}</div>${hf}</div>`;
  }

  headerFooter(code, where, pg, pageNo, pageCount) {
    const sec = { L: '', C: '', R: '' }; let cur = 'C';
    let out = ''; let font = { sz: 11 };
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch !== '&') { out += ch; continue; }
      const n = code[i + 1];
      if ('LCR'.includes(n)) { sec[cur] += out; out = ''; cur = n; i++; continue; }
      if (n === 'P') { out += String(pageNo + 1); i++; continue; }
      if (n === 'N') { out += String(pageCount); i++; continue; }
      if (n === 'A') { out += pg.sh.name; i++; continue; }
      if (n === 'D') { out += new Date().toLocaleDateString('th-TH'); i++; continue; }
      if (n === 'T') { out += new Date().toLocaleTimeString('th-TH'); i++; continue; }
      if (n === 'F') { i++; continue; }
      if (n === '&') { out += '&'; i++; continue; }
      if (n === '"') { const j = code.indexOf('"', i + 2); i = j; continue; }
      const m = /^\d+/.exec(code.slice(i + 1)); if (m) { font = { sz: +m[0] }; i += m[0].length; continue; }
      i++;
    }
    sec[cur] += out;
    const m = pg.sh.page.margins; const posY = where === 'top' ? m.header * 72 : pg.paper.h - m.footer * 72 - font.sz * 1.3;
    return ['L', 'C', 'R'].filter((k) => sec[k]).map((k) => `<div class="xl-hf" style="top:${f2(posY)}pt;left:${f2(m.left * 72)}pt;right:${f2(m.right * 72)}pt;text-align:${{ L: 'left', C: 'center', R: 'right' }[k]};font-size:${font.sz}pt">${esc(sec[k])}</div>`).join('');
  }

  // ---- เนื้อหาในบล็อกเดียว (ตัดขอบด้วย overflow:hidden) ----
  renderBlock(sh, g, rb, cb, area) {
    const name = sh.name;
    const xs = new Map(); const ys = new Map();
    { let x = 0; for (let c = cb.a; c <= cb.b; c++) { xs.set(c, x); x += g.cw(c); } xs.set(cb.b + 1, x); }
    { let y = 0; for (let r = rb.a; r <= rb.b; r++) { ys.set(r, y); y += g.rh(r); } ys.set(rb.b + 1, y); }
    const X = (c) => { if (xs.has(c)) return xs.get(c); if (c < cb.a) { let s = 0; for (let i = c; i < cb.a; i++) s -= g.cw(i); return s; } let s = xs.get(cb.b + 1); for (let i = cb.b + 1; i < c; i++) s += g.cw(i); return s; };
    const Y = (r) => { if (ys.has(r)) return ys.get(r); if (r < rb.a) { let s = 0; for (let i = r; i < rb.a; i++) s -= g.rh(i); return s; } let s = ys.get(rb.b + 1); for (let i = rb.b + 1; i < r; i++) s += g.rh(i); return s; };
    const fills = []; const texts = []; const hEdges = new Map(); const vEdges = new Map(); const diags = [];
    const st = this.st;
    const cfCache = new Map();
    const valueOf = (r, c) => this.eng.value(name, r, c);
    const isEmpty = (r, c) => {
      const cell = sh.cells.get(key(r, c));
      if (g.inMerge.has(key(r, c))) return false;
      if (!cell) return true;
      const v = cell.f || cell.master !== undefined ? valueOf(r, c) : cell.v;
      return v === null || v === undefined || (v === '' && !cell.f && cell.master === undefined);
    };
    const rStart = Math.max(1, rb.a); const cStart = Math.max(1, cb.a);
    // เซลล์ผสานที่เริ่มนอกบล็อกแต่ทับเข้ามา
    const extraMerges = [];
    for (const m of sh.merges) if ((m.r1 < rStart || m.c1 < cStart) && m.r2 >= rb.a && m.c2 >= cb.a && m.r1 <= rb.b && m.c1 <= cb.b) extraMerges.push(m);
    const todo = [];
    for (let r = rStart; r <= rb.b; r++) {
      if (g.rh(r) <= 0) continue;
      for (let c = cStart; c <= cb.b; c++) {
        if (g.cw(c) <= 0 && !g.mergeAt.has(key(r, c))) continue;
        const k = key(r, c); const mm = g.inMerge.get(k);
        if (mm && (mm.r1 !== r || mm.c1 !== c)) { this.collectBorders(sh, g, r, c, mm, hEdges, vEdges); continue; }
        todo.push([r, c]);
      }
    }
    for (const m of extraMerges) todo.push([m.r1, m.c1, true]);
    for (const [r, c, outside] of todo) {
      const k = key(r, c); const cell = sh.cells.get(k);
      const mm = g.mergeAt.get(k);
      if (!outside) this.collectBorders(sh, g, r, c, mm, hEdges, vEdges);
      const si = this.styleIndex(sh, g, r, c, cell); const xf = st.cellXfs[si] || st.cellXfs[0] || {};
      let v = cell ? (cell.f || cell.master !== undefined ? valueOf(r, c) : cell.v) : null;
      if (v instanceof Mat) v = v.at(0, 0);
      // การจัดรูปแบบตามเงื่อนไข
      const cf = sh.cf.length ? this.condFormat(sh, r, c, v, cfCache) : null;
      const x0 = X(c); const y0 = Y(r);
      const w = mm ? X(mm.c2 + 1) - x0 : g.cw(c); const h = mm ? Y(mm.r2 + 1) - y0 : g.rh(r);
      // พื้น
      const fill = cf?.fill && cf.fill.type !== 'none' ? cf.fill : st.fills[xf.fillId];
      const bg = fillCss(fill);
      if (bg) {
        const last = fills[fills.length - 1];
        if (last && !mm && !last.m && last.bg === bg && last.y0 === y0 && last.h === h && Math.abs(last.x0 + last.w - x0) < 0.01) last.w += w;
        else fills.push({ x0, y0, w, h, bg, m: !!mm });
      }
      // เส้นทแยง
      const bd = st.borders[xf.borderId];
      if (bd && (bd.diagUp || bd.diagDown) && bd.diagonal) diags.push({ x0, y0, w, h, up: bd.diagUp, down: bd.diagDown, b: bd.diagonal });
      // ข้อความ
      if (v === null || v === undefined || v === '') continue;
      if (typeof v === 'number' && v === 0 && !sh.showZeros) continue;
      if (xf.hidden && sh.protected && false) continue;
      const font = { ...(st.fonts[xf.fontId] || {}), ...(cf?.font || {}) };
      const code = cf?.numFmt || st.numFmts[xf.numFmtId] || 'General';
      const fmt = formatValue(v, code);
      if (fmt.text === '' && !(v instanceof String && v.runs)) continue;
      texts.push(this.textHtml({ sh, g, r, c, v, fmt, font, xf, x0, y0, w, h, merged: !!mm, isEmpty, X, Y, cb, code }));
    }
    // เส้นขอบ (รวมเส้นที่ต่อกันและเหมือนกันเป็นเส้นเดียว เพื่อให้หน้าเบา)
    const lines = [];
    const same = (a, b) => a.style === b.style && (a.color?.hex || '') === (b.color?.hex || '');
    const hk = [...hEdges.keys()].filter((k) => { const r = Math.floor(k / MAXCOL); const c = k % MAXCOL; return c >= cb.a && c <= cb.b && r >= rb.a && r <= rb.b + 1; }).sort((a, b) => a - b);
    for (let i = 0; i < hk.length;) {
      const k = hk[i]; const e = hEdges.get(k); const r = Math.floor(k / MAXCOL); const c = k % MAXCOL;
      let j = i + 1; let len = g.cw(c);
      while (j < hk.length && hk[j] === k + (j - i) && same(hEdges.get(hk[j]), e)) { len += g.cw(c + (j - i)); j++; }
      if (len > 0) lines.push(edgeHtml('h', X(c), Y(r), len, e));
      i = j;
    }
    const vk = [...vEdges.keys()].filter((k) => { const r = Math.floor(k / MAXCOL); const c = k % MAXCOL; return r >= rb.a && r <= rb.b && c >= cb.a && c <= cb.b + 1; })
      .sort((a, b) => (a % MAXCOL) - (b % MAXCOL) || a - b);
    for (let i = 0; i < vk.length;) {
      const k = vk[i]; const e = vEdges.get(k); const r = Math.floor(k / MAXCOL); const c = k % MAXCOL;
      let j = i + 1; let len = g.rh(r);
      while (j < vk.length && vk[j] === k + (j - i) * MAXCOL && same(vEdges.get(vk[j]), e)) { len += g.rh(r + (j - i)); j++; }
      if (len > 0) lines.push(edgeHtml('v', X(c), Y(r), len, e));
      i = j;
    }
    for (const d of diags) {
      const col = cssColor(d.b.color) || '#000'; const sw = borderWidth(d.b.style);
      lines.push(`<svg class="xl-d" style="left:${f2(d.x0)}pt;top:${f2(d.y0)}pt;width:${f2(d.w)}pt;height:${f2(d.h)}pt" viewBox="0 0 ${f2(d.w)} ${f2(d.h)}" preserveAspectRatio="none">${d.down ? `<line x1="0" y1="0" x2="${f2(d.w)}" y2="${f2(d.h)}" stroke="${col}" stroke-width="${sw}"/>` : ''}${d.up ? `<line x1="0" y1="${f2(d.h)}" x2="${f2(d.w)}" y2="0" stroke="${col}" stroke-width="${sw}"/>` : ''}</svg>`);
    }
    // รูปวาด
    const draws = this.drawingsHtml(sh, g, rb, cb, X, Y);
    const fillHtml = fills.map((f) => `<div class="xl-f" style="left:${f2(f.x0)}pt;top:${f2(f.y0)}pt;width:${f2(f.w)}pt;height:${f2(f.h)}pt;background:${f.bg}"></div>`).join('');
    // เผื่อขอบ BLEED รอบบล็อก ให้เส้นขอบด้านนอกสุดของตารางไม่ถูกตัดครึ่ง
    return `<div class="xl-blk" style="left:${f2(cb.off - BLEED)}pt;top:${f2(rb.off - BLEED)}pt;width:${f2(cb.size + 2 * BLEED)}pt;height:${f2(rb.size + 2 * BLEED)}pt"><div class="xl-in">${fillHtml}${lines.join('')}${texts.join('')}${draws}</div></div>`;
  }

  collectBorders(sh, g, r, c, mm, hEdges, vEdges) {
    const cell = sh.cells.get(key(r, c));
    const si = this.styleIndex(sh, g, r, c, cell);
    const xf = this.st.cellXfs[si]; if (!xf || !xf.borderId) return;
    const b = this.st.borders[xf.borderId]; if (!b) return;
    const inM = mm || g.inMerge.get(key(r, c));
    const put = (map, k, e) => { if (!e) return; const o = map.get(k); if (!o || borderRank(e.style) > borderRank(o.style)) map.set(k, e); };
    // ภายในเซลล์ผสานไม่วาดเส้น
    if (!inM || r === inM.r1) put(hEdges, key(r, c), b.top);
    if (!inM || r === inM.r2) put(hEdges, key(r + 1, c), b.bottom);
    if (!inM || c === inM.c1) put(vEdges, key(r, c), b.left);
    if (!inM || c === inM.c2) put(vEdges, key(r, c + 1), b.right);
  }

  condFormat(sh, r, c, v, cache) {
    let res = null; const done = {};
    for (const rule of sh.cf) {
      const rg = rule.ranges.find((q) => r >= q.r1 && r <= q.r2 && c >= q.c1 && c <= q.c2);
      if (!rg) continue;
      const base = rule.ranges[0];
      const ev = (f) => this.eng.evalAt(shiftFormula(f, r - base.r1, c - base.c1), sh.name, r, c);
      let hit = false;
      try {
        if (rule.type === 'cellIs') {
          const a = ev(rule.formulas[0]); const b = rule.formulas[1] !== undefined ? ev(rule.formulas[1]) : null;
          const val = v === null || v === undefined ? 0 : v;
          const cmp = (x, y) => { if (x instanceof XErr || y instanceof XErr) return NaN; if (typeof x === typeof y) return x < y ? -1 : x > y ? 1 : 0; return typeof x === 'number' ? -1 : 1; };
          const k = cmp(typeof val === 'string' ? val.toLowerCase() : val, typeof a === 'string' ? a.toLowerCase() : a);
          switch (rule.operator) {
            case 'equal': hit = k === 0; break; case 'notEqual': hit = k !== 0; break;
            case 'greaterThan': hit = k > 0; break; case 'lessThan': hit = k < 0; break;
            case 'greaterThanOrEqual': hit = k >= 0; break; case 'lessThanOrEqual': hit = k <= 0; break;
            case 'between': hit = k >= 0 && cmp(val, b) <= 0; break; case 'notBetween': hit = k < 0 || cmp(val, b) > 0; break;
            default:
          }
          if (v instanceof XErr) hit = false;
        } else if (rule.type === 'containsText' || rule.type === 'notContainsText' || rule.type === 'beginsWith' || rule.type === 'endsWith' || rule.type === 'expression') {
          const x = ev(rule.formulas[0]);
          hit = x === true || (typeof x === 'number' && x !== 0);
        } else if (rule.type === 'containsBlanks') hit = v === null || v === undefined || String(v).trim() === '';
        else if (rule.type === 'notContainsBlanks') hit = !(v === null || v === undefined || String(v).trim() === '');
        else if (rule.type === 'containsErrors') hit = v instanceof XErr;
        else if (rule.type === 'notContainsErrors') hit = !(v instanceof XErr);
      } catch { hit = false; }
      if (!hit) continue;
      const d = this.st.dxfs[rule.dxfId]; if (!d) { if (rule.stopIfTrue) break; continue; }
      res = res || {};
      if (d.font && !done.font) { res.font = {}; for (const [kk, vv] of Object.entries(d.font)) if (vv !== undefined && vv !== null) res.font[kk] = vv; done.font = true; }
      if (d.fill && !done.fill && d.fill.type !== 'none') { res.fill = d.fill; done.fill = true; }
      if (d.numFmt && !done.numFmt) { res.numFmt = d.numFmt; done.numFmt = true; }
      if (rule.stopIfTrue) break;
    }
    void cache;
    return res;
  }

  // ---- ข้อความในเซลล์ ----
  textHtml({ sh, g, r, c, v, fmt, font, xf, x0, y0, w, h, merged, isEmpty, X, code }) {
    const al = xf.align || {};
    const isNum = typeof v === 'number';
    let hAlign = al.h || 'general';
    if (hAlign === 'general') hAlign = isNum ? 'right' : (typeof v === 'boolean' || v instanceof XErr ? 'center' : 'left');
    if (hAlign === 'centerContinuous') hAlign = 'center';
    const vAlign = al.v || 'bottom';
    const wrap = !!al.wrap || hAlign === 'justify' || hAlign === 'distributed' || vAlign === 'justify' || vAlign === 'distributed';
    const rot = al.rot || 0;
    const pad = 2 * PT_PER_PX;
    const indent = (al.indent || 0) * 3 * this.mdw * PT_PER_PX;
    let text = fmt.text;
    const fSz = font.sz || 11;
    const fontForMeasure = { ...font };
    // ตัวเลขที่ไม่พอดีเซลล์ → ย่อทศนิยม (General) หรือ ####
    if (isNum && !wrap && !rot) {
      const avail = w - 2 * pad;
      if (this.measure(text, fontForMeasure) > avail + 0.5) {
        if (fmt.general) {
          let ok = false;
          for (let p = 10; p >= 1; p--) {
            const t = generalShort(v, p);
            if (this.measure(t, fontForMeasure) <= avail + 0.5) { text = t; ok = true; break; }
          }
          if (!ok) text = '#'.repeat(Math.max(1, Math.floor(avail / Math.max(1, this.measure('#', fontForMeasure)))));
        } else text = '#'.repeat(Math.max(1, Math.floor(avail / Math.max(1, this.measure('#', fontForMeasure)))));
      }
    }
    if (isNum && isDateFormat(code) && /^#+$/.test(text) === false) { /* วันที่ยาวเกินก็เป็น #### ตามข้างบน */ }
    // ข้อความล้นไปเซลล์ข้างเคียง (เฉพาะไม่ตัดบรรทัด ไม่ผสาน ไม่หมุน และไม่ใช่ตัวเลข)
    let left = x0; let width = w;
    const shrink = !!al.shrink && !wrap;
    if (!wrap && !merged && !rot && !isNum && !shrink && hAlign !== 'fill') {
      const need = this.measure(text, fontForMeasure) + 2 * pad + indent;
      if (need > w) {
        const rightward = () => { let x = x0 + w; let cc = c + 1; while (x - x0 < need && cc <= c + 200 && isEmpty(r, cc)) { x += g.cw(cc); cc++; } return x; };
        const leftward = () => { let x = x0; let cc = c - 1; while (x0 + w - x < need && cc >= 1 && isEmpty(r, cc)) { x -= g.cw(cc); cc--; } return x; };
        if (hAlign === 'left') { width = rightward() - x0; }
        else if (hAlign === 'right') { const lx = leftward(); width = x0 + w - lx; left = lx; }
        else if (hAlign === 'center') {
          const half = (need - w) / 2;
          let rx = x0 + w; let cc = c + 1; while (rx - (x0 + w) < half && isEmpty(r, cc)) { rx += g.cw(cc); cc++; }
          let lx = x0; cc = c - 1; while (x0 - lx < half && cc >= 1 && isEmpty(r, cc)) { lx -= g.cw(cc); cc--; }
          const ext = Math.min(rx - (x0 + w), x0 - lx, half);
          left = x0 - ext; width = w + 2 * ext;
        }
      }
    }
    const legacy = /^(TH ?Sarabun|THSarabun|Angsana|Cordia|Browallia)/i.test(font.name || '') && !this.legacyAvailable(font.name);
    const css = [`left:${f2(left)}pt`, `top:${f2(y0)}pt`, `width:${f2(width)}pt`, `height:${f2(h)}pt`];
    const fcss = fontCss(font, legacy);
    let scaleX = 1;
    if (shrink) { const need = this.measure(text, fontForMeasure) + 2 * pad; if (need > w) scaleX = Math.max(0.1, (w - 2 * pad) / (need - 2 * pad)); }
    const color = fmt.color ? `#${fmt.color}` : cssColor(font.color) || '#000';
    css.push(`color:${color}`, fcss);
    css.push(`justify-content:${{ left: 'flex-start', right: 'flex-end', center: 'center', fill: 'flex-start', justify: 'stretch', distributed: 'center' }[hAlign] || 'flex-start'}`);
    css.push(`align-items:${{ top: 'flex-start', center: 'center', bottom: 'flex-end', justify: 'stretch', distributed: 'center' }[vAlign] || 'flex-end'}`);
    css.push(`text-align:${hAlign === 'justify' || hAlign === 'distributed' ? 'justify' : hAlign === 'fill' ? 'left' : hAlign}`);
    if (wrap) css.push('white-space:pre-wrap', 'overflow-wrap:anywhere');
    if (indent) css.push(hAlign === 'right' ? `padding-right:${f2(indent + pad)}pt` : `padding-left:${f2(indent + pad)}pt`);
    let inner;
    if (v instanceof String && v.runs) {
      inner = v.runs.map((run) => { const f = run.font ? { ...font, ...run.font } : font; const col = cssColor(f.color); return `<span style="${fontCss(f, legacy)}${col ? `;color:${col}` : ''}">${esc(run.t)}</span>`; }).join('');
    } else if (hAlign === 'fill') {
      const one = this.measure(text, fontForMeasure) || 1; inner = esc(text.repeat(Math.max(1, Math.floor((w - 2 * pad) / one))));
    } else inner = esc(wrap ? text : text.replace(/\n/g, ' '));
    if (fmt.fill && !wrap) {
      // *x ในรูปแบบ (เช่นบัญชี): ส่วนหน้าชิดซ้าย ส่วนหลังชิดขวา
      const pre = text.slice(0, fmt.fill.at); const post = text.slice(fmt.fill.at);
      inner = `<span>${esc(pre)}</span><span style="flex:1"></span><span>${esc(post)}</span>`;
      css.push('justify-content:space-between');
    }
    if (rot) {
      let tr;
      if (rot === 255) return `<div class="xl-t" style="${css.join(';')}"><span style="writing-mode:vertical-rl;text-orientation:upright">${inner}</span></div>`;
      if (rot <= 90) tr = `rotate(-${rot}deg)`; else tr = `rotate(${rot - 90}deg)`;
      if (rot === 90 || rot === 180) {
        const wm = rot === 90 ? 'writing-mode:vertical-rl;transform:rotate(180deg)' : 'writing-mode:vertical-rl';
        return `<div class="xl-t" style="${css.join(';')};${rot === 90 ? `justify-content:center` : 'justify-content:center'}"><span style="${wm};${wrap ? 'white-space:pre-wrap;' : ''}max-height:${f2(h)}pt">${inner}</span></div>`;
      }
      return `<div class="xl-t" style="${css.join(';')};justify-content:center;align-items:center"><span style="transform:${tr};white-space:nowrap">${inner}</span></div>`;
    }
    if (scaleX !== 1) inner = `<span style="display:inline-block;transform:scale(${f2(scaleX)});transform-origin:${hAlign === 'right' ? 'right' : hAlign === 'center' ? 'center' : 'left'} center;white-space:nowrap">${inner}</span>`;
    if (wrap) inner = `<span class="xl-w">${inner}</span>`;
    return `<div class="xl-t" style="${css.join(';')}">${inner}</div>`;
  }

  // ---- รูปภาพ / รูปร่าง ----
  drawingsHtml(sh, g, rb, cb, X, Y) {
    if (!sh.drawingPath) return '';
    if (!sh._draw) sh._draw = parseDrawing(this.wb, sh.drawingPath);
    const out = [];
    const bx1 = X(cb.a); const by1 = Y(rb.a); const bx2 = X(cb.b + 1); const by2 = Y(rb.b + 1);
    const pos = (p) => ({ x: X(p.col + 1) + p.colOff / EMU_PER_PT, y: Y(p.row + 1) + p.rowOff / EMU_PER_PT });
    for (const a of sh._draw) {
      if (!a.prints || a.hidden) continue;
      let x; let y; let w; let h;
      if (a.kind === 'twoCellAnchor' && a.from && a.to) { const p = pos(a.from); const q = pos(a.to); x = p.x; y = p.y; w = q.x - p.x; h = q.y - p.y; }
      else if (a.from && a.ext) { const p = pos(a.from); x = p.x; y = p.y; w = a.ext.cx / EMU_PER_PT; h = a.ext.cy / EMU_PER_PT; }
      else if (a.abs && a.ext) { x = a.abs.x / EMU_PER_PT - g.x(cb.a) + X(cb.a); y = a.abs.y / EMU_PER_PT - g.y(rb.a) + Y(rb.a); w = a.ext.cx / EMU_PER_PT; h = a.ext.cy / EMU_PER_PT; }
      else continue;
      if (w <= 0 || h <= 0) continue;
      if (x > bx2 || y > by2 || x + w < bx1 || y + h < by1) continue;
      for (const it of a.items) {
        if (it.hidden) continue;
        let ix = x; let iy = y; let iw = w; let ih = h;
        if (it.group && it.off && it.ext) {
          const gx = it.group; const sx = w / (gx.chcx || 1); const sy = h / (gx.chcy || 1);
          ix = x + (it.off.x - gx.chx) * sx; iy = y + (it.off.y - gx.chy) * sy; iw = it.ext.cx * sx; ih = it.ext.cy * sy;
        }
        out.push(this.shapeHtml(it, ix, iy, iw, ih));
      }
    }
    return out.join('');
  }
  shapeHtml(it, x, y, w, h) {
    const tf = [];
    if (it.rot) tf.push(`rotate(${it.rot}deg)`); if (it.flipH) tf.push('scaleX(-1)'); if (it.flipV) tf.push('scaleY(-1)');
    const box = `left:${f2(x)}pt;top:${f2(y)}pt;width:${f2(w)}pt;height:${f2(h)}pt${tf.length ? `;transform:${tf.join(' ')}` : ''}`;
    if (it.type === 'pic') {
      const url = it.image ? this.imageUrl(it.image) : null;
      if (!url) return '';
      if (it.crop) {
        const c = it.crop; const sw = 1 / Math.max(0.01, 1 - c.l - c.r); const shh = 1 / Math.max(0.01, 1 - c.t - c.b);
        return `<div class="xl-s" style="${box};overflow:hidden"><img src="${esc(url)}" alt="" style="position:absolute;left:${f2(-c.l * sw * 100)}%;top:${f2(-c.t * shh * 100)}%;width:${f2(sw * 100)}%;height:${f2(shh * 100)}%"></div>`;
      }
      return `<img class="xl-s" src="${esc(url)}" alt="" style="${box}">`;
    }
    if (it.type === 'cxnSp' || it.geom === 'line' || it.geom === 'straightConnector1') {
      const col = it.line?.color ? `#${it.line.color.hex}` : '#000'; const sw = Math.max(0.25, (it.line?.w || 9525) / EMU_PER_PT);
      return `<svg class="xl-s" style="${box};overflow:visible" viewBox="0 0 ${f2(Math.max(w, 0.01))} ${f2(Math.max(h, 0.01))}" preserveAspectRatio="none"><line x1="0" y1="0" x2="${f2(w)}" y2="${f2(h)}" stroke="${col}" stroke-width="${f2(sw)}"${it.line?.dash && it.line.dash !== 'solid' ? ' stroke-dasharray="3 2"' : ''}/></svg>`;
    }
    const bg = it.fill ? rgba(it.fill) : 'transparent';
    const ln = it.line && it.line.color ? `${f2(Math.max(0.25, it.line.w / EMU_PER_PT))}pt ${it.line.dash && it.line.dash !== 'solid' ? 'dashed' : 'solid'} ${rgba(it.line.color)}` : 'none';
    const radius = it.geom === 'ellipse' ? '50%' : /roundRect/.test(it.geom || '') ? '12%' : '0';
    let txt = '';
    if (it.text) {
      const t = it.text;
      const paras = t.paras.map((p) => `<div style="text-align:${{ l: 'left', ctr: 'center', r: 'right', just: 'justify' }[p.algn] || 'left'}">${p.runs.length ? p.runs.map((r) => (r.t === '\n' ? '<br>' : `<span style="${r.sz ? `font-size:${r.sz / 100}pt;` : ''}${r.b ? 'font-weight:bold;' : ''}${r.i ? 'font-style:italic;' : ''}${r.u && r.u !== 'none' ? 'text-decoration:underline;' : ''}${r.color ? `color:${rgba(r.color)};` : ''}${r.font ? `font-family:${fontStack(r.font)};` : ''}">${esc(r.t)}</span>`)).join('') : `<span style="font-size:${(p.endSz || 1100) / 100}pt">&#8203;</span>`}</div>`).join('');
      txt = `<div class="xl-tx" style="padding:${f2(t.tIns / EMU_PER_PT)}pt ${f2(t.rIns / EMU_PER_PT)}pt ${f2(t.bIns / EMU_PER_PT)}pt ${f2(t.lIns / EMU_PER_PT)}pt;justify-content:${{ t: 'flex-start', ctr: 'center', b: 'flex-end' }[t.anchor] || 'flex-start'}${t.vert && t.vert !== 'horz' ? ';writing-mode:vertical-rl' : ''}">${paras}</div>`;
    }
    return `<div class="xl-s" style="${box};background:${bg};border:${ln};border-radius:${radius};box-sizing:border-box">${txt}</div>`;
  }
}

function generalShort(v, digits) {
  const a = Math.abs(v);
  if (a >= 1e11 || (a < 1e-9 && a > 0)) { const s = v.toExponential(Math.max(0, digits - 1)).replace(/\.?0+e/, 'E').replace(/e/, 'E').replace(/E([+-])(\d)$/, 'E$10$2'); return s.replace(/E(\d)/, 'E+$1'); }
  const intLen = Math.max(1, Math.floor(Math.log10(a || 1)) + 1);
  const dec = Math.max(0, digits - intLen);
  let s = (Math.round(v * 10 ** dec) / 10 ** dec).toFixed(dec);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

// ---------------------------------------------------------------------
//  ตัวช่วย CSS
// ---------------------------------------------------------------------
function cssColor(c) { if (!c || c.auto || !c.hex) return null; return `#${c.hex}`; }
function rgba(c) { if (!c || !c.hex) return 'transparent'; if (c.alpha !== undefined && c.alpha < 1) { const n = parseInt(c.hex, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${f2(c.alpha)})`; } return `#${c.hex}`; }
const PATTERN_MIX = { gray125: 0.125, gray0625: 0.0625, lightGray: 0.25, mediumGray: 0.5, darkGray: 0.75, lightHorizontal: 0.25, lightVertical: 0.25, lightDown: 0.25, lightUp: 0.25, lightGrid: 0.4, lightTrellis: 0.4, darkHorizontal: 0.5, darkVertical: 0.5, darkDown: 0.5, darkUp: 0.5, darkGrid: 0.6, darkTrellis: 0.6 };
function fillCss(f) {
  if (!f || f.type === 'none' || !f.type) return null;
  if (f.type === 'gradient') { const s = (f.stops || []).filter((x) => x.color && x.color.hex); if (!s.length) return null; return `linear-gradient(${90 + (f.degree || 0)}deg,${s.map((x) => `#${x.color.hex} ${Math.round(x.pos * 100)}%`).join(',')})`; }
  if (f.type === 'solid') { const c = f.fg && f.fg.hex ? f.fg : (f.bg && f.bg.hex ? f.bg : null); return c ? `#${c.hex}` : null; }
  const k = PATTERN_MIX[f.type]; if (k === undefined) return null;
  const fg = f.fg && f.fg.hex ? f.fg.hex : '000000'; const bg = f.bg && f.bg.hex ? f.bg.hex : 'FFFFFF';
  const mix = [0, 2, 4].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * k + parseInt(bg.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
  return `#${mix}`;
}
function fontCss(f, legacyFallback) {
  const sz = (f.sz || 11) * (legacyFallback ? THAI_ADJ : 1);
  const parts = [`font-family:${fontStack(f.name)}`, `font-size:${f2(sz)}pt`];
  if (f.b) parts.push('font-weight:bold'); if (f.i) parts.push('font-style:italic');
  const deco = []; if (f.u) deco.push('underline'); if (f.strike) deco.push('line-through');
  if (deco.length) parts.push(`text-decoration:${deco.join(' ')}${f.u === 'double' || f.u === 'doubleAccounting' ? ' double' : ''}`);
  if (f.vertAlign === 'superscript') parts.push('vertical-align:super;font-size:smaller'); else if (f.vertAlign === 'subscript') parts.push('vertical-align:sub;font-size:smaller');
  return parts.join(';');
}
const RANK = { hair: 1, dotted: 2, dashDotDot: 3, dashDot: 4, dashed: 5, thin: 6, mediumDashDotDot: 7, slantDashDot: 8, mediumDashDot: 9, mediumDashed: 10, medium: 11, thick: 12, double: 13 };
function borderRank(s) { return RANK[s] || 0; }
function borderWidth(s) { return { hair: 0.5, thin: 0.75, medium: 1.5, mediumDashed: 1.5, mediumDashDot: 1.5, mediumDashDotDot: 1.5, slantDashDot: 1.5, thick: 2.25, double: 2.25 }[s] || 0.75; }
function borderCssStyle(s) { return { dotted: 'dotted', hair: 'dotted', dashed: 'dashed', mediumDashed: 'dashed', dashDot: 'dashed', mediumDashDot: 'dashed', dashDotDot: 'dotted', mediumDashDotDot: 'dotted', slantDashDot: 'dashed', double: 'double' }[s] || 'solid'; }
function edgeHtml(dir, x, y, len, e) {
  const w = borderWidth(e.style); const col = cssColor(e.color) || '#000'; const sty = borderCssStyle(e.style);
  if (dir === 'h') return `<div class="xl-b" style="left:${f2(x - 0.375)}pt;top:${f2(y - w / 2)}pt;width:${f2(len + 0.75)}pt;border-top:${w}pt ${sty} ${col}"></div>`;
  return `<div class="xl-b" style="left:${f2(x - w / 2)}pt;top:${f2(y - 0.375)}pt;height:${f2(len + 0.75)}pt;border-left:${w}pt ${sty} ${col}"></div>`;
}

// สไตล์ที่ต้องใส่ในหน้าเว็บครั้งเดียว
export const XL_CSS = `
.xl-page{position:relative;overflow:hidden;contain:strict;background:#fff;color:#000;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.xl-content{position:absolute;transform-origin:0 0}
.xl-blk{position:absolute;overflow:hidden}
.xl-in{position:absolute;left:1.5pt;top:1.5pt}
.xl-f,.xl-b,.xl-t,.xl-s,.xl-d{position:absolute;box-sizing:border-box}
.xl-b{width:0;height:0}
.xl-t{display:flex;padding:0 1.5pt;white-space:pre;overflow:hidden;line-height:1.15;font-kerning:normal}
.xl-t>span.xl-w{display:block;width:100%}
.xl-tx{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;line-height:1.15;color:#000;font-family:'TH SarabunPSK','Sarabun',sans-serif}
.xl-hf{position:absolute;white-space:pre}
img.xl-s{object-fit:fill}
`;
