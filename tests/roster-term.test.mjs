// ทดสอบรายชื่อนักเรียนตามวันที่/ภาคเรียน (ย้ายเข้า-ออกกลางปี): node tests/roster-term.test.mjs
import assert from 'node:assert/strict';
import { getRoster, enrolledOn, enrolledDuring, inTermList, joinedDuringTerm, leftDuringTerm, academicYearMonths, termRange } from '../js/data.js';

const t1 = { academic_year: 2569, term: 1, start_date: '2026-05-18', end_date: '2026-10-31' };
const t2 = { academic_year: 2569, term: 2, start_date: '2026-11-02', end_date: '2027-03-31' };
const E = (o) => ({ status: 'active', entered_on: null, left_on: null, ...o });

// อยู่ในห้องตามวัน
const stay = E({}); const join2 = E({ entered_on: '2026-11-10' }); const leave2 = E({ status: 'left', left_on: '2026-12-05' }); const leaveNoDate = E({ status: 'left' });
assert.ok(enrolledOn(stay, '2026-06-01') && enrolledOn(stay, '2027-02-01'));
assert.ok(!enrolledOn(join2, '2026-11-09') && enrolledOn(join2, '2026-11-10') && enrolledOn(join2, '2027-01-01'));        // ย้ายเข้า 10 พ.ย.
assert.ok(enrolledOn(leave2, '2026-12-05') && !enrolledOn(leave2, '2026-12-06') && enrolledOn(leave2, '2026-09-01'));    // วันที่ออกยังนับว่าอยู่
assert.ok(!enrolledOn(leaveNoDate, '2026-09-01'), 'ย้ายออกแต่ไม่มีวันที่ = ไม่นับในมุมมองตามวัน');
// ใช้กับนักเรียนจาก getRoster (enroll_status) ได้เหมือนกัน
assert.ok(!enrolledOn({ enroll_status: 'left', left_on: null }, '2026-09-01'));

// ช่วงเวลา (ทั้งเดือน)
assert.ok(enrolledDuring(join2, '2026-11-01', '2026-11-30') && !enrolledDuring(join2, '2026-10-01', '2026-10-31'));
assert.ok(enrolledDuring(leave2, '2026-12-01', '2026-12-31') && !enrolledDuring(leave2, '2027-01-01', '2027-01-31'));

// รายชื่อสิ้นภาคเรียน (ใช้ใน ปพ.5)
assert.ok(inTermList(stay, t1) && inTermList(stay, t2));
assert.ok(!inTermList(join2, t1) && inTermList(join2, t2), 'ย้ายเข้าภาค 2 ไม่อยู่ในเล่มภาค 1');
assert.ok(inTermList(leave2, t1) && !inTermList(leave2, t2), 'ย้ายออกกลางภาค 2 ยังอยู่ในเล่มภาค 1');
assert.ok(!inTermList(leaveNoDate, t1));
assert.ok(joinedDuringTerm(join2, t2) && !joinedDuringTerm(join2, t1) && !joinedDuringTerm(stay, t1));
assert.ok(leftDuringTerm(leave2, t2) && !leftDuringTerm(leave2, t1));
assert.equal(termRange(t1).to, '2026-10-31');

// getRoster กับฐานข้อมูลจำลอง
const ens = [
  { id: 'e1', student_id: 's1', classroom_id: 'c', number: 1, ...stay }, { id: 'e2', student_id: 's2', classroom_id: 'c', number: 2, ...join2 },
  { id: 'e3', student_id: 's3', classroom_id: 'c', number: 3, ...leave2 }, { id: 'e4', student_id: 's4', classroom_id: 'c', number: 4, ...leaveNoDate },
];
const db = { select: async (table, q = {}) => (table === 'enrollments' ? ens : ['s1', 's2', 's3', 's4'].filter((id) => q.in.id.includes(id)).map((id) => ({ id, first_name: id }))) };
const ids = async (o) => (await getRoster(db, 'c', o)).map((s) => s.id).join(',');
assert.equal(await ids({}), 's1,s2');                                                   // เดิม: คนที่ยังเรียนอยู่
assert.equal(await ids({ includeLeft: true }), 's1,s2,s3,s4');
assert.equal(await ids({ asOf: '2026-09-01' }), 's1,s3');                               // ก่อน s2 เข้า
assert.equal(await ids({ asOf: '2026-12-10' }), 's1,s2');                               // หลัง s3 ออก
assert.equal(await ids({ from: '2026-11-01', to: '2026-11-30' }), 's1,s2,s3');           // ทั้งเดือน พ.ย.
assert.equal(await ids({ term: t1 }), 's1,s3');
assert.equal(await ids({ term: t2 }), 's1,s2');

// เดือนของปีการศึกษา (พ.ค.–เม.ย.) ถึงเดือนปัจจุบัน
const ms = (ay, today) => academicYearMonths(ay, today).map((m) => `${m.y}-${m.m0 + 1}`).join(' ');
assert.equal(ms(2569, new Date(2026, 10, 5)), '2026-5 2026-6 2026-7 2026-8 2026-9 2026-10 2026-11');   // ถึง พ.ย. 2569
assert.equal(ms(2569, new Date(2027, 3, 20)).split(' ').length, 12);
assert.equal(ms(2569, new Date(2026, 3, 1)), '');                                                       // ยังไม่ถึงปีการศึกษา
assert.equal(ms(2568, new Date(2026, 10, 5)).split(' ').length, 12); assert.ok(ms(2568, new Date(2026, 10, 5)).endsWith('2026-4'));
console.log('roster-term: ผ่านทั้งหมด');
