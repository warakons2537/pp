// =====================================================================
//  อ่านสมุดงาน .xlsx/.xlsm เป็นโครงสร้างสำหรับคำนวณและวาดหน้ากระดาษ
//  เซลล์ สูตร (รวมสูตรร่วม/อาร์เรย์) รูปแบบ ความกว้างคอลัมน์ ความสูงแถว ผสานเซลล์
//  พื้นที่พิมพ์ หัวตารางซ้ำ ตัวแบ่งหน้า การตั้งค่าหน้ากระดาษ รูปภาพ/รูปร่าง การจัดรูปแบบตามเงื่อนไข
// =====================================================================
import { readZip, shiftFormula } from './xlsx-template.js?v=2569.10.30-2';
import { XErr, ERR, MAXCOL, colNum, textToNumber } from './xl-formula.js?v=2569.10.30-2';

const td = new TextDecoder();
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unesc(m[1]) : null; };
const num = (v, d = null) => (v === null || v === undefined || v === '' ? d : Number(v));
const bool = (v, d = false) => (v === null || v === undefined ? d : v === '1' || v === 'true');
const decodeX = (s) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export const key = (r, c) => r * MAXCOL + c;
export const parseCellRef = (s) => { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(s); return m ? { c: colNum(m[1]), r: +m[2] } : null; };
export function parseArea(s) {
  // 'Sheet'!$A$1:$B$2  |  $A:$B  |  $1:$3
  const t = s.replace(/^.*!/, '');
  let m = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i.exec(t);
  if (m) return { c1: colNum(m[1]), r1: +m[2], c2: colNum(m[3] || m[1]), r2: +(m[4] || m[2]) };
  m = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})$/i.exec(t); if (m) return { cols: [colNum(m[1]), colNum(m[2])] };
  m = /^\$?(\d+):\$?(\d+)$/.exec(t); if (m) return { rows: [+m[1], +m[2]] };
  return null;
}
// แยกรายการพื้นที่ด้วยจุลภาค (ไม่ตัดในชื่อแผ่นที่มีเครื่องหมายคำพูด)
function splitList(s) { const out = []; let cur = ''; let q = false; for (const ch of s) { if (ch === "'") q = !q; if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }

// ---------------------------------------------------------------------
//  สี
// ---------------------------------------------------------------------
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); let h = 0; let s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
}
function applyTint(hex, tint) {
  if (!tint) return hex;
  const [h, s, l0] = rgbToHsl(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  const l = tint < 0 ? l0 * (1 + tint) : l0 * (1 - tint) + tint;
  return hslToRgb(h, s, l).map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---------------------------------------------------------------------
//  รูปแบบตัวเลขในตัว
// ---------------------------------------------------------------------
export const BUILTIN_FMT = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm',
  37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
  // ภาษาไทย (Excel ภาษาไทย)
  59: 't0', 60: 't0.00', 61: 't#,##0', 62: 't#,##0.00', 67: 't0%', 68: 't0.00%', 69: 't# ?/?', 70: 't# ??/??',
  71: 'ว/ด/ปปปป', 72: 'ว-ดดด-ปป', 73: 'ว-ดดด', 74: 'ดดด-ปป', 75: 'ช:นน', 76: 'ช:นน:ทท', 77: 'ว/ด/ปปปป ช:นน', 78: 'นน:ทท', 79: '[ช]:นน:ทท', 80: 'นน:ทท.0', 81: 'd/m/bb',
};

// ---------------------------------------------------------------------
//  สมุดงาน
// ---------------------------------------------------------------------
export class Workbook {
  static async open(bytes, zipOpts) { return new Workbook(await readZip(bytes, zipOpts)); }
  /** @param files Map(path → Uint8Array|string) · overrides Map(path → string) (เช่น จาก Template ที่แก้แล้ว) */
  constructor(files, overrides = null) {
    this.files = files; this.over = overrides || new Map();
    const wb = this.text('xl/workbook.xml');
    if (!wb) throw new Error('ไม่พบ xl/workbook.xml');
    this.date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wb);
    const rels = this.rels('xl/workbook.xml');
    this.sheetsMeta = [...wb.matchAll(/<sheet\b[^>]*\/?>/g)].map((m, i) => ({
      index: i, name: attr(m[0], 'name'), state: attr(m[0], 'state') || 'visible', path: rels[attr(m[0], 'r:id')],
    }));
    this.sheetNames = this.sheetsMeta.map((s) => s.name);
    this.names = [...wb.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)].map((m) => ({
      name: attr(m[0], 'name'), sheet: attr(m[0], 'localSheetId') === null ? null : Number(attr(m[0], 'localSheetId')), ref: unesc(m[2]), hidden: bool(attr(m[0], 'hidden')),
    }));
    this.cache = new Map();
  }
  text(path) {
    if (this.over.has(path)) return this.over.get(path);
    const b = this.files.get(path); if (b === undefined) return null;
    return typeof b === 'string' ? b : td.decode(b);
  }
  bytes(path) { const b = this.files.get(path); return typeof b === 'string' ? new TextEncoder().encode(b) : b; }
  rels(path) {
    const dir = path.replace(/[^/]*$/, ''); const base = path.replace(/^.*\//, '');
    const x = this.text(`${dir}_rels/${base}.rels`); const out = {};
    if (!x) return out;
    for (const m of x.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], 'Id'); let t = attr(m[0], 'Target');
      if (attr(m[0], 'TargetMode') === 'External') { out[id] = null; continue; }
      t = t.startsWith('/') ? t.slice(1) : normPath(dir + t);
      out[id] = t; out[`type:${id}`] = attr(m[0], 'Type');
    }
    return out;
  }
  get sst() {
    if (this._sst) return this._sst;
    const x = this.text('xl/sharedStrings.xml') || '';
    this._sst = [...x.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => parseRich(m[1]));
    return this._sst;
  }
  get styles() { if (!this._styles) this._styles = parseStyles(this.text('xl/styles.xml') || '', this.theme); return this._styles; }
  get theme() {
    if (this._theme) return this._theme;
    const rels = this.rels('xl/workbook.xml'); const p = Object.keys(rels).map((k) => rels[k]).find((t) => t && /theme\d*\.xml$/.test(t)) || 'xl/theme/theme1.xml';
    const x = this.text(p) || '';
    const cs = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(x)?.[0] || '';
    const pick = (n) => { const m = new RegExp(`<a:${n}>([\\s\\S]*?)</a:${n}>`).exec(cs); if (!m) return null; return attr(m[1], 'lastClr') || attr(m[1], 'val'); };
    const order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    const dflt = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
    this._theme = order.map((n, i) => (pick(n) || dflt[i]).toUpperCase());
    const fm = /<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"/.exec(x); const fj = /<a:majorFont>[\s\S]*?<a:latin typeface="([^"]*)"/.exec(x);
    this.themeFonts = { minor: fm?.[1] || 'Calibri', major: fj?.[1] || 'Calibri Light' };
    return this._theme;
  }
  sheet(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const meta = this.sheetsMeta.find((s) => s.name === name);
    const sh = meta && meta.path ? parseSheet(this, meta) : null;
    this.cache.set(name, sh);
    return sh;
  }
  // พื้นที่พิมพ์และหัวตารางซ้ำของแผ่น
  printInfo(name) {
    const idx = this.sheetNames.indexOf(name);
    const pa = this.names.find((n) => n.sheet === idx && n.name === '_xlnm.Print_Area');
    const pt = this.names.find((n) => n.sheet === idx && n.name === '_xlnm.Print_Titles');
    const areas = pa && pa.ref ? splitList(pa.ref).map(parseArea).filter((a) => a && a.r1) : [];
    const titles = { rows: null, cols: null };
    if (pt && pt.ref) for (const p of splitList(pt.ref).map(parseArea)) { if (!p) continue; if (p.rows) titles.rows = p.rows; if (p.cols) titles.cols = p.cols; if (p.r1 && p.r2 >= 1048576) titles.cols = [p.c1, p.c2]; if (p.c1 && p.c2 >= 16384) titles.rows = [p.r1, p.r2]; }
    return { areas, titles };
  }
  // สำหรับเครื่องคำนวณ
  get engineBook() {
    return { sheet: (n) => this.sheet(n), sheetNames: this.sheetNames, names: this.names.map((n) => ({ name: n.name, sheet: n.sheet, ref: n.ref })) };
  }
}
function normPath(p) { const out = []; for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s !== '.' && s !== '') out.push(s); } return out.join('/'); }

// ข้อความแบบมีหลายรูปแบบ (rich text)
function parseRich(x) {
  x = x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<phoneticPr\b[^>]*\/>/g, '');
  const runs = [...x.matchAll(/<r>([\s\S]*?)<\/r>/g)];
  if (!runs.length) { const t = [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeX(unesc(m[1]))).join(''); return t; }
  const parts = runs.map((m) => {
    const t = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((k) => decodeX(unesc(k[1]))).join('');
    const rp = /<rPr>([\s\S]*?)<\/rPr>/.exec(m[1]);
    return { t, font: rp ? parseFontXml(rp[1], true) : null };
  });
  const s = new String(parts.map((p) => p.t).join('')); // eslint-disable-line no-new-wrappers
  s.runs = parts;
  return s;
}

// ---------------------------------------------------------------------
//  รูปแบบ (styles.xml)
// ---------------------------------------------------------------------
let THEME = null; let INDEXED_CUSTOM = null;
function color(tagXml) {
  if (!tagXml) return null;
  if (bool(attr(tagXml, 'auto'))) return { auto: true };
  const rgb = attr(tagXml, 'rgb'); const th = attr(tagXml, 'theme'); const ix = attr(tagXml, 'indexed'); const tint = num(attr(tagXml, 'tint'), 0);
  let hex = null;
  if (rgb) hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  else if (th !== null) hex = THEME?.[+th] || null;
  else if (ix !== null) { const i = +ix; if (i === 64) return { auto: true }; if (i === 65) return { auto: true, bg: true }; hex = (INDEXED_CUSTOM || INDEXED)[i] || null; }
  if (!hex) return null;
  return { hex: applyTint(hex.toUpperCase(), tint) };
}
function parseFontXml(x, rich = false) {
  const v = (n) => { const m = new RegExp(`<${rich && n === 'name' ? 'rFont' : n}\\b[^>]*?(?:/>|>)`).exec(x); return m ? m[0] : null; };
  const val = (n) => { const t = v(n); return t ? (attr(t, 'val') ?? '1') : null; };
  const f = {};
  const nm = rich ? (val('rFont') ?? val('name')) : val('name'); if (nm) f.name = nm;
  const sz = val('sz'); if (sz) f.sz = +sz;
  if (v('b')) f.b = bool(val('b'), true); if (v('i')) f.i = bool(val('i'), true);
  if (v('strike')) f.strike = bool(val('strike'), true);
  if (v('u')) { const u = val('u'); f.u = u === '1' || u === 'true' || !u ? 'single' : u === 'none' ? null : u; }
  if (v('vertAlign')) f.vertAlign = val('vertAlign');
  const c = /<color\b[^>]*\/?>/.exec(x); if (c) f.color = color(c[0]);
  const sch = val('scheme'); if (sch) f.scheme = sch;
  return f;
}
function parseBorderXml(x) {
  const b = {};
  for (const side of ['left', 'right', 'top', 'bottom', 'diagonal', 'start', 'end']) {
    const m = new RegExp(`<${side}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${side}>)`).exec(x);
    if (!m) continue;
    const style = attr(`<x ${m[1]}>`, 'style');
    if (!style || style === 'none') continue;
    const c = m[2] ? /<color\b[^>]*\/?>/.exec(m[2]) : null;
    b[side === 'start' ? 'left' : side === 'end' ? 'right' : side] = { style, color: c ? color(c[0]) : null };
  }
  const open = /<border\b[^>]*>/.exec(x)?.[0] || '';
  b.diagUp = bool(attr(open, 'diagonalUp')); b.diagDown = bool(attr(open, 'diagonalDown'));
  return b;
}
function parseFillXml(x) {
  const p = /<patternFill\b([^>]*?)(?:\/>|>([\s\S]*?)<\/patternFill>)/.exec(x);
  if (p) {
    const type = attr(`<x ${p[1]}>`, 'patternType') || (p[2] ? 'solid' : 'none');
    const fg = p[2] ? /<fgColor\b[^>]*\/?>/.exec(p[2]) : null; const bg = p[2] ? /<bgColor\b[^>]*\/?>/.exec(p[2]) : null;
    return { type, fg: fg ? color(fg[0]) : null, bg: bg ? color(bg[0]) : null };
  }
  const g = /<gradientFill\b[\s\S]*?<\/gradientFill>/.exec(x);
  if (g) { const stops = [...g[0].matchAll(/<stop\b[^>]*position="([^"]*)"[^>]*>([\s\S]*?)<\/stop>/g)].map((m) => ({ pos: +m[1], color: color(/<color\b[^>]*\/?>/.exec(m[2])?.[0]) })); return { type: 'gradient', stops, degree: num(attr(g[0], 'degree'), 0) }; }
  return { type: 'none' };
}
function parseAlign(x) {
  const m = /<alignment\b[^>]*\/?>/.exec(x || ''); if (!m) return {};
  const a = {};
  const h = attr(m[0], 'horizontal'); if (h) a.h = h;
  const v = attr(m[0], 'vertical'); if (v) a.v = v;
  if (bool(attr(m[0], 'wrapText'))) a.wrap = true;
  if (bool(attr(m[0], 'shrinkToFit'))) a.shrink = true;
  const ind = num(attr(m[0], 'indent'), 0); if (ind) a.indent = ind;
  const rot = num(attr(m[0], 'textRotation'), 0); if (rot) a.rot = rot;
  return a;
}
export function parseStyles(x, theme) {
  THEME = theme;
  const ic = /<indexedColors>([\s\S]*?)<\/indexedColors>/.exec(x);
  INDEXED_CUSTOM = ic ? [...ic[1].matchAll(/<rgbColor\b[^>]*rgb="([^"]*)"/g)].map((m) => m[1].slice(-6).toUpperCase()) : null;
  const sect = (n) => new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)</${n}>`).exec(x)?.[1] || '';
  const numFmts = { ...BUILTIN_FMT };
  for (const m of sect('numFmts').matchAll(/<numFmt\b[^>]*\/?>/g)) numFmts[+attr(m[0], 'numFmtId')] = attr(m[0], 'formatCode');
  const fonts = [...sect('fonts').matchAll(/<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g)].map((m) => parseFontXml(m[1] || ''));
  const fills = [...sect('fills').matchAll(/<fill\b[^>]*?(?:\/>|>([\s\S]*?)<\/fill>)/g)].map((m) => parseFillXml(m[1] || ''));
  const borders = [...sect('borders').matchAll(/<border\b[^>]*?(?:\/>|>[\s\S]*?<\/border>)/g)].map((m) => parseBorderXml(m[0]));
  const xf = (m) => ({
    numFmtId: num(attr(m[0], 'numFmtId'), 0), fontId: num(attr(m[0], 'fontId'), 0), fillId: num(attr(m[0], 'fillId'), 0), borderId: num(attr(m[0], 'borderId'), 0),
    xfId: num(attr(m[0], 'xfId'), 0), align: parseAlign(m[1]), quotePrefix: bool(attr(m[0], 'quotePrefix')),
    locked: !/<protection\b[^>]*locked="(0|false)"/.test(m[1] || ''), hidden: /<protection\b[^>]*hidden="(1|true)"/.test(m[1] || ''),
  });
  const cellXfs = [...sect('cellXfs').matchAll(/<xf\b[^>]*?(?:\/>|>([\s\S]*?)<\/xf>)/g)].map(xf);
  const styleXfs = [...sect('cellStyleXfs').matchAll(/<xf\b[^>]*?(?:\/>|>([\s\S]*?)<\/xf>)/g)].map(xf);
  const dxfs = [...sect('dxfs').matchAll(/<dxf>([\s\S]*?)<\/dxf>/g)].map((m) => {
    const d = {};
    const f = /<font>([\s\S]*?)<\/font>/.exec(m[1]); if (f) d.font = parseFontXml(f[1]);
    const fl = /<fill>([\s\S]*?)<\/fill>/.exec(m[1]); if (fl) { d.fill = parseFillXml(fl[1]); if (d.fill.type === 'solid' && !/<fgColor/.test(fl[1]) && d.fill.bg) d.fill.fg = d.fill.bg; if (d.fill.type === 'none' && d.fill.bg) { d.fill.type = 'solid'; d.fill.fg = d.fill.bg; } }
    const b = /<border\b[\s\S]*?<\/border>/.exec(m[1]); if (b) d.border = parseBorderXml(b[0]);
    const nf = /<numFmt\b[^>]*\/?>/.exec(m[1]); if (nf) d.numFmt = attr(nf[0], 'formatCode');
    return d;
  });
  const normal = styleXfs[0] ? fonts[styleXfs[0].fontId] : fonts[0];
  return { numFmts, fonts, fills, borders, cellXfs, styleXfs, dxfs, normalFont: normal || { name: 'Calibri', sz: 11 } };
}

// ---------------------------------------------------------------------
//  แผ่นงาน
// ---------------------------------------------------------------------
function parseSheet(wb, meta) {
  const x = wb.text(meta.path);
  if (!x) return null;
  const sst = wb.sst;
  const sh = { name: meta.name, index: meta.index, state: meta.state, path: meta.path, cells: new Map(), rows: new Map(), cols: [], merges: [], maxRow: 0, maxCol: 0 };
  // รูปแบบแผ่น
  const fp = /<sheetFormatPr\b[^>]*\/?>/.exec(x)?.[0] || '';
  sh.defaultRowHeight = num(attr(fp, 'defaultRowHeight'), 15);
  sh.customHeight = bool(attr(fp, 'customHeight'));
  sh.zeroHeight = bool(attr(fp, 'zeroHeight'));
  sh.defaultColWidth = num(attr(fp, 'defaultColWidth'), null);
  sh.baseColWidth = num(attr(fp, 'baseColWidth'), 8);
  for (const m of (/<cols>([\s\S]*?)<\/cols>/.exec(x)?.[1] || '').matchAll(/<col\b[^>]*\/?>/g)) {
    sh.cols.push({ min: +attr(m[0], 'min'), max: +attr(m[0], 'max'), width: num(attr(m[0], 'width'), null), hidden: bool(attr(m[0], 'hidden')), style: num(attr(m[0], 'style'), 0), custom: bool(attr(m[0], 'customWidth')) });
  }
  const sv = /<sheetView\b[^>]*>/.exec(x)?.[0] || '';
  sh.showGrid = attr(sv, 'showGridLines') !== '0' && attr(sv, 'showGridLines') !== 'false';
  sh.rtl = bool(attr(sv, 'rightToLeft'));
  sh.showZeros = attr(sv, 'showZeros') !== '0' && attr(sv, 'showZeros') !== 'false';
  for (const m of (/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(x)?.[1] || '').matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)) {
    const [a, b] = m[1].split(':'); const p = parseCellRef(a); const q = parseCellRef(b || a);
    if (p && q) sh.merges.push({ r1: p.r, c1: p.c, r2: q.r, c2: q.c });
  }
  // หน้ากระดาษ
  const ps = /<pageSetup\b[^>]*\/?>/.exec(x)?.[0] || '';
  const pm = /<pageMargins\b[^>]*\/?>/.exec(x)?.[0] || '';
  const po = /<printOptions\b[^>]*\/?>/.exec(x)?.[0] || '';
  const spp = /<sheetPr\b[^>]*\/>|<sheetPr\b[^>]*>[\s\S]*?<\/sheetPr>/.exec(x)?.[0] || '';
  const fitToPage = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(spp);
  sh.page = {
    paperSize: num(attr(ps, 'paperSize'), 9), orientation: attr(ps, 'orientation') || 'portrait',
    scale: num(attr(ps, 'scale'), 100), fitToPage, fitToWidth: num(attr(ps, 'fitToWidth'), 1), fitToHeight: num(attr(ps, 'fitToHeight'), 1),
    pageOrder: attr(ps, 'pageOrder') || 'downThenOver', blackAndWhite: bool(attr(ps, 'blackAndWhite')), firstPageNumber: num(attr(ps, 'firstPageNumber'), 1),
    useFirstPageNumber: bool(attr(ps, 'useFirstPageNumber')),
    margins: { left: num(attr(pm, 'left'), 0.7), right: num(attr(pm, 'right'), 0.7), top: num(attr(pm, 'top'), 0.75), bottom: num(attr(pm, 'bottom'), 0.75), header: num(attr(pm, 'header'), 0.3), footer: num(attr(pm, 'footer'), 0.3) },
    hCenter: bool(attr(po, 'horizontalCentered')), vCenter: bool(attr(po, 'verticalCentered')), gridLines: bool(attr(po, 'gridLines')), headings: bool(attr(po, 'headings')),
  };
  const hf = /<headerFooter\b[^>]*>([\s\S]*?)<\/headerFooter>/.exec(x);
  sh.headerFooter = hf ? { oddHeader: unesc(/<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(hf[1])?.[1] || ''), oddFooter: unesc(/<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(hf[1])?.[1] || '') } : { oddHeader: '', oddFooter: '' };
  const brk = (tag) => [...(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(x)?.[1] || '').matchAll(/<brk\b[^>]*\/?>/g)].filter((m) => attr(m[0], 'man') !== '0' && attr(m[0], 'man') !== 'false').map((m) => +attr(m[0], 'id'));
  sh.rowBreaks = brk('rowBreaks'); sh.colBreaks = brk('colBreaks');
  // ข้อมูล
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>|<sheetData\s*\/>/.exec(x)?.[1] || '';
  const masters = new Map();
  let rowNo = 0;
  const rowRe = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g; let rm;
  while ((rm = rowRe.exec(data))) {
    const ra = `<row ${rm[1]}>`;
    rowNo = num(attr(ra, 'r'), rowNo + 1);
    const ht = num(attr(ra, 'ht'), null); const hidden = bool(attr(ra, 'hidden'));
    const s = attr(ra, 's'); const cf = bool(attr(ra, 'customFormat'));
    if (ht !== null || hidden || (cf && s !== null)) sh.rows.set(rowNo, { ht, hidden, style: cf && s !== null ? +s : null, custom: bool(attr(ra, 'customHeight')) });
    const body = rm[3] || '';
    let colNo = 0;
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
    while ((cm = cRe.exec(body))) {
      const ca = `<c ${cm[1]}>`;
      const rs = attr(ca, 'r'); let r = rowNo; let c;
      if (rs) { const p = parseCellRef(rs); r = p.r; c = p.c; } else c = colNo + 1;
      colNo = c;
      const t = attr(ca, 't'); const st = num(attr(ca, 's'), 0);
      const inner = cm[2] || '';
      const cell = { s: st };
      const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
      let v = null;
      if (t === 'inlineStr') { const is = /<is>([\s\S]*?)<\/is>/.exec(inner); v = is ? parseRich(is[1]) : ''; }
      else if (vm) {
        const raw = unesc(vm[1]);
        if (t === 's') v = sst[+raw] ?? '';
        else if (t === 'str') v = decodeX(raw);
        else if (t === 'b') v = raw === '1' || raw === 'true';
        else if (t === 'e') v = ERRS[raw] || new XErr(raw);
        else if (t === 'd') { const d = new Date(raw); v = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000; }
        else v = Number(raw);
      }
      cell.v = v;
      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
      if (fm) {
        const fa = `<f ${fm[1]}>`; const ft = attr(fa, 't'); const ftext = fm[2] !== undefined ? unesc(fm[2]) : '';
        if (ft === 'shared') {
          const si = attr(fa, 'si');
          if (ftext) { masters.set(si, { f: ftext, r, c }); cell.f = ftext; }
          else { const ms = masters.get(si); if (ms) cell.f = shiftFormula(ms.f, r - ms.r, c - ms.c); }
        } else if (ft === 'array') {
          cell.f = ftext; cell.arr = attr(fa, 'ref') || rs;
          const [a, b] = cell.arr.split(':'); const p = parseCellRef(a); const q = parseCellRef(b || a);
          if (p && q && (p.r !== q.r || p.c !== q.c)) {
            const mk = key(r, c);
            for (let i = p.r; i <= q.r; i++) for (let j = p.c; j <= q.c; j++) {
              const k2 = key(i, j); if (k2 === mk) continue;
              const o = sh.cells.get(k2); if (o) o.master = mk; else sh.cells.set(k2, { s: 0, v: null, master: mk, pending: true });
            }
          }
        } else if (ft === 'dataTable') { /* ไม่รองรับ ใช้ค่าที่บันทึกไว้ */ }
        else if (ftext) cell.f = ftext;
        if (cell.f !== undefined && cell.f.trim() === '') delete cell.f;
      }
      const k = key(r, c);
      const prev = sh.cells.get(k);
      if (prev && prev.master !== undefined) cell.master = prev.master;
      sh.cells.set(k, cell);
      if (r > sh.maxRow) sh.maxRow = r; if (c > sh.maxCol) sh.maxCol = c;
    }
  }
  // การจัดรูปแบบตามเงื่อนไข
  sh.cf = [];
  for (const m of x.matchAll(/<conditionalFormatting\b([^>]*)>([\s\S]*?)<\/conditionalFormatting>/g)) {
    const sqref = attr(`<x ${m[1]}>`, 'sqref') || '';
    const ranges = sqref.split(/\s+/).filter(Boolean).map((s) => { const [a, b] = s.split(':'); const p = parseCellRef(a); const q = parseCellRef(b || a); return p && q ? { r1: p.r, c1: p.c, r2: q.r, c2: q.c } : null; }).filter(Boolean);
    for (const rr of m[2].matchAll(/<cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/cfRule>)/g)) {
      const ra = `<x ${rr[1]}>`;
      sh.cf.push({
        ranges, type: attr(ra, 'type'), operator: attr(ra, 'operator'), dxfId: num(attr(ra, 'dxfId'), null), priority: num(attr(ra, 'priority'), 0),
        stopIfTrue: bool(attr(ra, 'stopIfTrue')), text: attr(ra, 'text'),
        formulas: [...(rr[2] || '').matchAll(/<formula>([\s\S]*?)<\/formula>/g)].map((f) => unesc(f[1])),
      });
    }
  }
  sh.cf.sort((a, b) => a.priority - b.priority);
  // รูปวาด
  const rels = wb.rels(meta.path);
  const dr = /<drawing\b[^>]*r:id="([^"]+)"/.exec(x);
  sh.drawingPath = dr ? rels[dr[1]] : null;
  const ld = /<legacyDrawing\b[^>]*r:id="([^"]+)"/.exec(x);
  sh.vmlPath = ld ? rels[ld[1]] : null;
  const prot = /<sheetProtection\b[^>]*\/?>/.exec(x)?.[0] || '';
  sh.protected = /\bsheet="(1|true)"/.test(prot);
  return sh;
}
const ERRS = { '#NULL!': ERR.NULL, '#DIV/0!': ERR.DIV0, '#VALUE!': ERR.VALUE, '#REF!': ERR.REF, '#NAME?': ERR.NAME, '#NUM!': ERR.NUM, '#N/A': ERR.NA };

// ---------------------------------------------------------------------
//  รูปวาด (DrawingML): รูปภาพ รูปร่าง กล่องข้อความ
// ---------------------------------------------------------------------
export function parseDrawing(wb, path) {
  const x = wb.text(path); if (!x) return [];
  const rels = wb.rels(path);
  const out = [];
  const anchorRe = /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b([^>]*)>([\s\S]*?)<\/xdr:\1>/g; let m;
  const pos = (s) => s ? { col: +/<xdr:col>(\d+)<\/xdr:col>/.exec(s)[1], colOff: +/<xdr:colOff>(-?\d+)<\/xdr:colOff>/.exec(s)[1], row: +/<xdr:row>(\d+)<\/xdr:row>/.exec(s)[1], rowOff: +/<xdr:rowOff>(-?\d+)<\/xdr:rowOff>/.exec(s)[1] } : null;
  while ((m = anchorRe.exec(x))) {
    const body = m[3];
    const from = pos(/<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(body)?.[1]);
    const to = pos(/<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(body)?.[1]);
    const ext = /<xdr:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(body);
    const absPos = /<xdr:pos\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(body);
    const client = /<xdr:clientData\b[^>]*\/?>/.exec(body)?.[0] || '';
    const prints = !/fPrintsWithSheet="(0|false)"/.test(client);
    const anchor = { kind: m[1], from, to, ext: ext ? { cx: +ext[1], cy: +ext[2] } : null, abs: absPos ? { x: +absPos[1], y: +absPos[2] } : null, prints };
    const items = parseShapes(body, rels, wb);
    if (items.length) out.push({ ...anchor, items, hidden: /<xdr:cNvPr\b[^>]*hidden="(1|true)"/.test(body) });
  }
  return out;
}
function parseShapes(body, rels, wb) {
  // ทำแบบเรียบง่าย: เก็บทุก pic / sp / cxnSp ในกลุ่มด้วยตำแหน่งภายในกลุ่ม (a:off/a:ext)
  const items = [];
  const grpXf = /<xdr:grpSpPr>[\s\S]*?<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(body);
  let gx = null;
  if (/^\s*<xdr:grpSp>/.test(body.replace(/<xdr:(from|to)>[\s\S]*?<\/xdr:\1>/g, '').replace(/<xdr:ext\b[^>]*\/>/, '').replace(/<xdr:pos\b[^>]*\/>/, '')) && grpXf) {
    const o = /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(grpXf[1]); const e = /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(grpXf[1]);
    const co = /<a:chOff\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(grpXf[1]); const ce = /<a:chExt\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(grpXf[1]);
    if (o && e) gx = { x: +o[1], y: +o[2], cx: +e[1], cy: +e[2], chx: co ? +co[1] : +o[1], chy: co ? +co[2] : +o[2], chcx: ce ? +ce[1] : +e[1], chcy: ce ? +ce[2] : +e[2] };
  }
  const re = /<xdr:(pic|sp|cxnSp)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g; let m;
  while ((m = re.exec(body))) {
    const b = m[2];
    const xf = /<a:xfrm\b([^>]*)>([\s\S]*?)<\/a:xfrm>/.exec(b);
    const off = xf ? /<a:off\b[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(xf[2]) : null; const ex = xf ? /<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xf[2]) : null;
    const it = { type: m[1], off: off ? { x: +off[1], y: +off[2] } : null, ext: ex ? { cx: +ex[1], cy: +ex[2] } : null, rot: xf ? num(attr(`<x ${xf[1]}>`, 'rot'), 0) / 60000 : 0, flipH: xf ? bool(attr(`<x ${xf[1]}>`, 'flipH')) : false, flipV: xf ? bool(attr(`<x ${xf[1]}>`, 'flipV')) : false, group: gx };
    it.hidden = /<xdr:cNvPr\b[^>]*hidden="(1|true)"/.test(b);
    if (m[1] === 'pic') {
      const emb = /<a:blip\b[^>]*r:embed="([^"]+)"/.exec(b);
      it.image = emb ? rels[emb[1]] : null;
      const src = /<a:srcRect\b[^>]*\/?>/.exec(b);
      if (src) it.crop = { l: num(attr(src[0], 'l'), 0) / 1e5, t: num(attr(src[0], 't'), 0) / 1e5, r: num(attr(src[0], 'r'), 0) / 1e5, b: num(attr(src[0], 'b'), 0) / 1e5 };
    } else {
      const spPr = /<xdr:spPr\b[^>]*>([\s\S]*?)<\/xdr:spPr>/.exec(b)?.[1] || '';
      it.geom = /<a:prstGeom\b[^>]*prst="([^"]+)"/.exec(spPr)?.[1] || (/<a:custGeom/.test(spPr) ? 'custom' : 'rect');
      it.fill = drawFill(spPr, b, 'fill');
      const ln = /<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>|<a:ln\b([^>]*)\/>/.exec(spPr);
      it.line = ln ? { w: num(attr(`<x ${ln[1] || ln[3]}>`, 'w'), 9525), color: ln[2] && /<a:noFill/.test(ln[2]) ? null : drawColor(ln[2] || '') || styleRef(b, 'lnRef'), dash: /<a:prstDash\b[^>]*val="([^"]+)"/.exec(ln[2] || '')?.[1] || null } : { w: 9525, color: styleRef(b, 'lnRef') };
      const tx = /<xdr:txBody>([\s\S]*?)<\/xdr:txBody>/.exec(b);
      if (tx) it.text = parseTxBody(tx[1]);
    }
    items.push(it);
  }
  void wb;
  return items;
}
function styleRef(b, tag) { const m = new RegExp(`<a:${tag}\\b[^>]*idx="(\\d+)"[^>]*>([\\s\\S]*?)</a:${tag}>`).exec(b); if (!m || m[1] === '0') return null; return drawColor(m[2]); }
function drawFill(spPr, b) {
  if (/<a:noFill\/>/.test(spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, ''))) return null;
  const s = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, ''));
  if (s) return drawColor(s[1]);
  const g = /<a:gradFill\b[\s\S]*?<\/a:gradFill>/.exec(spPr); if (g) return drawColor(g[0]);
  return styleRef(b, 'fillRef');
}
function drawColor(x) {
  let hex = null;
  const srgb = /<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/.exec(x); const sch = /<a:schemeClr\b[^>]*val="(\w+)"/.exec(x); const sys = /<a:sysClr\b[^>]*(?:lastClr|val)="([0-9A-Fa-f]{6}|\w+)"/.exec(x);
  const prst = /<a:prstClr\b[^>]*val="(\w+)"/.exec(x);
  if (srgb) hex = srgb[1];
  else if (sch) { const map = { bg1: 0, lt1: 0, tx1: 1, dk1: 1, bg2: 2, lt2: 2, tx2: 3, dk2: 3, accent1: 4, accent2: 5, accent3: 6, accent4: 7, accent5: 8, accent6: 9, hlink: 10, folHlink: 11 }; hex = THEME?.[map[sch[1]] ?? 1] || '000000'; }
  else if (sys) hex = /^[0-9A-Fa-f]{6}$/.test(sys[1]) ? sys[1] : sys[1] === 'window' ? 'FFFFFF' : '000000';
  else if (prst) hex = { black: '000000', white: 'FFFFFF', red: 'FF0000', blue: '0000FF', green: '008000', yellow: 'FFFF00' }[prst[1]] || '000000';
  if (!hex) return null;
  const lm = /<a:lumMod\b[^>]*val="(\d+)"/.exec(x); const lo = /<a:lumOff\b[^>]*val="(\d+)"/.exec(x); const sh = /<a:shade\b[^>]*val="(\d+)"/.exec(x); const ti = /<a:tint\b[^>]*val="(\d+)"/.exec(x);
  if (lm || lo) { const [h, s, l] = rgbToHsl(...[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))); const l2 = Math.min(1, l * (lm ? +lm[1] / 1e5 : 1) + (lo ? +lo[1] / 1e5 : 0)); hex = hslToRgb(h, s, l2).map((v) => v.toString(16).padStart(2, '0')).join(''); }
  if (sh) hex = [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * +sh[1] / 1e5).toString(16).padStart(2, '0')).join('');
  if (ti) hex = [0, 2, 4].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (255 - v) * (1 - +ti[1] / 1e5)).toString(16).padStart(2, '0'); }).join('');
  const al = /<a:alpha\b[^>]*val="(\d+)"/.exec(x);
  return { hex: hex.toUpperCase(), alpha: al ? +al[1] / 1e5 : 1 };
}
function parseTxBody(x) {
  const bp = /<a:bodyPr\b[^>]*\/?>/.exec(x)?.[0] || '';
  const body = { anchor: attr(bp, 'anchor') || 't', vert: attr(bp, 'vert'), wrap: attr(bp, 'wrap') !== 'none', lIns: num(attr(bp, 'lIns'), 91440), tIns: num(attr(bp, 'tIns'), 45720), rIns: num(attr(bp, 'rIns'), 91440), bIns: num(attr(bp, 'bIns'), 45720) };
  body.paras = [...x.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\/>/g)].map((m) => {
    const p = m[1] || '';
    const algn = attr(/<a:pPr\b[^>]*\/?>/.exec(p)?.[0] || '', 'algn') || 'l';
    const runs = [...p.matchAll(/<a:(r|fld)\b[^>]*>([\s\S]*?)<\/a:\1>|<a:br\b[^>]*\/?>/g)].map((r) => {
      if (!r[2]) return { t: '\n' };
      const rp = /<a:rPr\b([^>]*?)(?:\/>|>([\s\S]*?)<\/a:rPr>)/.exec(r[2]);
      const ra = rp ? `<x ${rp[1]}>` : '';
      const latin = rp && rp[2] ? (/<a:(?:cs|latin)\b[^>]*typeface="([^"]+)"/.exec(rp[2])?.[1] || null) : null;
      return { t: unesc(/<a:t>([\s\S]*?)<\/a:t>/.exec(r[2])?.[1] || ''), sz: num(attr(ra, 'sz'), null), b: bool(attr(ra, 'b')), i: bool(attr(ra, 'i')), u: attr(ra, 'u'), color: rp && rp[2] ? drawColor(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(rp[2])?.[1] || '') : null, font: latin };
    });
    const end = /<a:endParaRPr\b[^>]*sz="(\d+)"/.exec(p);
    return { algn, runs, endSz: end ? +end[1] : null };
  });
  return body;
}

export { textToNumber };
