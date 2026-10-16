// ทดสอบแบบบันทึกผลสัมฤทธิ์ (ส่งออก/นำเข้า Excel):  node tests/achievement.test.mjs
// ตัวไฟล์ที่สร้างตรวจกับ LibreOffice แล้ว: คำนวณสูตรใหม่ได้ผลรวมและเกรดตรงกับไฟล์จริงของโรงเรียน 5 ไฟล์ (ม.1–ม.3) และข้อมูลสุ่ม 114 คน
import assert from 'node:assert/strict';
import { achievementSheet } from '../js/achievement.js';
import { parseAchievement, matchStudents, nameKey } from '../js/achievement-import.js';
import { buildXlsx, colName } from '../js/xlsx-write.js';

assert.equal(colName(1), 'A'); assert.equal(colName(51), 'AY'); assert.equal(colName(54), 'BB'); assert.equal(colName(703), 'AAA');

const items = [{ title: 'งาน 1', max: 10 }, { title: 'งาน 2', max: 10 }, { title: 'สอบกลางภาค', max: 20 }];
const students = [
  { no: 1, name: 'เด็กชายสมมติ  หนึ่ง', scores: [10, 8, 15], final: 20, special: null },   // 33/(40/70)=57.75→57 +20 = 77 → 3.5
  { no: 2, name: 'เด็กหญิงสมมติ  สอง', scores: [5, null, 10], final: 9, special: null },    // 15/(40/70)=26.25→26 +9 = 35 → 0
  { no: 3, name: 'เด็กชายสมมติ  สาม', scores: [9, 9, 9], final: 10, special: 'มส' },
  { no: 4, name: 'เด็กหญิงสมมติ  สี่', scores: [null, null, null], final: null, special: null },
];
const sh = achievementSheet({ line1: 'ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569', line2: 'วิชา ทดสอบ', midRatio: 70, finalRatio: 30, items, students });
const cell = (c, r) => sh.cells.get(`${r}:${c}`);
// ตำแหน่งเดียวกับไฟล์เดิม: AY=51 รวมระหว่างภาค, AZ=52 ปลายภาค, BA=53 รวม, BB=54 เกรด, นักเรียนเริ่มแถว 7
assert.equal(cell(51, 7).v, 57); assert.equal(cell(53, 7).v, 77); assert.equal(cell(54, 7).v, 3.5);
assert.match(cell(51, 7).f, /^IF\(A7="","",IFERROR\(ROUNDDOWN\(SUM\(C7:AX7\)\/\(SUM\(\$C\$6:\$AX\$6\)\/\$AY\$6\),0\),""\)\)$/);
assert.equal(cell(53, 8).v, 35); assert.equal(cell(54, 8).v, 0);
assert.equal(cell(54, 9).v, 'มส'); assert.equal(cell(54, 9).f, undefined);
assert.equal(cell(54, 10).v, '');                         // ยังไม่มีคะแนน = เว้นว่าง
assert.equal(cell(53, 6).v, 100);
assert.equal(sh.cols[6].hidden, true);                    // ช่องที่ไม่ได้ใช้ถูกซ่อน (F)
assert.equal(sh.cols[5].hidden, false);
assert.deepEqual(sh.colBreaks, []);                       // 3 ช่อง + สรุป พิมพ์หน้าเดียว
const bytes = buildXlsx([sh]);
assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); // zip

// นำเข้า: สร้างตารางแบบที่ SheetJS อ่านได้จากไฟล์เดิม แล้วแปลงกลับ
const m = [];
for (const x of sh.cells.values()) { (m[x.r - 1] ??= [])[x.c - 1] = x.v === '' ? null : x.v; }
for (let i = 0; i < m.length; i++) m[i] ??= [];
const p = parseAchievement(m);
assert.equal(p.midRatio, 70); assert.equal(p.finalRatio, 30);
assert.deepEqual(p.items.map((i) => [i.title, i.max]), [['งาน 1', 10], ['งาน 2', 10], ['สอบกลางภาค', 20]]);
assert.equal(p.students.length, 4);
assert.deepEqual(p.students[1].scores, [5, null, 10]);
assert.equal(p.students[2].special, 'มส');
assert.equal(p.students[0].grade, 3.5);

// จับคู่ชื่อ: ไม่สนคำนำหน้าและช่องว่าง
assert.equal(nameKey('เด็กชายสมมติ  หนึ่ง'), nameKey('ด.ช. สมมติ หนึ่ง'));
const roster = [{ id: 'a', number: 1, prefix: 'ด.ช.', first_name: 'สมมติ', last_name: 'หนึ่ง' }, { id: 'b', number: 2, prefix: 'เด็กหญิง', first_name: 'สมมุติ', last_name: 'สอง' }];
const mm = matchStudents(p, roster, (s) => `${s.prefix}${s.first_name} ${s.last_name}`);
assert.equal(mm[0].s.id, 'a'); assert.equal(mm[0].how, 'name');
assert.equal(mm[1].s.id, 'b'); assert.equal(mm[1].how, 'number');   // สะกดต่าง จับด้วยเลขที่ (แสดงให้ครูตรวจ)
assert.equal(mm[2].s, null);

console.log('achievement: ผ่านทั้งหมด');
