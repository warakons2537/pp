// =====================================================================
//  แสดงค่าตามรูปแบบตัวเลขของ Excel (number format code)
//  รองรับ: General, 0 # ? . , % E+, ข้อความ "..." \x _x *x @, [สี], [เงื่อนไข],
//  วันที่/เวลา d m y h s AM/PM [h], ภาษาไทย [$-41E] / [$-xx041E] / [$-F800] (วันที่แบบยาวของระบบ)
// =====================================================================
import { serialToYMD, numToText, TEXT_FORMAT, XErr } from './xl-formula.js?v=2569.10.31-3';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const TH_DAYS_S = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COLORS = { black: '000000', blue: '0000FF', cyan: '00FFFF', green: '00FF00', magenta: 'FF00FF', red: 'FF0000', white: 'FFFFFF', yellow: 'FFFF00' };

// ---------------------------------------------------------------------
//  แยกส่วนรูปแบบ
// ---------------------------------------------------------------------
function splitSections(code) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') { q = !q; cur += ch; continue; }
    if (!q && ch === '\\') { cur += ch + (code[i + 1] ?? ''); i++; continue; }
    if (!q && ch === '[') { const j = code.indexOf(']', i); if (j > 0) { cur += code.slice(i, j + 1); i = j; continue; } }
    if (!q && ch === ';') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// แปลงส่วนรูปแบบเป็นโทเค็น
function tokenize(sec) {
  const toks = []; let color = null; let cond = null; let locale = null; let elapsed = null;
  for (let i = 0; i < sec.length;) {
    const ch = sec[i];
    if (ch === '[') {
      const j = sec.indexOf(']', i); const inner = sec.slice(i + 1, j); i = j + 1;
      const lc = inner.toLowerCase();
      if (COLORS[lc]) color = COLORS[lc];
      else if (/^color\s*\d+$/i.test(inner)) color = null;
      else if (/^(<=|>=|<>|<|>|=)\s*-?[\d.]+$/.test(inner)) { const m = /^(<=|>=|<>|<|>|=)\s*(-?[\d.]+)$/.exec(inner); cond = { op: m[1], v: +m[2] }; }
      else if (/^\$/.test(inner)) { const m = /^\$([^-]*)(?:-(.*))?$/.exec(inner); locale = m ? (m[2] || '').toUpperCase() : ''; if (m && m[1]) toks.push({ t: 'lit', v: m[1] }); }
      else if (/^(h+|m+|s+)$/i.test(inner)) { elapsed = inner[0].toLowerCase(); toks.push({ t: 'elapsed', v: inner.toLowerCase() }); }
      continue;
    }
    if (ch === '"') { const j = sec.indexOf('"', i + 1); toks.push({ t: 'lit', v: sec.slice(i + 1, j < 0 ? sec.length : j) }); i = j < 0 ? sec.length : j + 1; continue; }
    if (ch === '\\') { toks.push({ t: 'lit', v: sec[i + 1] ?? '' }); i += 2; continue; }
    if (ch === '_') { toks.push({ t: 'space', v: sec[i + 1] ?? ' ' }); i += 2; continue; }
    if (ch === '*') { toks.push({ t: 'fill', v: sec[i + 1] ?? ' ' }); i += 2; continue; }
    if (ch === '@') { toks.push({ t: 'text' }); i++; continue; }
    const rest = sec.slice(i);
    let m;
    if ((m = /^(AM\/PM|A\/P|am\/pm|a\/p)/.exec(rest))) { toks.push({ t: 'ampm', v: m[1] }); i += m[1].length; continue; }
    if ((m = /^[Ee][+-]/.exec(rest))) { toks.push({ t: 'num', v: m[0] }); i += 2; continue; }
    if ((m = /^(y+|e+|b+)/i.exec(rest))) { toks.push({ t: 'y', v: m[1].toLowerCase() }); i += m[1].length; continue; }
    if ((m = /^(ป+)/.exec(rest))) { toks.push({ t: 'y', v: 'b'.repeat(m[1].length) }); i += m[1].length; continue; }
    if ((m = /^(d+|ว+)/i.exec(rest))) { toks.push({ t: 'd', v: m[1].length }); i += m[1].length; continue; }
    if ((m = /^(m+|ด+)/i.exec(rest))) { toks.push({ t: 'm', v: m[1].length }); i += m[1].length; continue; }
    if ((m = /^(h+|ช+)/i.exec(rest))) { toks.push({ t: 'h', v: m[1].length }); i += m[1].length; continue; }
    if ((m = /^(s+|ท+)/i.exec(rest))) { toks.push({ t: 's', v: m[1].length }); i += m[1].length; continue; }
    if ((m = /^(น+)/.exec(rest))) { toks.push({ t: 'min', v: m[1].length }); i += m[1].length; continue; }
    if ((m = /^([0#?]+|[.,%]|[Ee][+-])/.exec(rest))) { toks.push({ t: 'num', v: m[1] }); i += m[1].length; continue; }
    if (/^t[0#]/.test(rest)) { i++; continue; }  // รหัสตัวเลขไทยในตัว
    toks.push({ t: 'lit', v: ch }); i++;
  }
  // m หลัง h หรือก่อน s คือ นาที
  for (let k = 0; k < toks.length; k++) {
    if (toks[k].t !== 'm') continue;
    const prev = toks.slice(0, k).reverse().find((x) => !['lit', 'space', 'fill'].includes(x.t));
    const next = toks.slice(k + 1).find((x) => !['lit', 'space', 'fill'].includes(x.t));
    if ((prev && (prev.t === 'h' || prev.t === 'elapsed')) || (next && next.t === 's')) toks[k] = { t: 'min', v: toks[k].v };
  }
  const isDate = toks.some((x) => ['y', 'd', 'm', 'h', 's', 'min', 'ampm', 'elapsed'].includes(x.t));
  return { toks, color, cond, locale, isDate, elapsed };
}

const cache = new Map();
function compile(code) {
  let c = cache.get(code); if (c) return c;
  const secs = splitSections(code).map(tokenize);
  c = { secs, general: /^general$/i.test(code.trim()) };
  cache.set(code, c);
  return c;
}

// ---------------------------------------------------------------------
//  จัดรูปแบบ
// ---------------------------------------------------------------------
/**
 * @returns { text, color, fill?: {char, pos}, align?: 'right'|'left' }
 *   ค่า general ที่ยาวเกิน ตัวเรนเดอร์จะย่อเองตามความกว้างคอลัมน์
 */
export function formatValue(v, code = 'General') {
  if (v === null || v === undefined) return { text: '' };
  if (v instanceof XErr) return { text: v.code, err: true };
  if (typeof v === 'boolean') return { text: v ? 'TRUE' : 'FALSE' };
  const fmt = compile(code || 'General');
  if (typeof v === 'string' || v instanceof String) {
    const s = String(v);
    const sec = fmt.secs.length >= 4 ? fmt.secs[3] : fmt.secs.find((x) => x.toks.some((t) => t.t === 'text'));
    if (!sec) return { text: s };
    return render(sec, null, s);
  }
  if (!Number.isFinite(v)) return { text: '#NUM!', err: true };
  if (fmt.general) return { text: numToText(v), general: true };
  // เลือกส่วน
  const s = fmt.secs;
  let sec; let val = v;
  const hasCond = s.some((x) => x.cond);
  if (hasCond) {
    const test = (c, x) => ({ '<': x < c.v, '<=': x <= c.v, '>': x > c.v, '>=': x >= c.v, '=': x === c.v, '<>': x !== c.v })[c.op];
    if (s[0].cond && test(s[0].cond, v)) sec = s[0];
    else if (s[1] && s[1].cond && test(s[1].cond, v)) sec = s[1];
    else sec = s[s[1]?.cond ? 2 : 1] || s[0];
    if (sec !== s[0] && !sec.cond && v < 0 && s[0].cond?.op?.startsWith('>')) { /* ใช้ค่าบวกตาม Excel */ }
    val = Math.abs(v) === v || sec === s[0] ? v : (sec.cond ? v : Math.abs(v));
  } else if (v > 0 || s.length === 1) sec = s[0];
  else if (v < 0) { sec = s[1] || s[0]; if (s[1]) val = -v; }
  else sec = s[2] || s[0];
  if (sec.toks.length === 0 && s.length > 1) return { text: '' };
  if (sec.toks.length === 1 && sec.toks[0].t === 'num' === false && sec.toks.every((t) => t.t === 'lit' || t.t === 'space')) { /* ข้อความล้วน */ }
  if (!sec.toks.some((t) => t.t !== 'lit' && t.t !== 'space' && t.t !== 'fill') && /general/i.test(sec.toks.map((t) => t.v).join(''))) return { text: numToText(val), color: sec.color };
  return render(sec, val, null);
}

function render(sec, n, text) {
  const out = []; let fill = null;
  if (text !== null) {
    for (const t of sec.toks) {
      if (t.t === 'text') out.push(text); else if (t.t === 'lit') out.push(t.v); else if (t.t === 'space') out.push(' '); else if (t.t === 'fill') fill = { ch: t.v, at: out.join('').length };
      else if (t.t === 'num') out.push(t.v === '.' || t.v === ',' || t.v === '%' ? t.v : '');
    }
    return { text: out.join(''), color: sec.color, fill };
  }
  if (sec.isDate) return { text: dateText(sec, n), color: sec.color };
  // ตัวเลข
  const numToks = sec.toks.filter((t) => t.t === 'num');
  const pattern = numToks.map((t) => t.v).join('');
  if (!numToks.length) {
    // มีแต่ข้อความ เช่น "-" หรือ General ในส่วน
    const lit = sec.toks.map((t) => (t.t === 'lit' ? t.v : t.t === 'space' ? ' ' : '')).join('');
    if (/general/i.test(lit)) return { text: lit.replace(/general/i, numToText(n)), color: sec.color };
    return { text: lit, color: sec.color };
  }
  const pct = (pattern.match(/%/g) || []).length;
  let x = n * 100 ** pct;
  const expM = /[Ee]([+-])/.exec(pattern);
  const dot = pattern.indexOf('.');
  const intPat = (dot >= 0 ? pattern.slice(0, dot) : pattern).replace(/[Ee][+-].*$/, '').replace(/%/g, '');
  const fracPat = dot >= 0 ? pattern.slice(dot + 1).replace(/[Ee][+-].*$/, '').replace(/[,%]/g, '') : '';
  const thousands = /[0#?],[0#?]/.test(intPat);
  // จุลภาคท้าย = หารพัน
  const trailComma = (/(,+)$/.exec(intPat.replace(/[^0#?,]/g, '')) || [])[1]?.length || 0;
  if (trailComma && !fracPat) x /= 1000 ** trailComma;
  let expPart = '';
  if (expM) {
    const expPat = pattern.slice(pattern.search(/[Ee][+-]/) + 2);
    let e = 0; if (x !== 0) { e = Math.floor(Math.log10(Math.abs(x))); const ip = intPat.replace(/[^0#?]/g, '').length || 1; e = Math.floor(e / ip) * ip; x /= 10 ** e; }
    expPart = `E${e < 0 ? '-' : expM[1] === '+' ? '+' : ''}${String(Math.abs(e)).padStart(expPat.replace(/[^0]/g, '').length || 1, '0')}`;
  }
  const fd = fracPat.replace(/[^0#?]/g, '').length;
  let rounded = roundHalfAway(Math.abs(x), fd);
  let [ip, fp = ''] = rounded.toFixed(fd).split('.');
  // ส่วนเต็ม
  const iDigits = intPat.replace(/[^0#?]/g, '');
  const minInt = (iDigits.match(/0/g) || []).length;
  if (ip === '0' && minInt === 0) ip = '';
  // เติมหลักที่ขาดตามตัวยึด: 0 → 0, ? → ช่องว่าง, # → ไม่มี
  if (ip.length < iDigits.length) {
    const need = iDigits.slice(0, iDigits.length - ip.length);
    ip = need.replace(/#/g, '').replace(/\?/g, ' ') + ip;
  }
  if (thousands) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // ส่วนทศนิยม: # ตัดศูนย์ท้าย, ? แทนด้วยช่องว่าง
  if (fd) {
    const fchars = fracPat.replace(/[^0#?]/g, '');
    let arr = fp.split('');
    for (let k = fchars.length - 1; k >= 0; k--) {
      if (arr[k] !== '0') break;
      if (fchars[k] === '#') arr[k] = ''; else if (fchars[k] === '?') arr[k] = ' '; else break;
    }
    fp = arr.join('');
  }
  // ประกอบตามตำแหน่งตัวยึด (รองรับตัวคั่นข้อความระหว่างหลัก เช่น 0 0000 00000 00 0)
  const intToks = []; const fracToks = []; let seenDot = false; let seenE = false;
  for (const t of sec.toks) {
    if (t.t === 'num' && t.v === '.') { seenDot = true; continue; }
    if (t.t === 'num' && /^[Ee]/.test(t.v)) { seenE = true; continue; }
    if (seenE) continue;
    (seenDot ? fracToks : intToks).push(t);
  }
  const slots = intToks.filter((t) => t.t === 'num' && /[0#?]/.test(t.v)).reduce((s, t) => s + t.v.replace(/[^0#?]/g, '').length, 0);
  const literalInside = intToks.some((t, k) => (t.t === 'lit' || t.t === 'space') && intToks.slice(0, k).some((u) => u.t === 'num' && /[0#?]/.test(u.v)) && intToks.slice(k + 1).some((u) => u.t === 'num' && /[0#?]/.test(u.v)));
  let intStr;
  if (literalInside && !thousands) {
    // กระจายหลักลงตำแหน่ง
    const digits = ip.replace(/,/g, '');
    let extra = digits.length > slots ? digits.slice(0, digits.length - slots) : '';
    let pool = digits.slice(extra.length).padStart(slots, '\u0000');
    let pi = 0; const parts = [];
    for (const t of intToks) {
      if (t.t === 'num' && /[0#?]/.test(t.v)) {
        let s = '';
        for (const ch of t.v) {
          if (!/[0#?]/.test(ch)) continue;
          const d = pool[pi++];
          s += d === '\u0000' ? (ch === '0' ? '0' : ch === '?' ? ' ' : '') : d;
        }
        if (extra) { s = extra + s; extra = ''; }
        parts.push(s);
      } else if (t.t === 'lit') parts.push(t.v); else if (t.t === 'space') parts.push(' ');
      else if (t.t === 'num') parts.push(t.v === '%' ? '%' : '');
    }
    intStr = parts.join('');
  } else {
    const before = []; const after = []; let hit = false;
    for (const t of intToks) {
      if (t.t === 'num' && /[0#?,]/.test(t.v)) { hit = true; continue; }
      const s = t.t === 'lit' ? t.v : t.t === 'space' ? ' ' : t.t === 'num' && t.v === '%' ? '%' : t.t === 'text' ? '' : '';
      if (t.t === 'fill') { (hit ? after : before).push({ fill: t.v }); continue; }
      (hit ? after : before).push(s);
    }
    const fillAt = before.findIndex((x) => typeof x === 'object');
    const b = before.map((x) => (typeof x === 'object' ? '' : x)).join('');
    const a = after.map((x) => (typeof x === 'object' ? '' : x)).join('');
    intStr = `${b}\u0001${a}`;
    void fillAt;
  }
  let fracStr = '';
  if (seenDot) {
    let k = 0; const parts = [];
    for (const t of fracToks) {
      if (t.t === 'num' && /[0#?]/.test(t.v)) { const len = t.v.replace(/[^0#?]/g, '').length; parts.push(fp.slice(k, k + len)); k += len; }
      else if (t.t === 'lit') parts.push(t.v); else if (t.t === 'space') parts.push(' '); else if (t.t === 'num' && t.v === '%') parts.push('%');
    }
    fracStr = (fp.length || /[0?]/.test(fracPat) || true ? '.' : '') + parts.join('');
  }
  let body;
  if (intStr.includes('\u0001')) {
    const [b, a] = intStr.split('\u0001');
    // ถ้า "." ตามด้วยเฉพาะ # ที่ถูกตัดหมด Excel ยังแสดงจุด
    body = `${b}${ip}${fracStr ? fracStr.replace(/^\.(.*)$/, (m0, rest) => `.${rest}`) : ''}${expPart}${a}`;
    if (seenDot) body = `${b}${ip}${fracStr}${expPart}${a}`;
  } else body = intStr + fracStr + expPart;
  if (n < 0 && !(sec.negHandled)) {
    // ส่วนเดียว: ใส่เครื่องหมายลบเอง (ถ้าค่าไม่ปัดเป็นศูนย์)
    if (Number(rounded) !== 0) body = `-${body}`;
  }
  return { text: body, color: sec.color };
}
function roundHalfAway(x, d) { const f = 10 ** d; const y = Number((x * f).toPrecision(15)); return Math.floor(y + 0.5) / f; }

function dateText(sec, n) {
  const loc = sec.locale || '';
  const thai = /41E$/i.test(loc) || /^TH\b|^TH-TH/i.test(loc) || /^F[48]00$/i.test(loc);
  if (sec.locale && /^F800$/i.test(sec.locale)) {
    // วันที่แบบยาวของระบบ (Windows ภาษาไทย: d MMMM yyyy)
    const { y, m, d } = serialToYMD(n); return `${d} ${TH_MONTHS[m - 1]} ${y}`;
  }
  if (sec.locale && /^F400$/i.test(sec.locale)) { const sec2 = Math.round((n % 1) * 86400); return `${Math.floor(sec2 / 3600)}:${String(Math.floor(sec2 / 60) % 60).padStart(2, '0')}:${String(sec2 % 60).padStart(2, '0')}`; }
  // ปฏิทินพุทธ: [$-107041E] (รหัสปฏิทิน 07) หรือ [$-th-TH,107]
  const cal = /^[0-9A-F]+$/.test(loc) && loc.length >= 6 ? loc.slice(-6, -4) : (/,\s*[0-9A-F]*?(\d\d)$/.exec(loc)?.[1] || '');
  const buddhist = cal === '07';
  const day = Math.floor(n); const { y, m, d } = serialToYMD(day);
  const dow = (day + 6) % 7;
  let secs = Math.round((n - day) * 86400); if (secs >= 86400) secs = 0;
  const hasAmpm = sec.toks.some((t) => t.t === 'ampm');
  const H = Math.floor(secs / 3600); const Mi = Math.floor(secs / 60) % 60; const S = secs % 60;
  const out = [];
  for (const t of sec.toks) {
    switch (t.t) {
      case 'lit': out.push(t.v); break;
      case 'space': out.push(' '); break;
      case 'y': {
        let yy = y;
        if (t.v[0] === 'b' || (buddhist && t.v[0] === 'y') || t.v[0] === 'e') yy = (t.v[0] === 'e' && !thai) ? y : (t.v[0] === 'b' || buddhist || (t.v[0] === 'e' && thai)) ? y + 543 : y;
        out.push(t.v.length <= 2 ? String(yy % 100).padStart(2, '0') : String(yy));
        break;
      }
      case 'm': out.push(t.v === 1 ? String(m) : t.v === 2 ? String(m).padStart(2, '0') : t.v === 3 ? (thai ? TH_MONTHS_S[m - 1] : EN_MONTHS[m - 1].slice(0, 3)) : t.v === 5 ? (thai ? TH_MONTHS[m - 1][0] : EN_MONTHS[m - 1][0]) : (thai ? TH_MONTHS[m - 1] : EN_MONTHS[m - 1])); break;
      case 'd': out.push(t.v === 1 ? String(d) : t.v === 2 ? String(d).padStart(2, '0') : t.v === 3 ? (thai ? TH_DAYS_S[dow] : EN_DAYS[dow].slice(0, 3)) : (thai ? TH_DAYS[dow] : EN_DAYS[dow])); break;
      case 'h': { let h = H; if (hasAmpm) { h %= 12; if (h === 0) h = 12; } out.push(t.v >= 2 ? String(h).padStart(2, '0') : String(h)); break; }
      case 'min': out.push(t.v >= 2 ? String(Mi).padStart(2, '0') : String(Mi)); break;
      case 's': out.push(t.v >= 2 ? String(S).padStart(2, '0') : String(S)); break;
      case 'ampm': out.push(H < 12 ? (t.v.length > 3 ? 'AM' : 'A') : (t.v.length > 3 ? 'PM' : 'P')); break;
      case 'elapsed': { const tot = n * 24; out.push(t.v[0] === 'h' ? String(Math.floor(tot)) : t.v[0] === 'm' ? String(Math.floor(tot * 60)) : String(Math.floor(tot * 3600))); break; }
      case 'num': out.push(t.v === '.' ? '.' : t.v.replace(/[#?]/g, '').replace(/0+/, (z) => String(Math.round(((n * 86400) % 1) * 10 ** z.length)).padStart(z.length, '0'))); break;
      default:
    }
  }
  return out.join('');
}

// ให้ฟังก์ชัน TEXT() ของเครื่องคำนวณใช้ตัวจัดรูปแบบนี้
TEXT_FORMAT.fn = (v, f) => formatValue(v, f).text;

// รูปแบบนี้เป็นวันที่หรือไม่ (ใช้ตัดสินการจัดชิด)
export function isDateFormat(code) { if (!code || /^general$/i.test(code)) return false; return compile(code).secs[0].isDate; }
