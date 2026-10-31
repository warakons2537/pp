// งานค้างรายเมนู: เช็กชื่อ/เช็กอาหารวันนี้ยังไม่ครบ (เฉพาะวันจันทร์–ศุกร์) และ 0 ร มส รอยืนยัน (เฉพาะผู้ดูแลระบบ)
import assert from 'node:assert/strict';
const RealDate = Date;
const at = (iso) => { globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [iso])); } static now() { return new RealDate(iso).getTime(); } }; };
const { computeBadges } = await import('../js/notify.js');

const mkCtx = ({ admin = false, menus = ['daily', 'meals', 'remedial'], marked = 0 } = {}) => ({
  isAdmin: admin, menus: new Set(menus), myClassrooms: [{ id: 'c1' }, { id: 'c2' }],
  db: { select: async (t, o) => {
    if (t === 'enrollments') return [{ student_id: `${o.eq.classroom_id}-1`, status: 'active', number: 1 }, { student_id: `${o.eq.classroom_id}-2`, status: 'active', number: 2 }];
    if (t === 'students') return o.in.id.map((id) => ({ id, first_name: id, last_name: 'x' }));
    if (t === 'remedial_cases') return [{}, {}, {}];
    return Array.from({ length: o.eq.classroom_id === 'c1' ? marked : 2 }, (_, i) => ({ student_id: i })); // ห้อง c2 ครบแล้ว
  } },
});

at('2026-10-28T09:00:00');                                        // วันพุธ
assert.deepEqual(await computeBadges(mkCtx({ marked: 1 })), { daily: 1, meals: 1 }, 'ห้อง c1 ยังไม่ครบ ห้อง c2 ครบ = ค้าง 1 ห้อง');
assert.deepEqual(await computeBadges(mkCtx({ marked: 2 })), {}, 'ครบทุกห้อง = ไม่มีจุดแดง');
assert.deepEqual(await computeBadges(mkCtx({ marked: 0, menus: ['daily'] })), { daily: 1 }, 'ไม่มีเมนูเช็กอาหาร = ไม่นับ');
assert.deepEqual(await computeBadges(mkCtx({ admin: true, marked: 2 })), { remedial: 3 }, 'ผู้ดูแลระบบเห็น 0 ร มส รอยืนยัน');
at('2026-10-31T09:00:00');                                        // วันเสาร์
assert.deepEqual(await computeBadges(mkCtx({ marked: 0 })), {}, 'เสาร์-อาทิตย์ไม่เตือนเช็กชื่อ');
globalThis.Date = RealDate;
console.log('badges ok');
