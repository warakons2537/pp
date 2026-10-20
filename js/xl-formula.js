// =====================================================================
//  เครื่องคำนวณสูตร Excel (เฉพาะที่ไฟล์ ปพ. ใช้ + ฟังก์ชันพื้นฐานที่พบบ่อย)
//  - คำนวณแบบขี้เกียจ (lazy) ทีละเซลล์ จำผลไว้ · กันวนซ้ำ (circular → 0)
//  - แยกสูตรธรรมดา / สูตรอาร์เรย์ (CSE) ตามกติกา Excel รุ่นเดิม
//    (implicit intersection, พารามิเตอร์ชนิด V/R/A)
//  - วันที่: ระบบ 1900 · ข้อความวันที่อ่านแบบ วัน/เดือน/ปี (ปีตามตัวอักษร เช่น 2568)
// =====================================================================

export const MAXROW = 1048576; export const MAXCOL = 16384;

export class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const E = {}; for (const c of ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A']) E[c] = new XErr(c);
export const ERR = { NULL: E['#NULL!'], DIV0: E['#DIV/0!'], VALUE: E['#VALUE!'], REF: E['#REF!'], NAME: E['#NAME?'], NUM: E['#NUM!'], NA: E['#N/A'] };
const isErr = (v) => v instanceof XErr;

export class Ref {
  constructor(sheet, r1, c1, r2 = r1, c2 = c1) { this.sheet = sheet; this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2); this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2); }
  get h() { return this.r2 - this.r1 + 1; } get w() { return this.c2 - this.c1 + 1; }
  get single() { return this.r1 === this.r2 && this.c1 === this.c2; }
}
export class Mat {
  constructor(rows) { this.rows = rows; this.h = rows.length; this.w = rows[0]?.length || 0; }
  at(i, j) { return this.rows[i][j]; }
  static of(v) { return v instanceof Mat ? v : new Mat([[v]]); }
}

// ---------------------------------------------------------------------
//  ตัวแยกคำ / ตัวแจงสูตร
// ---------------------------------------------------------------------
export const colNum = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const RX = {
  ws: /^[\s ]+/,
  str: /^"((?:[^"]|"")*)"/,
  num: /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/,
  err: /^(#NULL!|#DIV\/0!|#VALUE!|#REF!|#NAME\?|#NUM!|#N\/A|#GETTING_DATA)/,
  sheetQ: /^'((?:[^']|'')+)'!/,
  sheet: /^([^\s!:(),'"&=<>+\-*/^%{};\[\]]+)!/,
  colRange: /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})(?![\w(.])/,
  rowRange: /^\$?(\d+):\$?(\d+)(?![\w(.])/,
  cell: /^\$?([A-Za-z]{1,3})\$?(\d+)(?![\w(.!])/,
  fn: /^((?:_xlfn\.|_xlws\.)?[A-Za-z_][A-Za-z0-9_.]*)\(/,
  name: /^([A-Za-z_\\฀-๿][\w.฀-๿]*)/,
  op: /^(<>|<=|>=|[-+*/^&=<>%:,(){};])/,
};

function tokenize(src) {
  const out = []; let s = src; let i = 0;
  const push = (t) => { out.push(t); };
  while (s.length) {
    let m;
    if ((m = RX.ws.exec(s))) { s = s.slice(m[0].length); continue; }
    if ((m = RX.str.exec(s))) { push({ k: 'str', v: m[1].replace(/""/g, '"') }); s = s.slice(m[0].length); continue; }
    if ((m = RX.err.exec(s))) { push({ k: 'err', v: m[1] }); s = s.slice(m[0].length); continue; }
    let sheet = null;
    if ((m = RX.sheetQ.exec(s)) || (m = RX.sheet.exec(s))) {
      // [1]ชื่อแผ่น = ลิงก์ภายนอกที่ชี้กลับมาที่สมุดงานเดิม (ไฟล์ที่ถูกคัดลอก) → ใช้แผ่นชื่อเดียวกันในไฟล์นี้
      sheet = m[1].replace(/''/g, "'").replace(/^\[\d+\]/, ''); s = s.slice(m[0].length);
      if ((m = RX.err.exec(s))) { push({ k: 'err', v: m[1] }); s = s.slice(m[0].length); continue; }
    }
    if ((m = RX.colRange.exec(s))) { push({ k: 'ref', sheet, r1: 1, c1: colNum(m[1]), r2: MAXROW, c2: colNum(m[2]) }); s = s.slice(m[0].length); continue; }
    if ((m = RX.rowRange.exec(s))) { push({ k: 'ref', sheet, r1: +m[1], c1: 1, r2: +m[2], c2: MAXCOL }); s = s.slice(m[0].length); continue; }
    if ((m = RX.cell.exec(s)) && colNum(m[1]) <= MAXCOL) { push({ k: 'ref', sheet, r1: +m[2], c1: colNum(m[1]) }); s = s.slice(m[0].length); continue; }
    if (sheet !== null) {
      if ((m = RX.name.exec(s))) { push({ k: 'name', sheet, v: m[1] }); s = s.slice(m[0].length); continue; }
      throw new Error(`อ่านสูตรไม่ได้: ${src}`);
    }
    if ((m = RX.err.exec(s))) { push({ k: 'err', v: m[1] }); s = s.slice(m[0].length); continue; }
    if ((m = RX.num.exec(s))) { push({ k: 'num', v: Number(m[1]) }); s = s.slice(m[0].length); continue; }
    if ((m = RX.fn.exec(s))) { push({ k: 'fn', v: m[1].replace(/^_xl(fn|ws)\./, '').toUpperCase() }); s = s.slice(m[0].length); continue; }
    if ((m = RX.name.exec(s))) {
      const u = m[1].toUpperCase();
      push(u === 'TRUE' || u === 'FALSE' ? { k: 'bool', v: u === 'TRUE' } : { k: 'name', sheet: null, v: m[1] });
      s = s.slice(m[0].length); continue;
    }
    if ((m = RX.op.exec(s))) { push({ k: 'op', v: m[1] }); s = s.slice(m[0].length); continue; }
    throw new Error(`อ่านสูตรไม่ได้: ${src}`);
  }
  return out;
}

const BIN = { ':': 9, '^': 6, '*': 5, '/': 5, '+': 4, '-': 4, '&': 3, '=': 2, '<>': 2, '<': 2, '>': 2, '<=': 2, '>=': 2 };

export function parseFormula(src) {
  const toks = tokenize(src.replace(/^=/, '')); let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  const isOp = (t, v) => t && t.k === 'op' && t.v === v;
  function primary() {
    const t = next();
    if (!t) throw new Error(`สูตรไม่ครบ: ${src}`);
    switch (t.k) {
      case 'num': return { t: 'num', v: t.v };
      case 'str': return { t: 'str', v: t.v };
      case 'bool': return { t: 'bool', v: t.v };
      case 'err': return { t: 'err', v: E[t.v] || ERR.NA };
      case 'ref': return { t: 'ref', sheet: t.sheet, r1: t.r1, c1: t.c1, r2: t.r2 ?? t.r1, c2: t.c2 ?? t.c1 };
      case 'name': return { t: 'name', sheet: t.sheet, v: t.v };
      case 'fn': {
        const args = [];
        if (isOp(peek(), ')')) { next(); return { t: 'fn', name: t.v, args }; }
        for (;;) {
          if (isOp(peek(), ',') || isOp(peek(), ')')) args.push({ t: 'missing' }); else args.push(expr(0));
          const s = next();
          if (isOp(s, ')')) break;
          if (!isOp(s, ',')) throw new Error(`สูตรผิดรูปแบบ: ${src}`);
        }
        return { t: 'fn', name: t.v, args };
      }
      case 'op':
        if (t.v === '(') { const e = expr(0); if (!isOp(next(), ')')) throw new Error(`วงเล็บไม่ครบ: ${src}`); return e; }
        if (t.v === '-' || t.v === '+') { const a = unaryOperand(); return t.v === '-' ? { t: 'neg', a } : { t: 'pos', a }; }
        if (t.v === '{') return arrayConst();
        break;
      default:
    }
    throw new Error(`สูตรผิดรูปแบบ: ${src}`);
  }
  function unaryOperand() {
    // นิเสธผูกแน่นกว่า ^ (Excel: -2^2 = 4) แต่หลวมกว่า :
    let a = primary();
    while (isOp(peek(), ':')) { next(); a = { t: 'range', a, b: primary() }; }
    return a;
  }
  function arrayConst() {
    const rows = [[]];
    for (;;) {
      const t = next();
      if (isOp(t, '}')) break;
      if (isOp(t, ',')) continue;
      if (isOp(t, ';')) { rows.push([]); continue; }
      let neg = false; let u = t;
      if (isOp(u, '-')) { neg = true; u = next(); }
      const v = u.k === 'num' ? (neg ? -u.v : u.v) : u.k === 'str' ? u.v : u.k === 'bool' ? u.v : u.k === 'err' ? (E[u.v] || ERR.NA) : null;
      rows.at(-1).push(v);
    }
    return { t: 'const', v: new Mat(rows) };
  }
  function postfix(a) { while (isOp(peek(), '%')) { next(); a = { t: 'pct', a }; } return a; }
  function expr(min) {
    let a = postfix(unaryOperand());
    for (;;) {
      const t = peek();
      if (!t || t.k !== 'op' || !(t.v in BIN)) break;
      const pr = BIN[t.v]; if (pr < min) break;
      next();
      const b = expr(t.v === '^' ? pr + 0.5 : pr + 1);  // ^ ใน Excel คิดซ้ายไปขวา
      a = { t: 'op', op: t.v, a, b };
    }
    return a;
  }
  const e = expr(0);
  if (p < toks.length) throw new Error(`สูตรเกินมา: ${src}`);
  return e;
}

// ---------------------------------------------------------------------
//  ตัวช่วยชนิดข้อมูล
// ---------------------------------------------------------------------
const snap = (x) => (Number.isFinite(x) && x !== 0 ? Number(x.toPrecision(15)) : x);

// serial ↔ วันที่ (ระบบ 1900 พร้อมบั๊กปีอธิกสุรทิน 1900)
export function serialToYMD(s) {
  s = Math.floor(s);
  if (s === 60) return { y: 1900, m: 2, d: 29 };
  const t = Date.UTC(1899, 11, s < 60 ? 31 : 30) + s * 86400000;
  const dt = new Date(t); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
export function ymdToSerial(y, m, d) {
  if (y < 1900) y += 1900;  // แบบ Excel: ปี 0–1899 บวก 1900
  const t = Date.UTC(y, m - 1, d); const base = Date.UTC(1899, 11, 30);
  let s = Math.round((t - base) / 86400000);
  if (s < 61) s -= 1;
  return s;
}

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function textToNumber(s) {
  const t = String(s).trim();
  if (t === '') return null;
  let m = /^([+-]?)\s*(\d{1,3}(?:,\d{3})+|\d*)(\.\d*)?(?:[eE]([+-]?\d+))?\s*(%?)$/.exec(t);
  if (m && (m[2] || m[3]) && m[3] !== '.') {
    let n = Number(`${m[2].replace(/,/g, '')}${m[3] || ''}${m[4] ? `e${m[4]}` : ''}`);
    if (m[1] === '-') n = -n; if (m[5]) n /= 100;
    return n;
  }
  m = /^\((\d+(?:\.\d+)?)\)$/.exec(t); if (m) return -Number(m[1]);
  // วันที่ วัน/เดือน/ปี (ปีตามตัวอักษร)
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) {
    const d = +m[1]; const mo = +m[2]; let y = +m[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let v = ymdToSerial(y, mo, d);
      if (m[4]) v += (+m[4] * 3600 + +m[5] * 60 + +(m[6] || 0)) / 86400;
      return v;
    }
  }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/.exec(t);
  if (m) { const mo = MONTHS_EN.indexOf(m[2].slice(0, 3).toLowerCase()); if (mo >= 0) { let y = +m[3]; if (y < 100) y += 2000; return ymdToSerial(y, mo + 1, +m[1]); } }
  m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) return (+m[1] * 3600 + +m[2] * 60 + +(m[3] || 0)) / 86400;
  return null;
}

export function numToText(n) {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-9) {
    let s = n.toExponential(14).replace(/\.?0+e/, 'e');
    s = s.replace(/e([+-])(\d)$/, 'e$10$2').toUpperCase(); return s;
  }
  let s = Number(n.toPrecision(15)).toString();
  if (/e/.test(s)) s = Number(n.toPrecision(15)).toFixed(20).replace(/\.?0+$/, '');
  return s;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) throw v;
  if (typeof v === 'string') { const n = textToNumber(v); if (n === null) throw ERR.VALUE; return n; }
  throw ERR.VALUE;
}
function toStr(v) {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return numToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErr(v)) throw v;
  return String(v);
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  if (isErr(v)) throw v;
  if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; throw ERR.VALUE; }
  throw ERR.VALUE;
}
const typeRank = (v) => (typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 0);
// เปรียบเทียบแบบ Excel: ตัวเลข < ข้อความ < ตรรกะ · ข้อความไม่สนตัวพิมพ์ · ช่องว่างเทียบได้กับทุกชนิด
function cmp(a, b) {
  if (isErr(a)) throw a; if (isErr(b)) throw b;
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ta = typeRank(a); const tb = typeRank(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  if (ta === 1) { const x = snap(a); const y = snap(b); return x < y ? -1 : x > y ? 1 : 0; }
  if (ta === 2) { const x = a.toLowerCase(); const y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return a === b ? 0 : a ? 1 : -1;
}

// เงื่อนไขแบบ COUNTIF/SUMIF
function makeCriteria(c) {
  if (isErr(c)) return (v) => isErr(v) && v.code === c.code;
  if (typeof c === 'number') return (v) => typeof v === 'number' ? snap(v) === snap(c) : (typeof v === 'string' && textToNumber(v) === c);
  if (typeof c === 'boolean') return (v) => v === c;
  if (c === null || c === undefined) c = '';
  let s = String(c); let op = '=';
  const m = /^(<=|>=|<>|<|>|=)/.exec(s); if (m) { op = m[1]; s = s.slice(m[1].length); }
  const n = textToNumber(s);
  if (n !== null && s.trim() !== '') {
    const test = { '=': (x) => x === 0, '<>': (x) => x !== 0, '<': (x) => x < 0, '>': (x) => x > 0, '<=': (x) => x <= 0, '>=': (x) => x >= 0 }[op];
    return (v) => {
      if (typeof v === 'number') return test(snap(v) - snap(n) === 0 ? 0 : snap(v) < snap(n) ? -1 : 1);
      if (op === '<>') return true;
      if (op === '=' && typeof v === 'string') { const vn = textToNumber(v); return vn !== null && vn === n; }
      return false;
    };
  }
  const bu = s.toUpperCase();
  if (bu === 'TRUE' || bu === 'FALSE') { const b = bu === 'TRUE'; return op === '<>' ? (v) => v !== b : op === '=' ? (v) => v === b : () => false; }
  if (s === '') {
    if (op === '=') return (v) => v === null || v === undefined || v === '';
    if (op === '<>') return (v) => !(v === null || v === undefined || v === '');
  }
  if (op === '=' || op === '<>') {
    const wild = /[*?~]/.test(s);
    const re = wild ? new RegExp(`^${s.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\/])/g, (x, esc, w, sp) => (esc ? `\\${esc}` : w === '*' ? '[\\s\\S]*' : w === '?' ? '[\\s\\S]' : `\\${sp}`)) }$`, 'i') : null;
    const low = s.toLowerCase();
    const eq = (v) => typeof v === 'string' && (re ? re.test(v) : v.toLowerCase() === low);
    return op === '=' ? eq : (v) => !eq(v);
  }
  const low = s.toLowerCase();
  const test = { '<': (x) => x < 0, '>': (x) => x > 0, '<=': (x) => x <= 0, '>=': (x) => x >= 0 }[op];
  return (v) => typeof v === 'string' && test(v.toLowerCase() < low ? -1 : v.toLowerCase() > low ? 1 : 0);
}

// ---------------------------------------------------------------------
//  เครื่องคำนวณ
// ---------------------------------------------------------------------
export class Engine {
  /**
   * @param book { sheet(name) → { cells: Map(key→cell), maxRow, maxCol } | null, sheetNames: [], names: [{name, sheet|null, ref}] }
   *   cell: { v, f (ข้อความสูตร), arr: 'A1:B2' (สูตรอาร์เรย์), master: key (สมาชิกของสูตรอาร์เรย์) }
   *   key = r * 16384 + c (r,c เริ่มที่ 1)
   */
  constructor(book, { today = new Date() } = {}) {
    this.book = book; this.ast = new Map(); this.rangeCache = new Map(); this.today = today;
    this.depth = 0;
  }
  parse(f) { let a = this.ast.get(f); if (!a) { try { a = parseFormula(f); } catch (e) { a = { t: 'err', v: ERR.NAME, bad: String(e.message || e) }; } this.ast.set(f, a); } return a; }

  // ค่าของเซลล์ (คำนวณถ้าจำเป็น)
  value(sheetName, r, c) {
    const sh = this.book.sheet(sheetName); if (!sh) return ERR.REF;
    const key = r * MAXCOL + c; const cell = sh.cells.get(key);
    if (!cell) return null;
    if (cell.master !== undefined && cell.master !== key) {
      const m = sh.cells.get(cell.master);
      if (m && m.f) { this.computeArray(sheetName, sh, cell.master, m); return cell.cv !== undefined ? cell.cv : cell.v ?? null; }
    }
    if (!cell.f) return cell.v ?? null;
    if (cell.cv !== undefined) return cell.cv;
    if (cell.arr) { this.computeArray(sheetName, sh, key, cell); return cell.cv; }
    if (cell.busy) return 0;
    cell.busy = true;
    let out;
    try {
      const r0 = this.evalNode(this.parse(cell.f), { sh: sheetName, r, c, arr: false });
      out = this.finalScalar(r0, { sh: sheetName, r, c, arr: false });
    } catch (e) { out = isErr(e) ? e : this.fail(e); }
    cell.busy = false; cell.cv = out;
    return out;
  }
  // เปลี่ยนค่าเซลล์ข้อมูล แล้วล้างผลคำนวณของแผ่นนั้นและแผ่นที่อ้างถึง (ใช้พิมพ์ ปพ.6 ทีละคน)
  setValue(sheetName, r, c, v) {
    const sh = this.book.sheet(sheetName); if (!sh) return;
    const k = r * MAXCOL + c; const cell = sh.cells.get(k);
    if (cell) { cell.v = v; delete cell.f; delete cell.cv; } else sh.cells.set(k, { s: 0, v });
    this.invalidate(sheetName);
  }
  invalidate(name) {
    if (!this.refs) {
      // แผ่นไหนมีสูตรอ้างถึงแผ่นไหน (ดูจากข้อความสูตร)
      this.refs = new Map();
      const names = this.book.sheetNames || [];
      for (const s of names) {
        const sh = this.book.sheet(s); if (!sh) continue;
        let txt = ''; for (const c of sh.cells.values()) if (c.f) txt += `${c.f}\n`;
        for (const o of names) if (o !== s && (txt.includes(`${o}!`) || txt.includes(`'${o.replace(/'/g, "''")}'!`))) { if (!this.refs.has(o)) this.refs.set(o, new Set()); this.refs.get(o).add(s); }
      }
    }
    const todo = [name]; const seen = new Set();
    while (todo.length) {
      const s = todo.pop(); if (seen.has(s)) continue; seen.add(s);
      const sh = this.book.sheet(s); if (!sh) continue;
      for (const c of sh.cells.values()) if (c.f || c.master !== undefined) delete c.cv;
      for (const k of [...this.rangeCache.keys()]) if (k.startsWith(`${s}|`)) this.rangeCache.delete(k);
      for (const o of this.refs.get(s) || []) todo.push(o);
    }
  }

  // คำนวณสูตรใดๆ ณ ตำแหน่งเซลล์ (ใช้กับการจัดรูปแบบตามเงื่อนไข)
  evalAt(f, sheetName, r, c) {
    const cx = { sh: sheetName, r, c, arr: false };
    try { return this.finalScalar(this.evalNode(this.parse(f), cx), cx); } catch (e) { return isErr(e) ? e : this.fail(e); }
  }
  fail(e) { if (e instanceof RangeError) throw e; return ERR.VALUE; }
  finalScalar(x, cx) {
    if (x instanceof Ref) x = this.intersect(x, cx);
    if (x instanceof Mat) x = x.at(0, 0);
    if (x === null || x === undefined) return 0;
    if (typeof x === 'number') { if (!Number.isFinite(x)) return ERR.NUM; return snap(x); }
    return x;
  }
  computeArray(sheetName, sh, key, cell) {
    if (cell.cv !== undefined || cell.busy) return;
    cell.busy = true;
    const r0 = Math.floor(key / MAXCOL); const c0 = key % MAXCOL;
    const [a, b] = (cell.arr || '').split(':');
    const area = parseA1(a); const area2 = parseA1(b || a);
    let res;
    try {
      const x = this.evalNode(this.parse(cell.f), { sh: sheetName, r: r0, c: c0, arr: true });
      res = this.toMat(x);
    } catch (e) { res = new Mat([[isErr(e) ? e : this.fail(e)]]); }
    cell.busy = false;
    for (let r = area.r; r <= area2.r; r++) {
      for (let c = area.c; c <= area2.c; c++) {
        const i = r - area.r; const j = c - area.c;
        let v = (res.h === 1 ? true : i < res.h) && (res.w === 1 ? true : j < res.w) ? res.at(res.h === 1 ? 0 : i, res.w === 1 ? 0 : j) : ERR.NA;
        if (v === null || v === undefined) v = 0;
        if (typeof v === 'number') v = Number.isFinite(v) ? snap(v) : ERR.NUM;
        const k = r * MAXCOL + c; let tc = sh.cells.get(k);
        if (!tc) { tc = { v: null }; sh.cells.set(k, tc); }
        tc.cv = v;
      }
    }
  }

  // แปลงค่าที่ได้เป็นอาร์เรย์
  toMat(x) {
    if (x instanceof Mat) return x;
    if (x instanceof Ref) return this.rangeMat(x);
    return new Mat([[x]]);
  }
  clip(ref) {
    const sh = this.book.sheet(ref.sheet); if (!sh) return null;
    const r2 = Math.min(ref.r2, Math.max(sh.maxRow, ref.r1)); const c2 = Math.min(ref.c2, Math.max(sh.maxCol, ref.c1));
    return { sh, r2, c2 };
  }
  rangeMat(ref) {
    const k = `${ref.sheet}|${ref.r1}|${ref.c1}|${ref.r2}|${ref.c2}`;
    let m = this.rangeCache.get(k); if (m) return m;
    const cl = this.clip(ref); if (!cl) return new Mat([[ERR.REF]]);
    const rows = [];
    for (let r = ref.r1; r <= cl.r2; r++) { const row = []; for (let c = ref.c1; c <= cl.c2; c++) row.push(this.value(ref.sheet, r, c)); rows.push(row); }
    m = new Mat(rows.length ? rows : [[null]]);
    this.rangeCache.set(k, m);
    return m;
  }
  // วนค่าทุกเซลล์ในช่วง (ข้ามเซลล์ว่างเพื่อความเร็ว)
  *cellsOf(ref) {
    const cl = this.clip(ref); if (!cl) { yield ERR.REF; return; }
    if (ref.h * ref.w > 4096) {
      const keys = [];
      for (const key of cl.sh.cells.keys()) { const r = Math.floor(key / MAXCOL); const c = key % MAXCOL; if (r >= ref.r1 && r <= cl.r2 && c >= ref.c1 && c <= cl.c2) keys.push([r, c]); }
      keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [r, c] of keys) yield this.value(ref.sheet, r, c);
      return;
    }
    const m = this.rangeMat(ref);
    for (const row of m.rows) for (const v of row) yield v;
  }
  intersect(ref, cx) {
    if (ref.single) return this.value(ref.sheet, ref.r1, ref.c1);
    if (ref.c1 === ref.c2 && cx.r >= ref.r1 && cx.r <= ref.r2 && (ref.sheet === cx.sh || true)) return this.value(ref.sheet, cx.r, ref.c1);
    if (ref.r1 === ref.r2 && cx.c >= ref.c1 && cx.c <= ref.c2) return this.value(ref.sheet, ref.r1, cx.c);
    if (cx.r >= ref.r1 && cx.r <= ref.r2 && cx.c >= ref.c1 && cx.c <= ref.c2) return this.value(ref.sheet, cx.r, cx.c);
    return ERR.VALUE;
  }
  // ค่าสำหรับพารามิเตอร์ชนิดค่าเดี่ยว: ในบริบทอาร์เรย์ช่วงหลายเซลล์กลายเป็นอาร์เรย์
  vparam(x, cx) {
    if (x instanceof Ref) {
      if (x.single) return this.value(x.sheet, x.r1, x.c1);
      return cx.arr ? this.rangeMat(x) : this.intersect(x, cx);
    }
    if (x instanceof Mat) return cx.arr ? (x.h * x.w === 1 ? x.at(0, 0) : x) : x.at(0, 0);
    return x;
  }

  evalNode(n, cx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'err': return n.v;
      case 'missing': return null;
      case 'const': return n.v;
      case 'ref': return new Ref(n.sheet ?? cx.sh, n.r1, n.c1, n.r2, n.c2);
      case 'name': return this.resolveName(n, cx);
      case 'range': {
        const a = this.evalNode(n.a, cx); const b = this.evalNode(n.b, cx);
        if (!(a instanceof Ref) || !(b instanceof Ref)) return ERR.VALUE;
        return new Ref(a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2));
      }
      case 'neg': return this.lift([this.vparam(this.evalNode(n.a, cx), cx)], (x) => -toNum(x));
      case 'pos': return this.vparam(this.evalNode(n.a, cx), cx);
      case 'pct': return this.lift([this.vparam(this.evalNode(n.a, cx), cx)], (x) => toNum(x) / 100);
      case 'op': {
        const a = this.vparam(this.evalNode(n.a, cx), cx); const b = this.vparam(this.evalNode(n.b, cx), cx);
        return this.lift([a, b], OPS[n.op]);
      }
      case 'fn': return this.call(n, cx);
      default: return ERR.VALUE;
    }
  }
  resolveName(n, cx) {
    const nm = n.v.toUpperCase();
    const list = this.book.names || [];
    const sheetIdx = (this.book.sheetNames || []).indexOf(n.sheet ?? cx.sh);
    const hit = list.find((x) => x.name.toUpperCase() === nm && x.sheet === sheetIdx) || list.find((x) => x.name.toUpperCase() === nm && (x.sheet === null || x.sheet === undefined));
    if (!hit || !hit.ref) return ERR.NAME;
    if (this.depth > 50) return ERR.REF;
    this.depth++;
    try { return this.evalNode(this.parse(hit.ref), cx); } finally { this.depth--; }
  }

  // คำนวณทีละสมาชิกเมื่อมีอาร์เรย์ (กระจายขนาดแบบ Excel)
  lift(args, fn) {
    let H = 1; let W = 1; let any = false;
    for (const a of args) if (a instanceof Mat) { any = true; H = Math.max(H, a.h); W = Math.max(W, a.w); }
    const run = (vals) => { for (const v of vals) if (isErr(v)) return v; try { const r = fn(...vals); return typeof r === 'number' && !Number.isFinite(r) ? ERR.NUM : r; } catch (e) { if (isErr(e)) return e; throw e; } };
    if (!any) {
      for (const v of args) if (isErr(v)) throw v;
      const r = fn(...args); if (typeof r === 'number' && !Number.isFinite(r)) throw ERR.NUM; return r;
    }
    const rows = [];
    for (let i = 0; i < H; i++) {
      const row = [];
      for (let j = 0; j < W; j++) {
        row.push(run(args.map((a) => {
          if (!(a instanceof Mat)) return a;
          const ii = a.h === 1 ? 0 : i; const jj = a.w === 1 ? 0 : j;
          return ii < a.h && jj < a.w ? a.at(ii, jj) : ERR.NA;
        })));
      }
      rows.push(row);
    }
    return new Mat(rows);
  }

  call(n, cx) {
    const spec = FN[n.name];
    if (!spec) return ERR.NAME;
    if (spec.lazy) return spec.f.call(this, n.args, cx);
    const args = n.args.map((a, i) => {
      const cls = spec.p[Math.min(i, spec.p.length - 1)];
      if (cls === 'A') return this.evalNode(a, { ...cx, arr: true });
      const x = this.evalNode(a, cx);
      if (cls === 'R') return x;
      return this.vparam(x, cx);
    });
    // พารามิเตอร์ V ที่ได้อาร์เรย์ → คำนวณทีละสมาชิก
    const vIdx = args.map((_, i) => spec.p[Math.min(i, spec.p.length - 1)] === 'V');
    if (args.some((a, i) => vIdx[i] && a instanceof Mat)) {
      const mats = args.map((a, i) => (vIdx[i] ? a : new Holder(a)));
      return this.lift(mats, (...vals) => spec.f.call(this, vals.map((v) => (v instanceof Holder ? v.x : v)), cx));
    }
    for (let i = 0; i < args.length; i++) if (vIdx[i] && isErr(args[i]) && !spec.errOk) throw args[i];
    return spec.f.call(this, args, cx);
  }

  // ---- ตัวช่วยสำหรับฟังก์ชัน ----
  // ค่าตัวเลขจากอาร์กิวเมนต์แบบ SUM: ช่วง/อาร์เรย์ → เฉพาะตัวเลข · ค่าตรง → แปลงได้
  *nums(args, { countText = false } = {}) {
    for (const a of args) {
      if (a instanceof Ref) { for (const v of this.cellsOf(a)) { if (isErr(v)) throw v; if (typeof v === 'number') yield v; } continue; }
      if (a instanceof Mat) { for (const row of a.rows) for (const v of row) { if (isErr(v)) throw v; if (typeof v === 'number') yield v; } continue; }
      if (a === null || a === undefined) { if (countText) continue; yield 0; continue; }
      if (isErr(a)) throw a;
      yield toNum(a);
    }
  }
  flat(a) {
    if (a instanceof Ref) return [...this.cellsOf(a)];
    if (a instanceof Mat) return a.rows.flat();
    return [a];
  }
  matOf(a) { return a instanceof Ref ? this.rangeMat(a) : Mat.of(a); }
}
class Holder { constructor(x) { this.x = x; } }

const OPS = {
  '+': (a, b) => toNum(a) + toNum(b),
  '-': (a, b) => toNum(a) - toNum(b),
  '*': (a, b) => toNum(a) * toNum(b),
  '/': (a, b) => { const d = toNum(b); const x = toNum(a); if (d === 0) throw ERR.DIV0; return x / d; },
  '^': (a, b) => { const x = toNum(a); const y = toNum(b); if (x === 0 && y === 0) throw ERR.NUM; const r = x ** y; if (Number.isNaN(r)) throw ERR.NUM; return r; },
  '&': (a, b) => toStr(a) + toStr(b),
  '=': (a, b) => cmp(a, b) === 0,
  '<>': (a, b) => cmp(a, b) !== 0,
  '<': (a, b) => cmp(a, b) < 0,
  '>': (a, b) => cmp(a, b) > 0,
  '<=': (a, b) => cmp(a, b) <= 0,
  '>=': (a, b) => cmp(a, b) >= 0,
};

export function parseA1(s) { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(s || ''); return m ? { c: colNum(m[1]), r: +m[2] } : { c: 1, r: 1 }; }

// ---------------------------------------------------------------------
//  ฟังก์ชัน  p: ชนิดพารามิเตอร์ (ตัวสุดท้ายใช้ซ้ำ) V=ค่าเดี่ยว R=ช่วง/อาร์เรย์ A=คำนวณแบบอาร์เรย์เสมอ
// ---------------------------------------------------------------------
const FN = {};
const def = (name, p, f, extra = {}) => { FN[name] = { p, f, ...extra }; };
const roundTo = (x, d, mode) => {
  x = snap(x); d = Math.trunc(d);
  const f = 10 ** d;
  const y = snap(Math.abs(x) * f);
  let r = mode === 'down' ? Math.floor(y) : mode === 'up' ? Math.ceil(y) : Math.floor(y + 0.5);
  r = Math.sign(x) * r / f;
  return snap(r) || 0;
};

// ---- ตรรกะ ----
def('IF', [], function (a, cx) {
  const c = this.vparam(this.evalNode(a[0], cx), cx);
  const br = (i) => (a.length > i ? (a[i].t === 'missing' ? 0 : this.evalNode(a[i], cx)) : (i === 1 ? true : false));
  if (c instanceof Mat) {
    const t = this.vparam(br(1), cx); const f = this.vparam(br(2), cx);
    return this.lift([c, t, f], (cc, tt, ff) => (toBool(cc) ? tt : ff));
  }
  if (isErr(c)) throw c;
  return toBool(c) ? (a.length > 1 ? br(1) : true) : (a.length > 2 ? br(2) : false);
}, { lazy: true });
const errFallback = (pred) => function (a, cx) {
  let v;
  try { v = this.vparam(this.evalNode(a[0], cx), cx); } catch (e) { if (!isErr(e)) throw e; v = e; }
  const alt = () => this.vparam(a[1] && a[1].t !== 'missing' ? this.evalNode(a[1], cx) : 0, cx);
  if (v instanceof Mat) { const al = alt(); return this.lift([v, al instanceof Mat ? al : new Holder(al)].map((x) => x), (x, y) => (isErr(x) && pred(x) ? (y instanceof Holder ? y.x : y) : x)); }
  if (isErr(v) && pred(v)) return alt();
  if (v === null) return 0;
  return v;
};
// IFERROR ต้องคืนค่า error ภายในอาร์เรย์โดยไม่โยนออก → ทำ lift เอง
FN.IFERROR = { lazy: true, f: function (a, cx) {
  let v;
  try { v = this.vparam(this.evalNode(a[0], cx), cx); } catch (e) { if (!isErr(e)) throw e; v = e; }
  const alt = () => this.vparam(a[1] && a[1].t !== 'missing' ? this.evalNode(a[1], cx) : 0, cx);
  if (v instanceof Mat) {
    let al = null; let got = false;
    const rows = v.rows.map((row, i) => row.map((x, j) => {
      if (!isErr(x)) return x;
      if (!got) { al = alt(); got = true; }
      return al instanceof Mat ? (i < al.h && j < al.w ? al.at(i, j) : al.h === 1 && al.w === 1 ? al.at(0, 0) : ERR.NA) : al;
    }));
    return new Mat(rows);
  }
  if (isErr(v)) return alt();
  return v;
} };
FN.IFNA = { lazy: true, f: function (a, cx) {
  let v; try { v = this.vparam(this.evalNode(a[0], cx), cx); } catch (e) { if (!isErr(e)) throw e; v = e; }
  if (isErr(v) && v.code === '#N/A') return this.vparam(this.evalNode(a[1], cx), cx);
  return v;
} };
void errFallback;
const boolsOf = function (args) {
  const out = [];
  for (const a of args) {
    if (a instanceof Ref || a instanceof Mat) { for (const v of this.flat(a)) { if (isErr(v)) throw v; if (typeof v === 'boolean') out.push(v); else if (typeof v === 'number') out.push(v !== 0); } continue; }
    if (a === null) { out.push(false); continue; }
    out.push(toBool(a));
  }
  if (!out.length) throw ERR.VALUE;
  return out;
};
def('AND', ['R'], function (a) { return boolsOf.call(this, a).every(Boolean); });
def('OR', ['R'], function (a) { return boolsOf.call(this, a).some(Boolean); });
def('XOR', ['R'], function (a) { return boolsOf.call(this, a).filter(Boolean).length % 2 === 1; });
def('NOT', ['V'], ([x]) => !toBool(x));
def('TRUE', [], () => true); def('FALSE', [], () => false);
def('CHOOSE', [], function (a, cx) {
  const i = this.vparam(this.evalNode(a[0], cx), cx);
  if (i instanceof Mat) return this.lift([i], (k) => this.vparam(this.evalNode(a[Math.trunc(toNum(k))] || { t: 'err', v: ERR.VALUE }, cx), cx));
  const k = Math.trunc(toNum(i)); if (k < 1 || k >= a.length) throw ERR.VALUE;
  return this.evalNode(a[k], cx);
}, { lazy: true });

// ---- คณิต / สถิติ ----
def('SUM', ['R'], function (a) { let s = 0; for (const v of this.nums(a)) s += v; return s; });
def('PRODUCT', ['R'], function (a) { let s = 1; let n = 0; for (const v of this.nums(a)) { s *= v; n++; } return n ? s : 0; });
def('AVERAGE', ['R'], function (a) { let s = 0; let n = 0; for (const v of this.nums(a)) { s += v; n++; } if (!n) throw ERR.DIV0; return s / n; });
def('MAX', ['R'], function (a) { let m = -Infinity; for (const v of this.nums(a)) if (v > m) m = v; return m === -Infinity ? 0 : m; });
def('MIN', ['R'], function (a) { let m = Infinity; for (const v of this.nums(a)) if (v < m) m = v; return m === Infinity ? 0 : m; });
def('COUNT', ['R'], function (a) {
  let n = 0;
  for (const x of a) {
    if (x instanceof Ref || x instanceof Mat) { for (const v of this.flat(x)) if (typeof v === 'number') n++; continue; }
    if (typeof x === 'number' || typeof x === 'boolean' || (typeof x === 'string' && textToNumber(x) !== null)) n++;
  }
  return n;
}, { errOk: true });
def('COUNTA', ['R'], function (a) {
  let n = 0;
  for (const x of a) { if (x instanceof Ref || x instanceof Mat) { for (const v of this.flat(x)) if (v !== null && v !== undefined) n++; continue; } if (x !== null) n++; }
  return n;
}, { errOk: true });
def('COUNTBLANK', ['R'], function ([r]) { let n = 0; for (const v of this.flat(r)) if (v === null || v === '') n++; if (r instanceof Ref) { const cl = this.clip(r); if (cl) n += r.h * r.w - (cl.r2 - r.r1 + 1) * (cl.c2 - r.c1 + 1); } return n; });
const statNums = function (x) { const out = []; for (const v of this.nums([x])) out.push(v); return out; };
def('MEDIAN', ['R'], function (a) { const v = []; for (const x of this.nums(a)) v.push(x); if (!v.length) throw ERR.NUM; v.sort((p, q) => p - q); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; });
const modeOf = function (a) {
  const v = []; for (const x of this.nums(a)) v.push(x);
  const cnt = new Map(); let best = null; let bc = 1;
  for (const x of v) { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); }
  for (const x of v) { const c = cnt.get(x); if (c > bc) { bc = c; best = x; } }
  if (best === null) throw ERR.NA;
  return best;
};
def('MODE', ['A'], function (a) { return modeOf.call(this, a); });
def('MODE.SNGL', ['A'], function (a) { return modeOf.call(this, a); });
const kth = (desc) => function ([r, k]) {
  const v = statNums.call(this, r); const n = Math.ceil(toNum(k) - 1e-12);
  if (n < 1 || n > v.length) throw ERR.NUM;
  v.sort((p, q) => (desc ? q - p : p - q)); return v[n - 1];
};
def('LARGE', ['R', 'V'], kth(true)); def('SMALL', ['R', 'V'], kth(false));
const rank = function ([n, r, o]) {
  const x = toNum(n); const v = statNums.call(this, r);
  if (!v.some((y) => snap(y) === snap(x))) throw ERR.NA;
  const asc = o !== null && o !== undefined && toNum(o) !== 0;
  return 1 + v.filter((y) => (asc ? snap(y) < snap(x) : snap(y) > snap(x))).length;
};
def('RANK', ['V', 'R', 'V'], rank); def('RANK.EQ', ['V', 'R', 'V'], rank);
def('ROUND', ['V', 'V'], ([x, d]) => roundTo(toNum(x), toNum(d ?? 0), 'half'));
def('ROUNDDOWN', ['V', 'V'], ([x, d]) => roundTo(toNum(x), toNum(d ?? 0), 'down'));
def('ROUNDUP', ['V', 'V'], ([x, d]) => roundTo(toNum(x), toNum(d ?? 0), 'up'));
def('TRUNC', ['V', 'V'], ([x, d]) => roundTo(toNum(x), toNum(d ?? 0), 'down'));
def('INT', ['V'], ([x]) => Math.floor(snap(toNum(x))));
def('ABS', ['V'], ([x]) => Math.abs(toNum(x)));
def('SIGN', ['V'], ([x]) => Math.sign(toNum(x)));
def('SQRT', ['V'], ([x]) => { const n = toNum(x); if (n < 0) throw ERR.NUM; return Math.sqrt(n); });
def('POWER', ['V', 'V'], ([x, y]) => OPS['^'](x, y));
def('MOD', ['V', 'V'], ([x, y]) => { const a = toNum(x); const b = toNum(y); if (b === 0) throw ERR.DIV0; return snap(a - b * Math.floor(a / b)); });
def('CEILING', ['V', 'V'], ([x, s]) => { const a = toNum(x); const b = toNum(s ?? 1); if (b === 0) return 0; return snap(Math.ceil(snap(a / b)) * b); });
def('FLOOR', ['V', 'V'], ([x, s]) => { const a = toNum(x); const b = toNum(s ?? 1); if (b === 0) throw ERR.DIV0; return snap(Math.floor(snap(a / b)) * b); });
def('PI', [], () => Math.PI);
def('SUMPRODUCT', ['A'], function (a) {
  const ms = a.map((x) => this.matOf(x));
  const h = ms[0].h; const w = ms[0].w;
  if (ms.some((m) => m.h !== h || m.w !== w)) throw ERR.VALUE;
  let s = 0;
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    let p = 1;
    for (const m of ms) { const v = m.at(i, j); if (isErr(v)) throw v; p *= typeof v === 'number' ? v : 0; }
    s += p;
  }
  return s;
});
const ifs = function (pairs, sumRange, mode) {
  // pairs: [[range, crit]...]
  const mats = pairs.map(([r]) => this.matOf(r));
  const tests = pairs.map(([, c]) => makeCriteria(c));
  const h = mats[0].h; const w = mats[0].w;
  const sm = sumRange ? this.matOf(sumRange instanceof Ref ? new Ref(sumRange.sheet, sumRange.r1, sumRange.c1, sumRange.r1 + (pairs[0][0].h ?? h) - 1, sumRange.c1 + (pairs[0][0].w ?? w) - 1) : sumRange) : null;
  let n = 0; let s = 0;
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    if (!mats.every((m, k) => tests[k](i < m.h && j < m.w ? m.at(i, j) : null))) continue;
    n++;
    if (sm) { const v = i < sm.h && j < sm.w ? sm.at(i, j) : null; if (isErr(v)) throw v; if (typeof v === 'number') s += v; }
  }
  if (mode === 'count') return n;
  if (mode === 'avg') { if (!n) throw ERR.DIV0; return s / n; }
  return s;
};
def('COUNTIF', ['R', 'V'], function ([r, c]) {
  if (!(r instanceof Ref) && !(r instanceof Mat)) throw ERR.VALUE;
  const t = makeCriteria(c); let n = 0;
  if (r instanceof Ref) {
    const blankMatches = t(null);
    const cl = this.clip(r); if (!cl) throw ERR.REF;
    let seen = 0;
    for (const v of this.cellsOf(r)) { seen++; if (t(v)) n++; }
    if (blankMatches) { const total = r.h * r.w; const covered = r.h * r.w > 4096 ? seen : (cl.r2 - r.r1 + 1) * (cl.c2 - r.c1 + 1); n += Math.max(0, total - covered); }
    return n;
  }
  for (const v of r.rows.flat()) if (t(v)) n++;
  return n;
}, { errOk: true });
def('COUNTIFS', ['R', 'V'], function (a) { const p = []; for (let i = 0; i < a.length; i += 2) p.push([a[i], a[i + 1]]); return ifs.call(this, p, null, 'count'); }, { errOk: true });
def('SUMIF', ['R', 'V', 'R'], function ([r, c, s]) { return ifs.call(this, [[r, c]], s ?? r, 'sum'); }, { errOk: true });
def('SUMIFS', ['R', 'R', 'V'], function ([s, ...a]) { const p = []; for (let i = 0; i < a.length; i += 2) p.push([a[i], a[i + 1]]); return ifs.call(this, p, s, 'sum'); }, { errOk: true });
def('AVERAGEIF', ['R', 'V', 'R'], function ([r, c, s]) { return ifs.call(this, [[r, c]], s ?? r, 'avg'); }, { errOk: true });

// ---- ค้นหา / อ้างอิง ----
def('ROW', ['R'], function ([r], cx) {
  if (r === undefined || r === null) return cx.r;
  if (!(r instanceof Ref)) throw ERR.VALUE;
  if (cx.arr && r.h > 1) { const cl = r.r2; const rows = []; for (let i = r.r1; i <= cl; i++) rows.push([i]); return new Mat(rows); }
  return r.r1;
});
def('COLUMN', ['R'], function ([r], cx) {
  if (r === undefined || r === null) return cx.c;
  if (!(r instanceof Ref)) throw ERR.VALUE;
  if (cx.arr && r.w > 1) { const row = []; for (let i = r.c1; i <= r.c2; i++) row.push(i); return new Mat([row]); }
  return r.c1;
});
def('ROWS', ['R'], ([r]) => { if (r instanceof Ref || r instanceof Mat) return r.h; if (isErr(r)) throw r; return 1; });
def('COLUMNS', ['R'], ([r]) => { if (r instanceof Ref || r instanceof Mat) return r.w; if (isErr(r)) throw r; return 1; });
def('INDEX', ['R', 'V', 'V', 'V'], function ([r, ri, ci]) {
  if (isErr(r)) throw r;
  let row = ri === null || ri === undefined ? 0 : Math.trunc(toNum(ri));
  let col = ci === null || ci === undefined ? 0 : Math.trunc(toNum(ci));
  if (r instanceof Ref) {
    if (r.h === 1 && ci === undefined && r.w > 1) { col = row; row = 1; }
    if (row < 0 || col < 0 || row > r.h || col > r.w) throw ERR.REF;
    const r1 = row ? r.r1 + row - 1 : r.r1; const r2 = row ? r1 : r.r2;
    const c1 = col ? r.c1 + col - 1 : r.c1; const c2 = col ? c1 : (r.w === 1 ? r.c1 : r.c2);
    return new Ref(r.sheet, r1, c1, r2, c2);
  }
  const m = Mat.of(r);
  if (m.h === 1 && ci === undefined) { col = row; row = 1; }
  if (row < 0 || col < 0 || row > m.h || col > m.w) throw ERR.REF;
  if (row && col) return m.at(row - 1, col - 1);
  if (row) return new Mat([m.rows[row - 1]]);
  if (col) return new Mat(m.rows.map((x) => [x[col - 1]]));
  return m;
});
def('INDIRECT', ['V', 'V'], function ([t, a1], cx) {
  const s = toStr(t).trim();
  if (a1 === false || a1 === 0) throw ERR.REF;
  let m = /^(?:'((?:[^']|'')+)'|([^'!]+))!(.*)$/.exec(s);
  let sheet = cx.sh; let rest = s;
  if (m) { sheet = (m[1] || m[2]).replace(/''/g, "'"); rest = m[3]; }
  if (!this.book.sheet(sheet)) throw ERR.REF;
  let x;
  if ((x = /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?$/.exec(rest))) return new Ref(sheet, +x[2], colNum(x[1]), x[4] ? +x[4] : +x[2], x[3] ? colNum(x[3]) : colNum(x[1]));
  if ((x = /^\$?(\d+):\$?(\d+)$/.exec(rest))) return new Ref(sheet, +x[1], 1, +x[2], MAXCOL);
  if ((x = /^\$?([A-Za-z]{1,3}):\$?([A-Za-z]{1,3})$/.exec(rest))) return new Ref(sheet, 1, colNum(x[1]), MAXROW, colNum(x[2]));
  const nm = this.resolveName({ v: rest, sheet: m ? sheet : null }, cx);
  if (nm instanceof Ref) return nm;
  throw ERR.REF;
});
def('OFFSET', ['R', 'V', 'V', 'V', 'V'], function ([r, dr, dc, h, w]) {
  if (!(r instanceof Ref)) throw ERR.VALUE;
  const r1 = r.r1 + Math.trunc(toNum(dr)); const c1 = r.c1 + Math.trunc(toNum(dc));
  const hh = h === null || h === undefined ? r.h : Math.trunc(toNum(h)); const ww = w === null || w === undefined ? r.w : Math.trunc(toNum(w));
  if (r1 < 1 || c1 < 1 || hh < 1 || ww < 1) throw ERR.REF;
  return new Ref(r.sheet, r1, c1, r1 + hh - 1, c1 + ww - 1);
});
const lookupCmp = (a, b) => { try { return cmp(a, b); } catch { return 2; } };
function exactIndex(list, key) {
  if (typeof key === 'string' && /[*?~]/.test(key)) { const t = makeCriteria(key); return list.findIndex((v) => t(v)); }
  return list.findIndex((v) => v !== null && v !== undefined && typeRank(v) === typeRank(key) && lookupCmp(v, key) === 0);
}
function approxIndex(list, key) {
  // ค้นแบบทวิภาค (เหมือน Excel) ข้ามชนิดที่ไม่ตรง
  let lo = 0; let hi = list.length - 1; let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1; let v = list[mid];
    let k = mid;
    while (k <= hi && (v === null || v === undefined || typeRank(v) !== typeRank(key))) { k++; v = list[k]; }
    if (k > hi) { hi = mid - 1; continue; }
    if (lookupCmp(v, key) <= 0) { ans = k; lo = k + 1; } else hi = mid - 1;
  }
  return ans;
}
def('VLOOKUP', ['V', 'R', 'V', 'V'], function ([key, tbl, ci, approx]) {
  if (isErr(key)) throw key;
  const col = Math.trunc(toNum(ci));
  const exact = approx !== undefined && approx !== null && !toBool(approx);
  if (key === null) key = exact ? '' : 0;
  if (tbl instanceof Ref) {
    if (col < 1) throw ERR.VALUE; if (col > tbl.w) throw ERR.REF;
    const keys = [...this.cellsColumn(tbl, tbl.c1)];
    const i = exact ? exactIndex(keys, key) : approxIndex(keys, key);
    if (i < 0) throw ERR.NA;
    return this.value(tbl.sheet, tbl.r1 + i, tbl.c1 + col - 1);
  }
  const m = Mat.of(tbl); if (col < 1) throw ERR.VALUE; if (col > m.w) throw ERR.REF;
  const keys = m.rows.map((r) => r[0]);
  const i = exact ? exactIndex(keys, key) : approxIndex(keys, key);
  if (i < 0) throw ERR.NA;
  return m.at(i, col - 1);
});
def('HLOOKUP', ['V', 'R', 'V', 'V'], function ([key, tbl, ri, approx]) {
  const m = this.matOf(tbl); const row = Math.trunc(toNum(ri));
  const exact = approx !== undefined && approx !== null && !toBool(approx);
  if (row < 1) throw ERR.VALUE; if (row > m.h) throw ERR.REF;
  const keys = m.rows[0]; const i = exact ? exactIndex(keys, key) : approxIndex(keys, key);
  if (i < 0) throw ERR.NA; return m.at(row - 1, i);
});
def('MATCH', ['V', 'R', 'V'], function ([key, r, t]) {
  if (isErr(key)) throw key;
  const list = this.flat(r); const type = t === undefined || t === null ? 1 : Math.sign(toNum(t));
  let i;
  if (type === 0) i = exactIndex(list, key ?? '');
  else if (type === 1) i = approxIndex(list, key);
  else { i = -1; for (let k = 0; k < list.length; k++) { if (list[k] === null) continue; if (lookupCmp(list[k], key) >= 0) i = k; else break; } }
  if (i < 0) throw ERR.NA; return i + 1;
});
def('LOOKUP', ['V', 'R', 'R'], function ([key, a, b]) {
  const keys = this.flat(a); const i = approxIndex(keys, key); if (i < 0) throw ERR.NA;
  const res = b ? this.flat(b) : keys; return res[i] ?? ERR.NA;
});
Engine.prototype.cellsColumn = function* (ref, c) {
  const cl = this.clip(ref); if (!cl) return;
  for (let r = ref.r1; r <= cl.r2; r++) yield this.value(ref.sheet, r, c);
};

// ---- ข้อความ ----
def('LEN', ['V'], ([x]) => toStr(x).length);
def('LEFT', ['V', 'V'], ([x, n]) => toStr(x).slice(0, n === undefined || n === null ? 1 : Math.trunc(toNum(n))));
def('RIGHT', ['V', 'V'], ([x, n]) => { const s = toStr(x); const k = n === undefined || n === null ? 1 : Math.trunc(toNum(n)); return k ? s.slice(-k) : ''; });
def('MID', ['V', 'V', 'V'], ([x, a, n]) => { const s = toStr(x); const st = Math.trunc(toNum(a)); const k = Math.trunc(toNum(n)); if (st < 1 || k < 0) throw ERR.VALUE; return s.substr(st - 1, k); });
def('TRIM', ['V'], ([x]) => toStr(x).replace(/ +/g, ' ').trim());
def('UPPER', ['V'], ([x]) => toStr(x).toUpperCase()); def('LOWER', ['V'], ([x]) => toStr(x).toLowerCase());
def('CONCATENATE', ['V'], (a) => a.map(toStr).join(''));
def('CONCAT', ['R'], function (a) { return a.map((x) => this.flat(x).map(toStr).join('')).join(''); });
def('TEXTJOIN', ['V', 'V', 'R'], function ([d, ign, ...a]) { const out = []; for (const x of a) for (const v of this.flat(x)) { const s = toStr(v); if (s === '' && toBool(ign)) continue; out.push(s); } return out.join(toStr(d)); });
def('SUBSTITUTE', ['V', 'V', 'V', 'V'], ([x, o, nw, inst]) => {
  const s = toStr(x); const old = toStr(o); const rep = toStr(nw);
  if (!old) return s;
  if (inst === undefined || inst === null) return s.split(old).join(rep);
  const k = Math.trunc(toNum(inst)); if (k < 1) throw ERR.VALUE;
  let idx = -1; for (let i = 0; i < k; i++) { idx = s.indexOf(old, idx + 1); if (idx < 0) return s; }
  return s.slice(0, idx) + rep + s.slice(idx + old.length);
});
def('REPLACE', ['V', 'V', 'V', 'V'], ([x, a, n, nw]) => { const s = toStr(x); const st = Math.trunc(toNum(a)) - 1; return s.slice(0, st) + toStr(nw) + s.slice(st + Math.trunc(toNum(n))); });
def('REPT', ['V', 'V'], ([x, n]) => toStr(x).repeat(Math.max(0, Math.trunc(toNum(n)))));
def('FIND', ['V', 'V', 'V'], ([f, x, st]) => { const i = toStr(x).indexOf(toStr(f), st ? Math.trunc(toNum(st)) - 1 : 0); if (i < 0) throw ERR.VALUE; return i + 1; });
def('SEARCH', ['V', 'V', 'V'], ([f, x, st]) => {
  const s = toStr(x).toLowerCase(); const p = toStr(f).toLowerCase(); const from = st ? Math.trunc(toNum(st)) - 1 : 0;
  const re = new RegExp(p.replace(/~([*?~])|([*?])|([.+^${}()|[\]\\/])/g, (m, e, w, sp) => (e ? `\\${e}` : w === '*' ? '[\\s\\S]*' : w === '?' ? '[\\s\\S]' : `\\${sp}`)));
  const m = re.exec(s.slice(from)); if (!m) throw ERR.VALUE; return from + m.index + 1;
});
def('EXACT', ['V', 'V'], ([a, b]) => toStr(a) === toStr(b));
def('VALUE', ['V'], ([x]) => { if (typeof x === 'number') return x; const n = textToNumber(toStr(x)); if (n === null) throw ERR.VALUE; return n; });
def('N', ['V'], ([x]) => (typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0));
def('T', ['V'], ([x]) => (typeof x === 'string' ? x : ''));
def('TEXT', ['V', 'V'], ([x, f]) => {
  const fmt = toStr(f); let v = x;
  if (typeof v === 'string') { const n = textToNumber(v); if (n !== null) v = n; else return v; }
  if (v === null) v = 0;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return TEXT_FORMAT.fn ? TEXT_FORMAT.fn(v, fmt) : numToText(v);
});
def('CHAR', ['V'], ([x]) => String.fromCharCode(Math.trunc(toNum(x))));
def('CODE', ['V'], ([x]) => { const s = toStr(x); if (!s) throw ERR.VALUE; return s.charCodeAt(0); });
def('CLEAN', ['V'], ([x]) => toStr(x).replace(/[\x00-\x1f]/g, ''));
def('BAHTTEXT', ['V'], ([x]) => bahtText(toNum(x)));

// ---- ข้อมูล ----
def('ISBLANK', ['V'], ([x]) => x === null || x === undefined, { errOk: true });
def('ISNUMBER', ['V'], ([x]) => typeof x === 'number', { errOk: true });
def('ISTEXT', ['V'], ([x]) => typeof x === 'string', { errOk: true });
def('ISNONTEXT', ['V'], ([x]) => typeof x !== 'string', { errOk: true });
def('ISLOGICAL', ['V'], ([x]) => typeof x === 'boolean', { errOk: true });
def('ISERROR', ['V'], ([x]) => isErr(x), { errOk: true });
def('ISERR', ['V'], ([x]) => isErr(x) && x.code !== '#N/A', { errOk: true });
def('ISNA', ['V'], ([x]) => isErr(x) && x.code === '#N/A', { errOk: true });
def('ISEVEN', ['V'], ([x]) => Math.trunc(toNum(x)) % 2 === 0);
def('ISODD', ['V'], ([x]) => Math.abs(Math.trunc(toNum(x))) % 2 === 1);
def('NA', [], () => ERR.NA);
// IS* ต้องรับ error ที่เกิดจากการคำนวณอาร์กิวเมนต์ด้วย และทำทีละสมาชิกเมื่อเป็นอาร์เรย์
const IS_TESTS = {
  ISERROR: (x) => isErr(x), ISERR: (x) => isErr(x) && x.code !== '#N/A', ISNA: (x) => isErr(x) && x.code === '#N/A',
  ISBLANK: (x) => x === null || x === undefined, ISNUMBER: (x) => typeof x === 'number', ISTEXT: (x) => typeof x === 'string',
  ISNONTEXT: (x) => typeof x !== 'string', ISLOGICAL: (x) => typeof x === 'boolean',
};
for (const [k, test] of Object.entries(IS_TESTS)) {
  FN[k] = { lazy: true, f: function (a, cx) {
    let v;
    try {
      const x = this.evalNode(a[0], cx);
      // ISBLANK(ช่วง) ในบริบทธรรมดา = intersection
      v = this.vparam(x, cx);
    } catch (e) { if (!isErr(e)) throw e; v = e; }
    if (v instanceof Mat) return new Mat(v.rows.map((r) => r.map(test)));
    return test(v);
  } };
}

// ---- วันที่ ----
const dateArg = (x) => { const n = toNum(x); if (n < 0) throw ERR.NUM; return Math.floor(n); };
def('DATE', ['V', 'V', 'V'], ([y, m, d]) => {
  let yy = Math.trunc(toNum(y)); let mm = Math.trunc(toNum(m)); const dd = Math.trunc(toNum(d));
  if (yy < 1900) yy += 1900;
  yy += Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12 + 12) % 12 + 1;
  return ymdToSerial(yy, mm, 1) + dd - 1;
});
def('YEAR', ['V'], ([x]) => serialToYMD(dateArg(x)).y);
def('MONTH', ['V'], ([x]) => serialToYMD(dateArg(x)).m);
def('DAY', ['V'], ([x]) => serialToYMD(dateArg(x)).d);
def('WEEKDAY', ['V', 'V'], ([x, t]) => {
  const s = dateArg(x); const dow = s < 60 ? (s + 6) % 7 : (s + 6) % 7; // 0=อาทิตย์ (serial 1 = วันอาทิตย์)
  const type = t === undefined || t === null ? 1 : Math.trunc(toNum(t));
  if (type === 2) return dow === 0 ? 7 : dow; if (type === 3) return dow === 0 ? 6 : dow - 1;
  return dow + 1;
});
def('TODAY', [], function () { const d = this.today; return ymdToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); });
def('NOW', [], function () { const d = this.today; return ymdToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; });
def('DATEVALUE', ['V'], ([x]) => { const n = textToNumber(toStr(x)); if (n === null) throw ERR.VALUE; return Math.floor(n); });
def('EDATE', ['V', 'V'], ([x, m]) => { const a = serialToYMD(dateArg(x)); const k = a.m - 1 + Math.trunc(toNum(m)); const y = a.y + Math.floor(k / 12); const mo = ((k % 12) + 12) % 12 + 1; const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return ymdToSerial(y, mo, Math.min(a.d, last)); });
def('DATEDIF', ['V', 'V', 'V'], ([s, e, u]) => {
  const a = dateArg(s); const b = dateArg(e); if (a > b) throw ERR.NUM;
  const A = serialToYMD(a); const B = serialToYMD(b); const unit = toStr(u).toUpperCase();
  let months = (B.y - A.y) * 12 + B.m - A.m; if (B.d < A.d) months--;
  switch (unit) {
    case 'D': return b - a;
    case 'M': return months;
    case 'Y': return Math.floor(months / 12);
    case 'YM': return ((months % 12) + 12) % 12;
    case 'MD': { let d = B.d - A.d; if (d < 0) { const pm = new Date(Date.UTC(B.y, B.m - 1, 0)).getUTCDate(); d += pm; } return d; }
    case 'YD': { let y = B.y; let st = ymdToSerial(y, A.m, Math.min(A.d, 28) === A.d ? A.d : A.d); if (st > b) st = ymdToSerial(y - 1, A.m, A.d); return b - st; }
    default: throw ERR.NUM;
  }
});

// ---- แทนตัวจัดรูปแบบ TEXT() (ตั้งจากโมดูลรูปแบบตัวเลข) ----
export const TEXT_FORMAT = { fn: null };
export const FUNCTIONS = FN;

// ---- BAHTTEXT ----
function bahtText(n) {
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const pos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const read = (s) => {
    let out = '';
    while (s.length > 6) { out += read(s.slice(0, -6)) + 'ล้าน'; s = s.slice(-6); }
    s = s.replace(/^0+/, ''); const L = s.length;
    for (let i = 0; i < L; i++) {
      const d = +s[i]; const p = L - i - 1; if (!d) continue;
      if (p === 1 && d === 1) out += 'สิบ';
      else if (p === 1 && d === 2) out += 'ยี่สิบ';
      else if (p === 0 && d === 1 && L > 1 && s[L - 2] !== '0') out += 'เอ็ด';
      else out += digits[d] + pos[p];
    }
    return out;
  };
  const neg = n < 0; const v = roundTo(Math.abs(n), 2, 'half');
  const baht = Math.floor(v); const st = Math.round((v - baht) * 100);
  let s = '';
  if (baht) s += `${read(String(baht))}บาท`;
  if (st) s += `${read(String(st))}สตางค์`; else s += baht ? 'ถ้วน' : 'ศูนย์บาทถ้วน';
  return (neg ? 'ลบ' : '') + s;
}
