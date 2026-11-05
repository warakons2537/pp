// =====================================================================
//  วันหยุด / วันสำคัญของโรงเรียน (ตาราง school_days) — แสดงในหน้าเช็กชื่อ
//  kind = holiday: วันหยุด (ช่องเช็กชื่อของวันนั้นถูกปิด) · note: วันสำคัญ/ข้อความแจ้ง (ยังเช็กชื่อได้)
//  ผู้ดูแลระบบจัดการที่ ตั้งค่าระบบ → วันหยุด/วันสำคัญ · ครูทุกคนอ่านได้
// =====================================================================
import { iso, fromIso } from './util.js?v=2569.11.1-31';

export const KINDS = { holiday: 'วันหยุด (ไม่ต้องเช็กชื่อ)', note: 'วันสำคัญ / ข้อความแจ้ง (ยังเช็กชื่อได้)' };
export const KIND_SHORT = { holiday: 'วันหยุด', note: 'วันสำคัญ' };

// อ่านวันหยุด/วันสำคัญช่วง [from, to] · ตารางยังไม่ถูกสร้างในฐานข้อมูล (ยังไม่ได้รัน SQL) = ไม่มีข้อมูล และ missing = true
export async function loadSchoolDays(db, from, to) {
  try {
    const q = {}; if (from) q.gte = { day: from }; if (to) q.lte = { day: to };
    return { rows: (await db.select('school_days', q)).sort((a, b) => String(a.day).localeCompare(String(b.day))), missing: false };
  } catch { return { rows: [], missing: true }; }
}
export const dayMapOf = (rows) => new Map(rows.map((r) => [r.day, r]));
export const isHoliday = (map, date) => map.get(date)?.kind === 'holiday';

// ทุกวันที่ใน [from, to] (YYYY-MM-DD) · skipWeekend = ข้ามเสาร์-อาทิตย์ · จำกัดไม่เกิน max วัน
export function expandRange(from, to, { skipWeekend = false, max = 120 } = {}) {
  if (!from) return [];
  const out = []; const d = fromIso(from); const end = fromIso(to || from);
  while (d <= end && out.length < max) { const w = d.getDay(); if (!(skipWeekend && (w === 0 || w === 6))) out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}

// วันสำคัญที่ตรงกับวันที่เดิมทุกปี (ตัวอย่างตั้งต้น — แก้/ลบได้ · วันพระ/วันหยุดชดเชย/วันหยุดเลื่อนได้ต้องเพิ่มเองตามประกาศ)
export const FIXED_HOLIDAYS = [
  [1, 1, 'วันขึ้นปีใหม่'], [4, 6, 'วันจักรี'], [4, 13, 'วันสงกรานต์'], [4, 14, 'วันสงกรานต์'], [4, 15, 'วันสงกรานต์'],
  [5, 1, 'วันแรงงานแห่งชาติ'], [5, 4, 'วันฉัตรมงคล'], [6, 3, 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี'],
  [7, 28, 'วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระวชิรเกล้าเจ้าอยู่หัว (ร.10)'], [8, 12, 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าสิริกิติ์ พระบรมราชชนนีพันปีหลวง / วันแม่แห่งชาติ'],
  [10, 13, 'วันนวมินทรมหาราช'], [10, 23, 'วันปิยมหาราช'], [12, 5, 'วันคล้ายวันพระบรมราชสมภพ ร.9 / วันพ่อแห่งชาติ'], [12, 10, 'วันรัฐธรรมนูญ'], [12, 31, 'วันสิ้นปี'],
];
// แถววันสำคัญคงที่ของปีการศึกษา (พ.ค. ปี ค.ศ. = พ.ศ.-543 ถึง เม.ย. ปีถัดไป)
export function fixedHolidayRows(academicYear) {
  const y0 = academicYear - 543;
  return FIXED_HOLIDAYS.map(([m, d, name]) => ({ day: `${m >= 5 ? y0 : y0 + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, name, kind: 'holiday' }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
