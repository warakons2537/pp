// ทดสอบแบบพิมพ์ในตัว (js/pp-forms.js): node tests/pp-forms.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summaryLevel, classModel, Forms } from '../js/pp-forms.js';

// ระดับสรุป (แบบไฟล์เดิม: MODE ของค่าที่เรียงจากมากไปน้อย, ไม่มีค่าซ้ำ = ค่าสูงสุด)
assert.equal(summaryLevel([2, 3, 3, 3, 2, 2, 2, 2]), 2);
assert.equal(summaryLevel([3, 3, 2, 2, 1, 0, 1, 0]), 3);      // เสมอ → ค่าสูงกว่า
assert.equal(summaryLevel([0, 1, 2, 3, null]), 3);            // ไม่มีค่าซ้ำ → สูงสุด
assert.equal(summaryLevel([0, 0, 0]), 0);
assert.equal(summaryLevel([0]), null);                        // ค่าเดียว = 0 → ว่าง (เหมือนไฟล์เดิม)
assert.equal(summaryLevel([null, null]), null);

// ข้อมูลห้องตัวอย่าง 3 คน 2 วิชา
const stu = (id, n, first) => ({ no: n, s: { id, prefix: 'เด็กชาย', first_name: first, last_name: 'ทดสอบ', student_code: String(6800 + n) },
  trait8: [3, 3, 3, 2, 2, 1, 1, 1], rtw: [2, 2, 1, 1, 0], values12: [], comp5: [1, 1, 2, 2, 3], acts: [true, true, false, true], club: 'ชุมนุมดนตรี' });
const d = {
  level: 'มัธยมศึกษาปีที่ 1', term: 1, year: 2569, approveDate: '2026-10-10', homeroom: ['ครู ก'],
  school: { school_name: 'บ้านทดสอบ', area_office: 'สพป.ทดสอบ เขต 1', director_name: 'ผอ. ทดสอบ', academic_head_name: 'วิชาการ ทดสอบ' },
  students: [stu('a', 1, 'หนึ่ง'), stu('b', 2, 'สอง'), stu('c', 3, 'สาม')],
  subjects: [
    { code: 'ท21101', name: 'ภาษาไทย', credits: 1.5, rows: [{ calc: { total: 80, grade: 4 } }, { calc: { total: 64, grade: 2 } }, { calc: { total: 49, grade: 0 } }] },
    { code: 'ค21101', name: 'คณิตศาสตร์', credits: 1, rows: [{ calc: { total: 70, grade: 3 } }, { calc: { total: 86, grade: 4 } }, { special: 'ร', calc: { total: 30, grade: 0 } }] },
  ],
};
const m = classModel(d);
assert.equal(m.subjects[0].avg, 64.33);
assert.deepEqual(m.students.map((s) => s.sumTotal), [150, 150, 79]);
assert.deepEqual(m.students.map((s) => s.rankTotal), [1, 1, 3]);           // เท่ากันได้อันดับเดียวกัน
assert.equal(m.students[0].gpa, 3.6);                                      // (4×1.5 + 3×1) ÷ 2.5
assert.equal(m.students[2].gpa, 0);                                        // ร ไม่นับ
assert.equal(m.students[0].code, 6801);
assert.equal(m.students[0].trait, 3);                                      // 3 กับ 1 มีอย่างละ 3 ครั้ง → ค่าสูงกว่า

// ใส่ลงแบบพิมพ์จริง
const F = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
assert.ok(F.wb.sheetNames.includes('ปพ.6'));
F.fill('ปพ.6', m, 1);
const v = (ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F.eng.value('ปพ.6', +mm[2], c); };
assert.equal(v('A2'), 'โรงเรียนบ้านทดสอบ สพป.ทดสอบ เขต 1');
assert.equal(v('A3'), 'ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569');
assert.equal(v('C5'), 'เด็กชายสอง ทดสอบ');
assert.equal(v('G10'), 86); assert.equal(v('H10'), 4);
assert.equal(v('D29'), 2.5); assert.equal(v('G29'), 150);
assert.equal(v('D36'), 'ผ่าน'); assert.equal(v('D37'), 'ไม่ผ่าน'); assert.equal(v('C37'), 'ชุมนุมดนตรี');
assert.equal(v('D39'), 'ดีเยี่ยม'); assert.equal(v('D40'), 'ดี'); assert.equal(v('D41'), 'ดี');
assert.equal(v('F34'), '10 ตุลาคม 2569');
// คนถัดไป: ค่าเดิมต้องถูกล้าง
F.fill('ปพ.6', m, 2);
assert.equal(v('H10'), 'ร'); assert.equal(v('C5'), 'เด็กชายสาม ทดสอบ');
// แบบพิมพ์ต้องไม่มีสูตรเหลืออยู่
for (const n of F.wb.sheetNames) for (const c of F.wb.sheet(n).cells.values()) assert.ok(!c.f, `${n} ยังมีสูตร`);
console.log('pp-forms: ผ่านทั้งหมด');
