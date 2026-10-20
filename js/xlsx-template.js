// =====================================================================
//  แก้ไขไฟล์ Excel ต้นฉบับ (.xlsx / .xlsm) โดยคงหน้าตาเดิมทุกอย่าง
//  เขียนค่าลงเซลล์ที่กำหนด (คงรูปแบบเซลล์เดิม) · ซ่อน/เรียงแผ่นงาน · เปลี่ยนแนวกระดาษ
//  ให้ Excel คำนวณสูตรใหม่ทั้งหมดเมื่อเปิดไฟล์
//  ใช้ได้ทั้งในเบราว์เซอร์ (DecompressionStream) และ node (ส่ง inflate/deflate มาเอง)
// =====================================================================

// ---------------------------------------------------------------------
//  zip
// ---------------------------------------------------------------------
const td = new TextDecoder(); const te = new TextEncoder();

async function streamXform(bytes, Stream) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const defaultInflate = (b) => streamXform(b, globalThis.DecompressionStream);
const defaultDeflate = globalThis.CompressionStream ? (b) => streamXform(b, globalThis.CompressionStream) : null;

export async function readZip(bytes, { inflate = defaultInflate } = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ไฟล์นี้ไม่ใช่ไฟล์ Excel (.xlsx/.xlsm) ถ้าเป็น .xlsb ให้เปิดใน Excel แล้วบันทึกเป็น .xlsx หรือ .xlsm ก่อน');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ไฟล์ zip เสียหาย');
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true); const xlen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(off + 26, true); const lxlen = dv.getUint16(off + 28, true);
    const data = u8.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    files.set(name, method === 0 ? data.slice() : await inflate(data));
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export async function writeZip(files, { deflate = defaultDeflate } = {}) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === 'string' ? te.encode(content) : content;
    const nameB = te.encode(name); const crc = crc32(data);
    let body = data; let method = 0;
    if (deflate && data.length > 256) { const z = await deflate(data); if (z.length < data.length) { body = z; method = 8; } }
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true);
    h.setUint32(18, body.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nameB.length, true);
    parts.push(new Uint8Array(h.buffer), nameB, body);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nameB.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nameB);
    offset += 30 + nameB.length + body.length;
  }
  const cd = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.size ?? files.length, true); e.setUint16(10, files.size ?? files.length, true);
  e.setUint32(12, cd, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let o = 0;
  for (const x of all) { out.set(x, o); o += x.length; }
  return out;
}

// ---------------------------------------------------------------------
//  ที่อยู่เซลล์
// ---------------------------------------------------------------------
export const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const splitRef = (r) => { const m = /^([A-Z]+)(\d+)$/.exec(r); return { c: colNum(m[1]), r: Number(m[2]) }; };
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unesc(m[1]) : null; };

// ---------------------------------------------------------------------
//  สมุดงาน
// ---------------------------------------------------------------------
export class Template {
  static async open(bytes, zipOpts = {}) {
    const t = new Template();
    t.zipOpts = zipOpts;
    t.files = await readZip(bytes, zipOpts);
    if (!t.files.has('xl/workbook.xml')) throw new Error('ไม่พบ xl/workbook.xml — ไฟล์นี้ไม่ใช่สมุดงาน Excel แบบ .xlsx/.xlsm');
    t.wb = td.decode(t.files.get('xl/workbook.xml'));
    const rels = td.decode(t.files.get('xl/_rels/workbook.xml.rels'));
    const target = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = attr(m[0], 'Id'); let tg = attr(m[0], 'Target');
      tg = tg.startsWith('/') ? tg.slice(1) : `xl/${tg}`;
      target[id] = tg.replace(/\/\.\//g, '/');
    }
    t.sheets = [...t.wb.matchAll(/<sheet\b[^>]*\/>/g)].map((m, i) => ({
      index: i, tag: m[0], name: attr(m[0], 'name'), state: attr(m[0], 'state') || 'visible',
      rid: attr(m[0], 'r:id'), path: target[attr(m[0], 'r:id')],
    }));
    t.xml = new Map();     // path → string (โหลดเมื่อใช้)
    t.locked = null;
    return t;
  }
  sheet(name) { const s = this.sheets.find((x) => x.name === name); return s || null; }
  sheetXml(name) {
    const s = this.sheet(name); if (!s) return null;
    if (!this.xml.has(s.path)) this.xml.set(s.path, td.decode(this.files.get(s.path)));
    return this.xml.get(s.path);
  }
  setSheetXml(name, x) { this.xml.set(this.sheet(name).path, x); }

  // รูปแบบเซลล์ที่ล็อกไว้ (ใช้ร่วมกับการป้องกันแผ่นงาน)
  lockedStyles() {
    if (this.locked) return this.locked;
    const st = td.decode(this.files.get('xl/styles.xml'));
    const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)?.[1] || '';
    this.locked = [...cx.matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => !/<protection\b[^>]*locked="(0|false)"/.test(m[0]));
    return this.locked;
  }

  /**
   * เขียนค่าลงแผ่นงาน
   * @param edits Map/obj: 'A1' → { v } | { f } | { clear: true } · v เป็นตัวเลขหรือข้อความ
   * @returns { written, skipped: [ref ที่ถูกล็อก] }
   */
  write(name, edits, { respectLock = true } = {}) {
    const x = this.sheetXml(name);
    if (x === null) return { written: 0, skipped: [], missing: true };
    const entries = edits instanceof Map ? [...edits] : Object.entries(edits);
    if (!entries.length) return { written: 0, skipped: [] };
    const protectedSheet = /<sheetProtection\b[^>]*\bsheet="(1|true)"/.test(x);
    const locked = protectedSheet && respectLock ? this.lockedStyles() : null;
    // ถ้าจะเขียนทับเซลล์ต้นแบบของ "สูตรร่วม" (shared formula) ต้องแตกสูตรให้เซลล์อื่นในกลุ่มก่อน ไม่งั้นไฟล์เสีย
    const targets = new Set(entries.map(([r]) => r));
    const masters = [...x.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f\b[^>]*t="shared"[^>]*\bref="[^"]+"[^>]*>/g)]
      .filter((m) => targets.has(m[1])).map((m) => attr(/<f\b[^>]*>/.exec(m[0])[0], 'si'));
    if (masters.length) { this.unshare(name, new Set(masters)); return this.write(name, edits, { respectLock }); }
    const sdStart = x.indexOf('<sheetData'); const sdOpenEnd = x.indexOf('>', sdStart) + 1;
    const selfClosing = x[sdOpenEnd - 2] === '/';
    const sdEnd = selfClosing ? sdOpenEnd : x.indexOf('</sheetData>', sdOpenEnd);
    const body = selfClosing ? '' : x.slice(sdOpenEnd, sdEnd);
    // แถวเดิม
    const rows = new Map();
    for (const m of body.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) rows.set(Number(attr(m[0], 'r')), m[0]);
    const byRow = new Map();
    for (const [ref, val] of entries) { const { r, c } = splitRef(ref); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push({ ref, c, val }); }
    let written = 0; const skipped = [];
    for (const [r, list] of byRow) {
      const rowXml = rows.get(r) || `<row r="${r}"></row>`;
      const open = /^<row\b[^>]*?(\/?)>/.exec(rowXml);
      const rowOpen = open[0].replace(/\/>$/, '>');
      const inner = open[1] ? '' : rowXml.slice(open[0].length, rowXml.length - '</row>'.length);
      const cells = new Map();
      for (const m of inner.matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) cells.set(splitRef(attr(m[0], 'r')).c, m[0]);
      for (const { ref, c, val } of list) {
        const old = cells.get(c);
        const s = old ? attr(old, 's') : (/\bs="(\d+)"/.exec(rowOpen) && /customFormat="1"/.test(rowOpen) ? attr(rowOpen, 's') : null);
        if (locked && locked[Number(s || 0)] !== false && locked[Number(s || 0)]) { skipped.push(ref); continue; }
        const sa = s !== null && s !== undefined ? ` s="${s}"` : '';
        let cx;
        if (val.f) cx = `<c r="${ref}"${sa}><f>${esc(val.f.replace(/^=/, ''))}</f></c>`;
        else if (val.clear || val.v === null || val.v === undefined || val.v === '') cx = `<c r="${ref}"${sa}/>`;
        else if (typeof val.v === 'number' && Number.isFinite(val.v)) cx = `<c r="${ref}"${sa}><v>${val.v}</v></c>`;
        else cx = `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(val.v)}</t></is></c>`;
        cells.set(c, cx); written++;
      }
      const newRow = `${rowOpen}${[...cells].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join('')}</row>`;
      rows.set(r, newRow.replace(/\sspans="[^"]*"/, ''));
    }
    const newBody = [...rows].sort((a, b) => a[0] - b[0]).map((e) => e[1]).join('');
    const head = x.slice(0, sdStart); const tail = x.slice(sdEnd + (selfClosing ? 0 : '</sheetData>'.length));
    this.setSheetXml(name, `${head}<sheetData>${newBody}</sheetData>${tail}`);
    return { written, skipped };
  }

  // เซลล์ที่มีอยู่ในช่วง (ไว้ล้างค่าเดิมก่อนเขียนใหม่) · ข้ามเซลล์ที่เป็นสูตร
  existing(name, c1, r1, c2, r2, { formulas = false } = {}) {
    const x = this.sheetXml(name); if (!x) return [];
    const out = [];
    for (const m of x.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(\/>|>([\s\S]*?)<\/c>)/g)) {
      const c = colNum(m[1]); const r = Number(m[2]);
      if (c < c1 || c > c2 || r < r1 || r > r2) continue;
      if (!m[4]) continue;                                  // ว่างอยู่แล้ว
      if (!formulas && /<f\b/.test(m[4])) continue;
      out.push(`${m[1]}${m[2]}`);
    }
    return out;
  }

  // แตกสูตรร่วม: เขียนสูตรเต็มให้ทุกเซลล์ในกลุ่ม (เลื่อนตำแหน่งอ้างอิงตามระยะห่างจากเซลล์ต้นแบบ)
  unshare(name, siSet) {
    let x = this.sheetXml(name);
    const base = new Map();
    for (const m of x.matchAll(/<c r="([A-Z]+\d+)"[^>]*>\s*<f\b([^>]*)>([\s\S]*?)<\/f>/g)) {
      const si = attr(`<f${m[2]}>`, 'si');
      if (/t="shared"/.test(m[2]) && siSet.has(si) && /\bref="/.test(m[2])) base.set(si, { at: splitRef(m[1]), f: unesc(m[3]) });
    }
    x = x.replace(/<c r="([A-Z]+\d+)"([^>]*)>(\s*)<f\b([^>]*?)(\/>|>([\s\S]*?)<\/f>)/g, (whole, ref, cattrs, sp, fattrs, rest) => {
      const si = attr(`<f${fattrs}>`, 'si');
      if (!/t="shared"/.test(fattrs) || !siSet.has(si) || !base.has(si)) return whole;
      const b = base.get(si); const at = splitRef(ref);
      const f = shiftFormula(b.f, at.r - b.at.r, at.c - b.at.c);
      return `<c r="${ref}"${cattrs}>${sp}<f>${esc(f)}</f>`;
    });
    this.setSheetXml(name, x);
  }

  // อ่านค่าคงที่ของเซลล์ (ไม่อ่านผลสูตร) — ใช้ตรวจหัวตาราง
  readText(name, ref) {
    const x = this.sheetXml(name); if (!x) return null;
    const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(x); if (!m || !m[1]) return null;
    const t = attr(m[0], 't');
    if (t === 'inlineStr') return unesc((/<t[^>]*>([\s\S]*?)<\/t>/.exec(m[1]) || [])[1] || '');
    const v = (/<v>([\s\S]*?)<\/v>/.exec(m[1]) || [])[1];
    if (v === undefined) return null;
    if (t === 's') return this.sharedString(Number(v));
    return unesc(v);
  }
  sharedString(i) {
    if (!this.sst) {
      const f = this.files.get('xl/sharedStrings.xml');
      this.sst = f ? [...td.decode(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join('')) : [];
    }
    return this.sst[i] ?? null;
  }

  // แนวกระดาษของแผ่นงาน: 'portrait' | 'landscape'
  orientation(name) { const x = this.sheetXml(name); const m = /<pageSetup\b[^>]*>/.exec(x || ''); return (m && attr(m[0], 'orientation')) || 'portrait'; }
  setOrientation(name, o) {
    let x = this.sheetXml(name); if (x === null) return;
    const m = /<pageSetup\b[^>]*\/?>/.exec(x);
    if (m) {
      const tag = /\sorientation="[^"]*"/.test(m[0]) ? m[0].replace(/\sorientation="[^"]*"/, ` orientation="${o}"`) : m[0].replace(/<pageSetup\b/, `<pageSetup orientation="${o}"`);
      x = x.replace(m[0], tag);
    } else {
      // ใส่ต่อจาก pageMargins (ลำดับตามมาตรฐาน)
      x = /<pageMargins\b[^>]*\/>/.test(x) ? x.replace(/(<pageMargins\b[^>]*\/>)/, `$1<pageSetup orientation="${o}"/>`) : x;
    }
    this.setSheetXml(name, x);
  }

  // การย่อ: 'page' พอดี 1 หน้า · 'width' พอดีความกว้าง 1 หน้า · 'none' 100% ตามตัวแบ่งหน้าเดิม
  setFit(name, mode) {
    let x = this.sheetXml(name); if (x === null || !mode) return;
    const on = mode === 'page' || mode === 'width' ? '1' : '0';
    const pr = `<pageSetUpPr fitToPage="${on}"/>`;
    if (/<pageSetUpPr\b[^>]*\/>/.test(x)) x = x.replace(/<pageSetUpPr\b[^>]*\/>/, (t) => (/fitToPage="/.test(t) ? t.replace(/fitToPage="[^"]*"/, `fitToPage="${on}"`) : t.replace('<pageSetUpPr', `<pageSetUpPr fitToPage="${on}"`)));
    else if (/<sheetPr\b[^>]*\/>/.test(x)) x = x.replace(/<sheetPr\b([^>]*)\/>/, `<sheetPr$1>${pr}</sheetPr>`);
    else if (/<sheetPr\b[^>]*>/.test(x)) x = x.replace('</sheetPr>', `${pr}</sheetPr>`);
    else x = x.replace(/(<worksheet\b[^>]*>)/, `$1<sheetPr>${pr}</sheetPr>`);
    const set = (tag, k, v) => (new RegExp(`\\s${k}="`).test(tag) ? tag.replace(new RegExp(`\\s${k}="[^"]*"`), ` ${k}="${v}"`) : tag.replace('<pageSetup', `<pageSetup ${k}="${v}"`));
    if (/<pageSetup\b[^>]*\/?>/.test(x)) {
      x = x.replace(/<pageSetup\b[^>]*\/?>/, (t) => {
        if (mode === 'none') return set(t, 'scale', '100');
        return set(set(t, 'fitToWidth', '1'), 'fitToHeight', mode === 'page' ? '1' : '0');
      });
    } else if (mode !== 'none') x = x.replace(/(<pageMargins\b[^>]*\/>)/, `$1<pageSetup paperSize="9" fitToWidth="1" fitToHeight="${mode === 'page' ? 1 : 0}"/>`);
    this.setSheetXml(name, x);
  }

  /**
   * เลือก/เรียงแผ่นงานที่จะแสดง
   * @param order รายชื่อแผ่นที่ต้องการแสดงตามลำดับ · แผ่นอื่นถูกซ่อน (ยังอยู่ในไฟล์ ต่อท้าย)
   */
  arrange(order) {
    const want = order.map((n) => this.sheet(n)).filter(Boolean);
    const rest = this.sheets.filter((s) => !want.includes(s));
    const list = [...want, ...rest];
    const newIndex = new Map(list.map((s, i) => [s.index, i]));
    const tags = list.map((s) => {
      let tag = s.tag.replace(/\sstate="[^"]*"/, '');
      const hide = !want.includes(s) ? (s.state === 'veryHidden' ? 'veryHidden' : 'hidden') : null;
      if (hide) tag = tag.replace(/<sheet\b/, `<sheet state="${hide}"`);
      return tag;
    });
    let wb = this.wb.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${tags.join('')}</sheets>`);
    // ชื่อที่ผูกกับแผ่น (พื้นที่พิมพ์ หัวตารางซ้ำ) อ้างด้วยลำดับแผ่น ต้องเปลี่ยนตาม
    wb = wb.replace(/(<definedName\b[^>]*\slocalSheetId=")(\d+)(")/g, (_, a, n, b) => `${a}${newIndex.get(Number(n)) ?? n}${b}`);
    wb = wb.replace(/<workbookView\b[^>]*\/?>/, (t) => t.replace(/\s(activeTab|firstSheet)="\d+"/g, '').replace(/<workbookView\b/, '<workbookView activeTab="0" firstSheet="0"'));
    this.wb = wb;
    // เลือกแท็บแรกเท่านั้น
    for (const s of this.sheets) {
      const x = this.sheetXml(s.name); if (x === null) continue;
      const sel = want[0] === s;
      this.setSheetXml(s.name, x.replace(/(<sheetView\b[^>]*?)\stabSelected="[^"]*"/g, '$1').replace(/<sheetView\b/, sel ? '<sheetView tabSelected="1"' : '<sheetView'));
    }
    this.sheets = list.map((s, i) => ({ ...s, index: i, state: want.includes(s) ? 'visible' : 'hidden' }));
  }

  async save() {
    // ให้ Excel คำนวณใหม่ทั้งหมดเมื่อเปิด และลบ calcChain (ลำดับการคำนวณเดิมใช้ไม่ได้แล้ว)
    let wb = this.wb;
    wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (t, a, sl) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${sl}>`)
      : wb.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    const out = new Map(this.files);
    out.set('xl/workbook.xml', te.encode(wb));
    for (const [p, x] of this.xml) out.set(p, te.encode(x));
    if (out.has('xl/calcChain.xml')) {
      out.delete('xl/calcChain.xml');
      out.set('[Content_Types].xml', te.encode(td.decode(out.get('[Content_Types].xml')).replace(/<Override[^>]*calcChain[^>]*\/>/, '')));
      out.set('xl/_rels/workbook.xml.rels', te.encode(td.decode(out.get('xl/_rels/workbook.xml.rels')).replace(/<Relationship[^>]*calcChain[^>]*\/>/, '')));
    }
    return writeZip(out, this.zipOpts);
  }
  get isMacro() { return this.files.has('xl/vbaProject.bin'); }
}

// เลื่อนการอ้างอิงเซลล์แบบสัมพัทธ์ในสูตร (ไม่แตะข้อความในเครื่องหมายคำพูดและชื่อฟังก์ชัน)
export function shiftFormula(f, dr, dc) {
  if (!dr && !dc) return f;
  let out = ''; let i = 0;
  while (i < f.length) {
    if (f[i] === '"') { const j = f.indexOf('"', i + 1); const k = j < 0 ? f.length : j + 1; out += f.slice(i, k); i = k; continue; }
    if (f[i] === "'") { const j = f.indexOf("'", i + 1); const k = j < 0 ? f.length : j + 1; out += f.slice(i, k); i = k; continue; }
    const prev = i ? f[i - 1] : '';
    const m = /^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})/.exec(f.slice(i));
    if (m && !/[A-Za-z0-9_.\]]/.test(prev) && !/^[A-Za-z0-9_(]/.test(f.slice(i + m[0].length))) {
      const c = m[1] ? colNum(m[2]) : colNum(m[2]) + dc;
      const r = m[3] ? Number(m[4]) : Number(m[4]) + dr;
      out += `${m[1]}${colName(c)}${m[3]}${r}`; i += m[0].length; continue;
    }
    const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(f.slice(i));
    if (w) { out += w[0]; i += w[0].length; continue; }
    out += f[i]; i++;
  }
  return out;
}

// วันที่แบบที่ไฟล์ ปพ. ใช้: ปี พ.ศ. ถูกเก็บเป็นปีในวันที่ของ Excel (เช่น 16/5/2568)
export const excelSerialBE = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round((Date.UTC(y + 543, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};
