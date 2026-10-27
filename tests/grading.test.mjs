// ทดสอบเครื่องคำนวณเกรด:  node tests/grading.test.mjs
// ค่าที่คาดหวังคำนวณด้วยสูตรเดียวกับไฟล์ Excel ปพ.5-6 เดิม (ข้อมูลสมมติ)
// ตัวเครื่องคำนวณตรวจเทียบกับผลจริงในไฟล์ Excel ทั้ง 2 ภาคเรียนแล้ว (294 ผลรายวิชา, GPA 21 คน) ตรงกันทั้งหมด
import assert from 'node:assert/strict';
import { computeStudent, gpa, rank, toGrade } from '../js/grading.js';

const items = [
  { id: 'a', kind: 'score', max_score: 5 }, { id: 'b', kind: 'score', max_score: 10 },
  { id: 'c', kind: 'score', max_score: 20 }, { id: 'd', kind: 'score', max_score: 80 },
  { id: 'f', kind: 'final', max_score: 30 },
  { id: 'i1', kind: 'indicator' }, { id: 'i2', kind: 'indicator' },
];
const run = (sc, opts = {}) => computeStudent(items, (id) => sc[id], { midRatio: 70, finalRatio: 30, ...opts });

// 63 / (115 / 70) = 38.35 → ปัดทิ้ง 38 ; +15 = 53 → เกรด 1
let r = run({ a: { score: 5 }, b: { score: 9 }, c: { score: 14 }, d: { score: 35 }, f: { score: 15 }, i1: { passed: true }, i2: { passed: true } });
assert.equal(r.mid, 38); assert.equal(r.total, 53); assert.equal(r.grade, 1); assert.equal(r.indicator, 'ผ'); assert.equal(r.incomplete, false);

// ปัดครึ่งขึ้น: 38.35 → 38 ; ไม่ปัด: 38.35
assert.equal(run({ a: { score: 5 }, b: { score: 9 }, c: { score: 14 }, d: { score: 35 }, f: { score: 15 } }, { rounding: 'round' }).mid, 38);
assert.equal(run({ a: { score: 5 }, b: { score: 9 }, c: { score: 14 }, d: { score: 35 }, f: { score: 15 } }, { rounding: 'none' }).mid, 38.35);

// เส้นแบ่งเกรด
assert.deepEqual([49.99, 50, 54, 55, 60, 65, 70, 75, 79, 80, 100].map(toGrade), [0, 1, 1, 1.5, 2, 2.5, 3, 3.5, 3.5, 4, 4]);

// ร / มส / ยกเว้น มส
const full = { a: { score: 5 }, b: { score: 10 }, c: { score: 20 }, d: { score: 80 }, f: { score: 30 } };
assert.equal(run(full).grade, 4);
assert.equal(run(full, { special: 'ร' }).grade, 'ร');
assert.equal(run(full, { below80: true }).grade, 'มส');
assert.equal(run(full, { below80: true, msWaived: true }).grade, 4);

// ตัวชี้วัด: มี มผ ตัวเดียว = มผ ; ไม่ได้ประเมิน = null
assert.equal(run({ i1: { passed: true }, i2: { passed: false } }).indicator, 'มผ');
assert.equal(run({}).indicator, null);

// ยังไม่มีคะแนน = ไม่มีเกรด ; กรอกบางช่อง = มีเกรดแต่ incomplete
assert.equal(run({}).grade, 0); assert.equal(run({}).incomplete, true);   // มีช่องแต่ว่างหมด = เกรดจากคะแนน 0
r = run({ a: { score: 5 } });
assert.equal(r.incomplete, true); assert.equal(r.missing, 4);

// สอบปลายภาคเต็ม 50 แต่สัดส่วน 30 → แปลง 40/50×30 = 24
const items50 = [{ id: 'f', kind: 'final', max_score: 50 }];
assert.equal(computeStudent(items50, () => ({ score: 40 }), { midRatio: 70, finalRatio: 30 }).final, 24);

// GPA: ไม่นับ ร/มส, ปัดทิ้งทศนิยม 2 ตำแหน่ง ; อันดับแบบ RANK
assert.equal(gpa([{ grade: 4, weight: 1.5 }, { grade: 2.5, weight: 1 }, { grade: 'ร', weight: 1 }, { grade: 3, weight: 0.5 }]), 3.33);
assert.deepEqual(rank([3.5, 2, 3.5, null, 4]), [2, 4, 2, null, 1]);

console.log('ผ่านทุกข้อ ✓');
