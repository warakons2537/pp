// เมนูของแอป: ชื่อ ลำดับ กลุ่ม และกติกาว่าใครเห็นเมนูไหน
// ผู้ดูแลระบบเห็นทุกเมนูเสมอ (การตั้งค่าซ่อนเมนูไม่มีผลกับผู้ดูแลระบบ)
// ครู: ถ้าผู้ดูแลระบบกำหนดเมนูรายคนไว้ (profiles.menus) ใช้ตามนั้น ไม่เช่นนั้นเห็นตามหน้าที่ที่ได้รับมอบหมาย
import { isSecondary } from './remedial.js?v=2569.10.31-4';

// ​ = จุดตัดบรรทัดที่ระบุเอง (ตัวตัดคำของเบราว์เซอร์ตัด "เช็กชื่อ" ผิดที่)
export const NAV = { home: 'วันนี้', students: 'นักเรียน', daily: 'เช็กชื่อ​ประจำวัน', meals: 'เช็กอาหาร​กลางวัน', health: 'น้ำหนัก-​ส่วนสูง',
  traits: 'คุณลักษณะ/​กิจกรรม', period: 'เช็กชื่อ​รายคาบ', scores: 'คะแนน​รายวิชา', remedial: 'ติดตาม 0 ร มส',
  reports: 'รายงาน A4', print: 'พิมพ์ ปพ.6 / ปพ.5', setup: 'ตั้งค่าระบบ' };
export const plain = (v) => NAV[v].replace(/​/g, '');

// กลุ่มในเมนูด้านข้าง (ชื่อเมนูในนี้ต้องตรงกับหัวข้อของหน้านั้น)
export const MENU_GROUPS = [
  { key: 'class', label: 'งานประจำชั้น', items: ['students', 'daily', 'meals', 'health', 'traits'] },
  { key: 'teach', label: 'งานสอน', items: ['period', 'scores', 'remedial'] },
  { key: 'docs', label: 'เอกสารและรายงาน', items: ['reports', 'print'] },
];
export const GRANTABLE = MENU_GROUPS.flatMap((g) => g.items);          // เมนูที่ผู้ดูแลระบบเลือกเปิดให้ครูได้
export const MENU_ORDER = ['home', ...GRANTABLE, 'setup'];

// เมนูตามหน้าที่: ทุกคนเห็น วันนี้ · รายงาน · พิมพ์ / ครูประจำชั้นเห็นงานประจำชั้น / ครูผู้สอนเห็นงานสอน
export function autoMenus(ctx) {
  const s = new Set(['home', 'reports', 'print']);
  if (ctx.myClassrooms.length) ['students', 'daily', 'meals', 'health', 'traits'].forEach((v) => s.add(v));
  if (ctx.myCourses.length) ['period', 'scores'].forEach((v) => s.add(v));
  if (ctx.myCourses.some((k) => isSecondary(k.classroom)) || ctx.myClassrooms.some(isSecondary)) s.add('remedial');
  return s;
}

export function allowedMenus(ctx) {
  if (ctx.isAdmin) return new Set(MENU_ORDER);
  const custom = ctx.me.menus;
  if (Array.isArray(custom)) return new Set(['home', ...custom.filter((v) => GRANTABLE.includes(v))]);
  return autoMenus(ctx);
}

// ครูที่ยังไม่ได้รับมอบหมายอะไรเลยและผู้ดูแลระบบยังไม่ได้กำหนดเมนูให้
export const hasNoDuties = (ctx) => !ctx.isAdmin && !Array.isArray(ctx.me.menus) && !ctx.myClassrooms.length && !ctx.myCourses.length;
