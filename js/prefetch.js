// โหลดข้อมูลที่ใช้บ่อยไว้ในเครื่องล่วงหน้า (ตอนออนไลน์) เพื่อให้เช็กชื่อ/เช็กอาหาร/รายคาบ เปิดได้แม้เน็ตหลุด
// ต้องเรียกด้วยรูปแบบเดียวกับหน้าจอจริง (ชื่อตาราง/เงื่อนไข) ผลจึงตรงกับที่ชั้นออฟไลน์จำไว้
import { getRoster } from './data.js?v=2569.10.31-11';
import { iso, todayIso, daysInMonth } from './util.js?v=2569.10.31-11';

export async function prefetchOffline(ctx) {
  if (ctx.db.mode !== 'supabase' || navigator.onLine === false) return;
  const now = new Date(); const y = now.getFullYear(); const m0 = now.getMonth();
  const from = iso(new Date(y, m0, 1)); const to = iso(new Date(y, m0, daysInMonth(y, m0))); const today = todayIso();
  const safe = async (f) => { try { await f(); } catch { /* ข้ามได้ ไม่กระทบการใช้งาน */ } };
  for (const room of ctx.myClassrooms.slice(0, 12)) {
    await safe(() => getRoster(ctx.db, room.id));
    for (const t of ['daily_attendance', 'meal_checks']) {
      await safe(() => ctx.db.select(t, { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } }));
      await safe(() => ctx.db.select(t, { eq: { classroom_id: room.id }, gte: { date: today }, lte: { date: today } }));
    }
  }
  for (const k of ctx.myCourses.slice(0, 16)) {
    await safe(() => getRoster(ctx.db, k.classroom_id));
    await safe(() => ctx.db.select('period_attendance', { eq: { course_id: k.id } }));
    await safe(() => ctx.db.rpc('course_attendance_summary', { crs: k.id }));
  }
}
