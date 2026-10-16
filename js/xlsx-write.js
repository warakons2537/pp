// =====================================================================
//  เขียนไฟล์ Excel (.xlsx) เองโดยไม่ต้องใช้ไลบรารีภายนอก
//  รองรับสิ่งที่แบบฟอร์มโรงเรียนใช้: สูตร, ฟอนต์, สีพื้น, เส้นขอบ, จัดวาง/หมุนข้อความ,
//  ผสานเซลล์, ความกว้าง/ซ่อนคอลัมน์, ความสูงแถว, ตรึงแนว, ตั้งค่าหน้ากระดาษ, แบ่งหน้า, พิมพ์หัวซ้ำ
// =====================================================================

// ---------- ที่อยู่เซลล์ ----------
export const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export const ref = (c, r) => `${colName(c)}${r}`;

const xmlEsc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- zip (แบบไม่บีบอัด) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zipStore(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const nameB = enc.encode(name); const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nameB.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nameB, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nameB.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- รูปแบบเซลล์ ----------
// style = { font: {name, sz, b, color}, fill: 'FFCCFF', border: 'thin' | {l,t,r,b}, align: {h, v, rot, wrap, shrink}, numFmt: '0.00' }
class Styles {
  constructor(defaultFont) {
    this.fonts = [defaultFont]; this.fills = [null, 'gray125']; this.borders = [{}]; this.numFmts = []; this.xfs = [{ font: 0, fill: 0, border: 0, numFmt: 0 }];
    this.cache = new Map();
  }
  idx(list, v) { const k = JSON.stringify(v); let i = list.findIndex((x) => JSON.stringify(x) === k); if (i < 0) { list.push(v); i = list.length - 1; } return i; }
  get(style) {
    if (!style) return 0;
    const key = JSON.stringify(style);
    if (this.cache.has(key)) return this.cache.get(key);
    const font = this.idx(this.fonts, { ...this.fonts[0], ...(style.font || {}) });
    const fill = style.fill ? this.idx(this.fills, style.fill) : 0;
    const b = style.border === 'thin' ? { l: 'thin', t: 'thin', r: 'thin', b: 'thin' } : (style.border || {});
    const border = this.idx(this.borders, b);
    let numFmt = 0;
    if (style.numFmt) { const i = this.idx(this.numFmts, style.numFmt); numFmt = 164 + i; }
    const xf = { font, fill, border, numFmt, align: style.align || null };
    const i = this.idx(this.xfs, xf); this.cache.set(key, i); return i;
  }
  xml() {
    const font = (f) => `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.sz}"/>${f.color ? `<color rgb="FF${f.color}"/>` : ''}<name val="${xmlEsc(f.name)}"/>${f.charset ? `<charset val="${f.charset}"/>` : ''}</font>`;
    const fill = (f) => (f === null ? '<fill><patternFill patternType="none"/></fill>' : f === 'gray125' ? '<fill><patternFill patternType="gray125"/></fill>'
      : `<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`);
    const side = (tag, s) => (s ? `<${tag} style="${s}"><color auto="1"/></${tag}>` : `<${tag}/>`);
    const border = (b) => `<border>${side('left', b.l)}${side('right', b.r)}${side('top', b.t)}${side('bottom', b.b)}<diagonal/></border>`;
    const xf = (x) => {
      const a = x.align; const attrs = `numFmtId="${x.numFmt}" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0"`
        + `${x.numFmt ? ' applyNumberFormat="1"' : ''}${x.font ? ' applyFont="1"' : ''}${x.fill ? ' applyFill="1"' : ''}${x.border ? ' applyBorder="1"' : ''}${a ? ' applyAlignment="1"' : ''}`;
      if (!a) return `<xf ${attrs}/>`;
      const al = [a.h && `horizontal="${a.h}"`, a.v && `vertical="${a.v}"`, a.rot && `textRotation="${a.rot}"`, a.wrap && 'wrapText="1"', a.shrink && 'shrinkToFit="1"'].filter(Boolean).join(' ');
      return `<xf ${attrs}><alignment ${al}/></xf>`;
    };
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + (this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlEsc(f)}"/>`).join('')}</numFmts>` : '')
      + `<fonts count="${this.fonts.length}">${this.fonts.map(font).join('')}</fonts>`
      + `<fills count="${this.fills.length}">${this.fills.map(fill).join('')}</fills>`
      + `<borders count="${this.borders.length}">${this.borders.map(border).join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.map(xf).join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

// ---------- แผ่นงาน ----------
export class Sheet {
  constructor(name) {
    this.name = name; this.cells = new Map(); this.merges = []; this.cols = {}; this.rows = {};
    this.freeze = null; this.page = {}; this.colBreaks = []; this.rowBreaks = []; this.printTitles = null; this.defaultRowHeight = 15;
    this.showGrid = true; this.zoom = null;
  }
  // v: ค่า (ตัวเลข/ข้อความ/null), f: สูตร (ไม่ต้องมี =), s: รูปแบบ
  set(c, r, v, s, f) { this.cells.set(`${r}:${c}`, { c, r, v, s, f }); return this; }
  style(c, r, s) { const k = `${r}:${c}`; const x = this.cells.get(k); if (x) x.s = s; else this.cells.set(k, { c, r, v: null, s }); return this; }
  styleRange(c1, r1, c2, r2, s) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const x = this.cells.get(`${r}:${c}`); if (!x || !x.s) this.style(c, r, s); } return this; }
  merge(c1, r1, c2, r2) { if (c1 !== c2 || r1 !== r2) this.merges.push(`${ref(c1, r1)}:${ref(c2, r2)}`); return this; }
  width(c, w, hidden = false) { this.cols[c] = { w, hidden }; return this; }
  height(r, h) { this.rows[r] = h; return this; }

  xml(styles) {
    const byRow = new Map();
    for (const x of this.cells.values()) { if (!byRow.has(x.r)) byRow.set(x.r, []); byRow.get(x.r).push(x); }
    for (const r of Object.keys(this.rows)) if (!byRow.has(+r)) byRow.set(+r, []);
    let maxC = 1; let maxR = 1;
    const rowXml = [...byRow.keys()].sort((a, b) => a - b).map((r) => {
      const cells = byRow.get(r).sort((a, b) => a.c - b.c);
      maxR = Math.max(maxR, r);
      const h = this.rows[r];
      return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells.map((x) => {
        maxC = Math.max(maxC, x.c);
        const s = styles.get(x.s); const sa = s ? ` s="${s}"` : '';
        const a = ref(x.c, x.r);
        const isNum = typeof x.v === 'number' && Number.isFinite(x.v);
        if (x.f) {
          const f = `<f>${xmlEsc(x.f.replace(/^=/, ''))}</f>`;
          if (x.v === null || x.v === undefined || x.v === '') return `<c r="${a}"${sa} t="str">${f}<v></v></c>`.replace('<v></v>', '');
          return isNum ? `<c r="${a}"${sa}>${f}<v>${x.v}</v></c>` : `<c r="${a}"${sa} t="str">${f}<v>${xmlEsc(x.v)}</v></c>`;
        }
        if (x.v === null || x.v === undefined || x.v === '') return `<c r="${a}"${sa}/>`;
        if (isNum) return `<c r="${a}"${sa}><v>${x.v}</v></c>`;
        return `<c r="${a}"${sa} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(x.v)}</t></is></c>`;
      }).join('')}</row>`;
    }).join('');

    const colsXml = Object.keys(this.cols).length
      ? `<cols>${Object.entries(this.cols).sort((a, b) => a[0] - b[0]).map(([c, o]) => `<col min="${c}" max="${c}" width="${o.w}" customWidth="1"${o.hidden ? ' hidden="1"' : ''}/>`).join('')}</cols>` : '';
    const p = this.page;
    const fit = p.fitToWidth !== undefined || p.fitToHeight !== undefined;
    const pane = this.freeze
      ? `<pane xSplit="${this.freeze.c - 1}" ySplit="${this.freeze.r - 1}" topLeftCell="${ref(this.freeze.c, this.freeze.r)}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${ref(this.freeze.c, this.freeze.r)}" sqref="${ref(this.freeze.c, this.freeze.r)}"/>`
      : '';
    const brk = (tag, list, maxV) => (list.length ? `<${tag} count="${list.length}" manualBreakCount="${list.length}">${list.map((id) => `<brk id="${id}" max="${maxV}" man="1"/>`).join('')}</${tag}>` : '');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheetPr><pageSetUpPr fitToPage="${fit ? 1 : 0}"/></sheetPr>`
      + `<dimension ref="A1:${ref(maxC, maxR)}"/>`
      + `<sheetViews><sheetView workbookViewId="0"${this.showGrid ? '' : ' showGridLines="0"'}${this.zoom ? ` zoomScale="${this.zoom}" zoomScaleNormal="${this.zoom}"` : ''}>${pane}</sheetView></sheetViews>`
      + `<sheetFormatPr defaultRowHeight="${this.defaultRowHeight}"/>`
      + colsXml
      + `<sheetData>${rowXml}</sheetData>`
      + (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
      + `<printOptions${p.hCenter ? ' horizontalCentered="1"' : ''}${p.vCenter ? ' verticalCentered="1"' : ''}/>`
      + `<pageMargins left="${p.left ?? 0.59}" right="${p.right ?? 0.59}" top="${p.top ?? 0.4}" bottom="${p.bottom ?? 0.4}" header="${p.header ?? 0.2}" footer="${p.footer ?? 0.2}"/>`
      + `<pageSetup paperSize="${p.paper ?? 9}" orientation="${p.orientation ?? 'portrait'}"${p.scale ? ` scale="${p.scale}"` : ''}${fit ? ` fitToWidth="${p.fitToWidth ?? 1}" fitToHeight="${p.fitToHeight ?? 0}"` : ''}/>`
      + brk('rowBreaks', this.rowBreaks, 16383)
      + brk('colBreaks', this.colBreaks, 1048575)
      + '</worksheet>';
  }
}

// ---------- สมุดงาน ----------
// ฟอนต์ปกติของสมุดงานเป็นตัวกำหนดหน่วยความกว้างคอลัมน์ ใช้ Arial 10 เหมือนไฟล์เดิมเพื่อให้ความกว้างตรงกัน
export function buildXlsx(sheets, { defaultFont = { name: 'Arial', sz: 10 }, title = '' } = {}) {
  const styles = new Styles(defaultFont);
  const sheetXml = sheets.map((s) => s.xml(styles));
  const names = sheets.map((s, i) => (s.printTitles
    ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${[s.printTitles.cols && `'${s.name.replace(/'/g, "''")}'!$${colName(s.printTitles.cols[0])}:$${colName(s.printTitles.cols[1])}`,
      s.printTitles.rows && `'${s.name.replace(/'/g, "''")}'!$${s.printTitles.rows[0]}:$${s.printTitles.rows[1]}`].filter(Boolean).join(',')}</definedName>` : '')).join('');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '</Relationships>'],
    ['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xmlEsc(title)}</dc:title><dc:creator>WL Admin</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created></cp:coreProperties>`],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + '<bookViews><workbookView activeTab="0"/></bookViews>'
      + `<sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + (names ? `<definedNames>${names}</definedNames>` : '')
      + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + '</Relationships>'],
    ['xl/styles.xml', styles.xml()],
    ...sheetXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
  ];
  return zipStore(files);
}

// ชื่อชีต: ไม่เกิน 31 ตัวอักษร ห้าม : \ / ? * [ ] และห้ามซ้ำ
export function safeSheetName(name, used = new Set()) {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
  let n = base; let i = 2;
  while (used.has(n.toLowerCase())) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}

export function downloadBytes(bytes, filename, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
