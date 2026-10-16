// =====================================================================
//  อ่านไฟล์ผลสัมฤทธิ์เดิมของโรงเรียน (.xlsb / .xlsx / .xls) แผ่นงาน "ผลสัมฤทธิ์"
//  แปลงเป็น ช่องคะแนน + คะแนนรายคน เพื่อนำเข้าวิชาในระบบ
// =====================================================================

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};
const PREFIX = /^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นางสาว|น\.ส\.|นาย|นาง|ดช\.?|ดญ\.?)\s*/;
// ชื่อสำหรับจับคู่: ตัดคำนำหน้าและช่องว่างทั้งหมด
export const nameKey = (s) => norm(s).replace(PREFIX, '').replace(/\s+/g, '');

// แปลงแผ่นงานของ SheetJS เป็นตาราง [แถว][คอลัมน์] เริ่มที่ A1 เสมอ
export function sheetMatrix(XLSX, ws) {
  if (!ws || !ws['!ref']) return [];
  const rg = XLSX.utils.decode_range(ws['!ref']);
  const out = [];
  for (let r = 0; r <= rg.e.r; r++) {
    const row = [];
    for (let c = 0; c <= rg.e.c; c++) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; row.push(cell ? (cell.v ?? null) : null); }
    out.push(row);
  }
  return out;
}

export function findAchievementSheet(wb) {
  const names = wb.SheetNames || [];
  return names.find((n) => norm(n) === 'ผลสัมฤทธิ์') || names.find((n) => /ผลสัมฤทธิ์/.test(n)) || null;
}

/**
 * @param m ตาราง [แถว][คอลัมน์] (แถว 0 = แถว 1 ใน Excel)
 * @returns { line1, line2, midRatio, finalRatio, items:[{title, max, col}], students:[{no, name, scores, final, special, total, grade}], warnings }
 */
export function parseAchievement(m) {
  const warnings = [];
  const cell = (r, c) => (m[r] ? m[r][c] : null);
  // แถวหัวตาราง: คอลัมน์ A = "เลขที่"
  const hr = m.findIndex((row) => norm(row?.[0]) === 'เลขที่');
  if (hr < 0) throw new Error('ไม่พบหัวตาราง "เลขที่" ในแผ่นงานผลสัมฤทธิ์');
  const rTitle = hr + 1; const rMax = hr + 2; const r0 = hr + 3;
  const width = Math.max(...m.slice(0, r0 + 1).map((r) => r?.length || 0));
  // ช่องสรุป: หาคอลัมน์ "ระดับผลการเรียน" แล้วนับถอยหลัง (รวม · ปลายภาค · รวมทั้งหมด · เกรด)
  let gradeCol = -1;
  for (let c = 2; c < width; c++) if (/ระดับผลการเรียน/.test(norm(cell(hr, c)))) { gradeCol = c; break; }
  if (gradeCol < 0) throw new Error('ไม่พบคอลัมน์ "ระดับผลการเรียน"');
  const totCol = gradeCol - 1; const finCol = gradeCol - 2; const ayCol = gradeCol - 3;
  const midRatio = num(cell(rMax, ayCol)) ?? 70;
  const finalRatio = num(cell(rMax, finCol)) ?? (100 - midRatio);

  const items = [];
  for (let c = 2; c < ayCol; c++) {
    const max = num(cell(rMax, c));
    const t = cell(rTitle, c);
    if (max === null || max <= 0) continue;          // ช่องที่ไม่มีคะแนนเต็ม = ไม่ได้ใช้
    const title = typeof t === 'number' || /^\d+$/.test(norm(t)) ? `งานที่ ${norm(t)}` : norm(t) || `ช่องที่ ${c - 1}`;
    items.push({ title, max, col: c });
  }

  const students = [];
  for (let r = r0; r < m.length; r++) {
    const a = norm(cell(r, 0));
    if (/^(รวม|เฉลี่ย)/.test(a)) break;
    const name = norm(cell(r, 1));
    if (!name) continue;
    const g = cell(r, gradeCol);
    const gs = norm(g);
    students.push({
      no: num(cell(r, 0)),
      name,
      scores: items.map((it) => num(cell(r, it.col))),
      final: num(cell(r, finCol)),
      special: gs === 'ร' || gs === 'มส' ? gs : null,
      total: num(cell(r, totCol)),
      grade: gs === 'ร' || gs === 'มส' ? gs : num(g),
    });
  }
  if (!items.length) warnings.push('ไม่พบช่องคะแนนเก็บที่มีคะแนนเต็ม');
  if (!students.length) warnings.push('ไม่พบรายชื่อนักเรียน');
  if (midRatio + finalRatio !== 100) warnings.push(`สัดส่วนคะแนน ${midRatio}:${finalRatio} รวมไม่เท่ากับ 100`);
  return { line1: norm(cell(0, 2)), line2: norm(cell(1, 2)), midRatio, finalRatio, items, students, warnings };
}

// จับคู่รายชื่อในไฟล์กับนักเรียนในห้อง: ชื่อ-สกุลตรงกันก่อน แล้วจึงใช้เลขที่ถ้าชื่อในไฟล์ไม่ซ้ำกับใคร
export function matchStudents(parsed, roster, nameOf) {
  const byName = new Map(roster.map((s) => [nameKey(nameOf(s)), s]));
  const byNo = new Map(roster.filter((s) => s.number !== null && s.number !== undefined).map((s) => [Number(s.number), s]));
  const used = new Set(); const rows = [];
  for (const p of parsed.students) {
    let s = byName.get(nameKey(p.name)); let how = 'name';
    if (!s && p.no !== null && byNo.has(p.no) && !used.has(byNo.get(p.no).id)) { s = byNo.get(p.no); how = 'number'; }
    if (s && used.has(s.id)) { s = null; }
    if (s) used.add(s.id);
    rows.push({ p, s: s || null, how: s ? how : null });
  }
  return rows;
}
