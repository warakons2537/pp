// =====================================================================
//  นำเข้าไฟล์ประเมิน 3 ชนิดของโรงเรียน (ส่วนอ่านไฟล์ ไม่แตะหน้าจอ/ฐานข้อมูล)
//   trait8      คุณลักษณะอันพึงประสงค์   แผ่น "ข้อที่ 1.1" … "ข้อที่ 8.2" (คะแนน 0–3 ต่อพฤติกรรม รหัส 1.1.1)
//   competency5 สมรรถนะสำคัญของผู้เรียน    แผ่น "ข้อที่1 สื่อสาร" … "ข้อที่ 5 เทคโนโลยี" (คะแนน 1–3 ต่อรายการ รหัส 1.1)
//   rtw         การอ่าน คิดวิเคราะห์ และเขียน แผ่น "สรุป" (ระดับ 0–3 ต่อตัวชี้วัด 1–5)
//  รับ "แผ่นงาน → ตาราง [แถว][คอลัมน์]" (แถว 0 = แถว 1 ใน Excel) ผลลัพธ์เป็นค่ารายนักเรียนตามรหัสช่อง
// =====================================================================
import { parseLine1 } from './subject-import.js?v=2569.10.30-3';
import { COMPETENCIES, SUBS } from './assess-forms.js?v=2569.10.30-3';

export const KIND_LABEL = { trait8: 'คุณลักษณะอันพึงประสงค์', competency5: 'สมรรถนะสำคัญของผู้เรียน', rtw: 'อ่าน คิดวิเคราะห์ และเขียน' };

const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const flat = (v) => String(v ?? '').replace(/\s+/g, '');
const intOrNull = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};

// ชนิดไฟล์จากชื่อแผ่นงาน
export function detectKind(sheetNames) {
  const names = sheetNames.map(flat);
  if (names.filter((n) => /^ข้อที่\d\.\d$/.test(n)).length >= 5) return 'trait8';
  if (COMPETENCIES.filter((c) => names.includes(flat(c.sheet))).length >= 3) return 'competency5';
  if (names.includes('สรุป') && names.includes('รวม')) return 'rtw';
  return null;
}

// ชั้น/ภาคเรียน/ปีการศึกษา จากหัวกระดาษ (แถวบน ๆ ของแผ่นแรกที่มีคำว่า "ชั้น")
function headInfo(m) {
  for (let r = 0; r < 6; r++) {
    for (const v of m[r] || []) {
      const t = txt(v);
      if (/ชั้น/.test(t) && /(ประถมศึกษา|มัธยมศึกษา|อนุบาล|ป\.|ม\.)/.test(t)) {
        const p = parseLine1(t);
        if (p.level) return p;
      }
    }
  }
  return { level: null, room: null, term: null, year: null };
}

// แถวนักเรียน: ช่อง A เป็นเลขที่ (ตัวเลข) และ B เป็นชื่อ
function studentRows(m, from) {
  const out = [];
  for (let r = from; r < m.length; r++) {
    const no = intOrNull(m[r]?.[0]);
    const name = txt(m[r]?.[1]);
    if (no === null || Number.isNaN(no) || !name) continue;
    out.push({ r, no, name });
  }
  return out;
}

function addTo(map, st, code, score, warnings, where, lo, hi) {
  const v = intOrNull(score);
  if (v === null) return;
  if (Number.isNaN(v) || !Number.isInteger(v) || v < lo || v > hi) { warnings.push(`${where} ${st.name}: "${score}" ไม่อยู่ในช่วง ${lo}–${hi} (ข้าม)`); return; }
  if (!map.has(st.key)) map.set(st.key, { no: st.no, name: st.name, values: new Map() });
  map.get(st.key).values.set(code, v);
}

const keyOf = (name) => flat(name);

// ---------- คุณลักษณะ ----------
function parseTrait(sheets, warnings) {
  const map = new Map(); let used = 0;
  for (const sub of SUBS) {
    const key = Object.keys(sheets).find((k) => flat(k) === `ข้อที่${sub.code}`);
    if (!key) continue;
    const m = sheets[key]; used++;
    // แถวหัวตาราง: มีเซลล์ขึ้นต้นด้วยรหัสพฤติกรรม เช่น "1.1.1 ..."
    let hr = -1; const cols = {};
    for (let r = 0; r < Math.min(m.length, 15) && hr < 0; r++) {
      (m[r] || []).forEach((v, c) => { const x = txt(v).match(/^(\d\.\d\.\d)(?!\d)/); if (x && x[1].startsWith(`${sub.code}.`)) cols[x[1]] = c; });
      if (Object.keys(cols).length) hr = r;
    }
    if (hr < 0) { warnings.push(`แผ่น "${key}": ไม่พบหัวคอลัมน์พฤติกรรม`); continue; }
    const missing = sub.items.map((_, i) => `${sub.code}.${i + 1}`).filter((c) => !(c in cols));
    if (missing.length) warnings.push(`แผ่น "${key}": ไม่พบคอลัมน์ ${missing.join(', ')}`);
    for (const s of studentRows(m, hr + 1)) {
      const st = { ...s, key: keyOf(s.name) };
      for (const [code, c] of Object.entries(cols)) addTo(map, st, code, m[s.r][c], warnings, `แผ่น ${sub.code}`, 0, 3);
    }
  }
  if (!used) warnings.push('ไม่พบแผ่น "ข้อที่ x.x"');
  return map;
}

// ---------- สมรรถนะ ----------
function parseCompetency(sheets, warnings) {
  const map = new Map(); let used = 0;
  for (const comp of COMPETENCIES) {
    const key = Object.keys(sheets).find((k) => flat(k) === flat(comp.sheet));
    if (!key) continue;
    const m = sheets[key]; used++;
    // แถวหัวตาราง: เซลล์ที่ขึ้นต้นด้วย "1." "2." … (รายการประเมิน) ในแถวใต้ "เลขที่"
    let hr = -1; const cols = [];
    for (let r = 0; r < Math.min(m.length, 15) && hr < 0; r++) {
      if (txt(m[r]?.[0]) !== 'เลขที่') continue;
      for (let r2 = r; r2 <= r + 2; r2++) {
        const found = [];
        (m[r2] || []).forEach((v, c) => { const x = txt(v).match(/^(\d)\.(?!\d)/); if (x && c >= 3) found.push([Number(x[1]), c]); });
        if (found.length >= 4) { found.forEach(([n, c]) => { cols[n - 1] = c; }); hr = r2; break; }
      }
    }
    if (hr < 0) { warnings.push(`แผ่น "${key}": ไม่พบหัวคอลัมน์รายการประเมิน`); continue; }
    for (const s of studentRows(m, hr + 1)) {
      const st = { ...s, key: keyOf(s.name) };
      cols.forEach((c, i) => { if (c !== undefined) addTo(map, st, `${comp.no}.${i + 1}`, m[s.r][c], warnings, `แผ่นสมรรถนะ ${comp.no}`, 1, 3); });
    }
  }
  if (!used) warnings.push('ไม่พบแผ่นสมรรถนะ');
  return map;
}

// ---------- อ่านคิดวิเคราะห์เขียน (แผ่น "สรุป": ระดับ 0–3 ต่อตัวชี้วัด) ----------
function parseRtw(sheets, warnings) {
  const map = new Map();
  const key = Object.keys(sheets).find((k) => flat(k) === 'สรุป');
  if (!key) { warnings.push('ไม่พบแผ่น "สรุป"'); return map; }
  const m = sheets[key];
  let hr = -1; const cols = {};
  for (let r = 0; r < Math.min(m.length, 12) && hr < 0; r++) {
    if (txt(m[r]?.[0]) !== 'เลขที่') continue;
    for (let r2 = r; r2 <= r + 3; r2++) {
      const found = {};
      (m[r2] || []).forEach((v, c) => { const n = intOrNull(v); if (c >= 2 && Number.isInteger(n) && n >= 1 && n <= 5 && !(n in found)) found[n] = c; });
      if (Object.keys(found).length === 5) { Object.assign(cols, found); hr = r2; break; }
    }
  }
  if (hr < 0) { warnings.push('แผ่น "สรุป": ไม่พบหัวคอลัมน์ตัวชี้วัด 1–5'); return map; }
  for (const s of studentRows(m, hr + 1)) {
    const st = { ...s, key: keyOf(s.name) };
    for (const [n, c] of Object.entries(cols)) addTo(map, st, String(n), m[s.r][c], warnings, 'แผ่นสรุป', 0, 3);
  }
  return map;
}

/**
 * @param sheets { ชื่อแผ่น: ตาราง }  ·  fileName ใช้แสดงผล
 * @returns { kind, fileName, level, room, term, year, students:[{no,name,values:Map}], warnings }
 */
export function parseAssessFile(sheets, fileName = '') {
  const names = Object.keys(sheets);
  const kind = detectKind(names);
  const warnings = [];
  if (!kind) return { kind: null, fileName, level: null, room: null, term: null, year: null, students: [], warnings: ['ไม่ใช่ไฟล์คุณลักษณะ สมรรถนะ หรืออ่านคิดวิเคราะห์เขียนของโรงเรียน'] };
  // หัวกระดาษอยู่แผ่นแรกที่มีข้อมูล (rtw อยู่แถว 3 ของแผ่นรายวิชา)
  let head = { level: null, room: null, term: null, year: null };
  for (const n of names) { head = headInfo(sheets[n]); if (head.level) break; }
  const map = kind === 'trait8' ? parseTrait(sheets, warnings) : kind === 'competency5' ? parseCompetency(sheets, warnings) : parseRtw(sheets, warnings);
  const students = [...map.values()].sort((a, b) => a.no - b.no);
  if (!students.length) warnings.push('ไม่พบรายชื่อนักเรียนที่มีคะแนน');
  if (!head.level) warnings.push('ไม่พบชั้นเรียนในหัวกระดาษ (เลือกห้องเอง)');
  return { kind, fileName, ...head, students, warnings };
}
