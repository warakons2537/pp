// ฟังก์ชันล้วนของตารางแบบ Excel (ไม่แตะหน้าจอ ทดสอบได้): แปลงข้อความจากคลิปบอร์ด · เติมค่าแบบคัดลอก/เรียงเลข
export const parseClip = (text) => String(text).replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
export const toTsv = (rows) => rows.map((r) => r.join('\t')).join('\n');

const NUM = /^-?\d+(\.\d+)?$/;
export const isNum = (s) => NUM.test(String(s).trim());
const fmt = (x) => String(+x.toFixed(6));          // ตัดเศษทศนิยมลอยตัว (0.1+0.2)

// src = ค่าต้นทางเรียงให้ "ตัวสุดท้ายอยู่ติดช่องที่จะเติม" · n = จำนวนช่องที่จะเติม
// series = เรียงเลข (ใช้ได้เมื่อต้นทางเป็นตัวเลขทั้งหมด) · ไม่งั้นคัดลอกวนซ้ำตามรูปแบบต้นทาง
export function fillValues(src, n, { series = false } = {}) {
  const L = src.length; const out = [];
  if (!L) return Array(n).fill('');
  if (series && src.every(isNum)) {
    const nums = src.map(Number);
    const step = L > 1 ? (nums[L - 1] - nums[0]) / (L - 1) : 1;
    for (let k = 1; k <= n; k++) out.push(fmt(nums[L - 1] + step * k));
  } else for (let k = 0; k < n; k++) out.push(src[k % L]);
  return out;
}

// เติมต้นทางทุกคอลัมน์/แถวตามกฎ Excel: ต้นทางตัวเลข 2 ช่องขึ้นไป = เรียงเลข · ช่องเดียว = คัดลอก · กด Ctrl สลับ
export const wantSeries = (src, ctrl) => src.every(isNum) && ((src.length > 1) !== !!ctrl);
