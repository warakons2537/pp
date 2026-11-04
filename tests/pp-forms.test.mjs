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

// ---------- ปพ.5 ในตัว เฟส 1 ----------
{
  const { pp5Set, PP5_PHASE1, citizenText, birthText } = await import('../js/pp-forms.js');
  assert.deepEqual(pp5Set(1).filter((n) => /^(พ|มิ|ก|ส|ต|ธ|ม|เม|เวลา)/.test(n)), ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'เวลา รวม 1']);
  assert.ok(pp5Set(2).includes('ธ.ค.') && pp5Set(2).includes('เวลา รวม 2') && !pp5Set(2).includes('พ.ค.'));
  assert.equal(citizenText('1648900175699'), '1 6489 00175 69 9');
  assert.equal(birthText('2013-06-14'), 'วันศุกร์ที่ 14 มิถุนายน 2556');
  const st5 = (n, att) => ({ no: n, s: { id: 'x' + n, prefix: 'เด็กชาย', first_name: 'ก' + n, last_name: 'ข', student_code: String(5700 + n), gender: 'ช' }, citizen: '1648900175699', birth: '2013-06-14',
    occ: ['รับจ้าง', 'ค้าขาย', 'ว่างงาน'], fam: { father: 'นายพ่อ ข', mother: 'นางแม่ ข', guardian: 'นางยาย ข', relation: 'ยาย' }, addrShort: '1 หมู่ 2 ต.ก',
    trait8: [3, 3, 3], rtw: [1, 1], values12: [], comp5: [2, 2], acts: [], att });
  const d5 = { ...d, room: 1, students: [st5(1, { '2026-05-18': 1, '2026-05-19': 'ข', '2026-05-20': 'ล', '2026-06-01': 1 }), st5(2, {})],
    counts: { start: { 'ช': 2, 'ญ': 0 }, left: { 'ช': 0, 'ญ': 0 }, joined: { 'ช': 0, 'ญ': 0 }, end: { 'ช': 2, 'ญ': 0 } } };
  d5.students.forEach((x) => { x.acts = [true]; });
  const m5 = classModel(d5);
  const F5 = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
  const val = (sh, ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F5.eng.value(sh, +mm[2], c); };
  for (const n of PP5_PHASE1) { assert.ok(F5.wb.sheetNames.includes(n), `แบบพิมพ์ไม่มีแผ่น ${n}`); assert.ok(F5.fill(n, m5), n); }
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AH10'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'BY13'), 2);
  assert.equal(val('ปก ปพ.5 รายชั้น', 'M18'), 'ภาษาไทย'); assert.equal(val('ปก ปพ.5 รายชั้น', 'BK18'), 1);   // ภาษาไทย เกรด 2 = 1 คน
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AX41'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'AB41'), 0);   // คุณลักษณะ 3 = ดีเยี่ยม
  assert.equal(val('ปก ปพ.5 รายชั้น', 'BN41'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'CB41'), 0);   // อ่านคิดวิเคราะห์ 1 = ผ่าน
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AQ45'), 2);                                                 // สมรรถนะ 2 = ดี
  assert.equal(val('ชื่อนักเรียน', 'C3'), 'เด็กชายก1 ข'); assert.equal(val('ชื่อนักเรียน', 'D3'), '1 6489 00175 69 9');
  assert.equal(val('บิดามารดา', 'C3'), 'นายพ่อ ข'); assert.equal(val('บิดามารดา', 'F3'), 'ค้าขาย');
  assert.equal(val('ผู้ปกครอง', 'D3'), 'ยาย'); assert.equal(val('ผู้ปกครอง', 'F3'), '1 หมู่ 2 ต.ก');
  assert.equal(val('พ.ค.', 'T4'), 1);                        // 18 พ.ค. = คอลัมน์ T
  assert.equal(val('พ.ค.', 'U4'), 'ข'); assert.equal(val('พ.ค.', 'AH4'), 1); assert.equal(val('พ.ค.', 'AI4'), '-'); assert.equal(val('พ.ค.', 'AJ4'), 1); assert.equal(val('พ.ค.', 'AK4'), 1);
  assert.equal(val('พ.ค.', 'M2'), 'พฤษภาคม'); assert.equal(val('พ.ค.', 'Y2'), 2569);
  assert.equal(val('เวลา รวม 1', 'C4'), 1); assert.equal(val('เวลา รวม 1', 'D4'), 1); assert.equal(val('เวลา รวม 1', 'E4'), '-');
  assert.equal(val('เวลา รวม 1', 'I4'), 4); assert.equal(val('เวลา รวม 1', 'J4'), 2); assert.equal(val('เวลา รวม 1', 'K4'), 50);
  assert.equal(val('เวลา รวม 1', 'K5'), null);               // ไม่มีบันทึกเวลาเรียนเลย
  { // แถวที่เขียนไว้ในไฟล์แต่ไม่มี ht (แผ่นที่ตั้ง zeroHeight) ต้องไม่ถูกซ่อน เช่น แถวหัวตารางสรุปผลสัมฤทธิ์ของปก
    const { Renderer } = await import('../js/xl-render.js');
    const pg = new Renderer(F5.wb, F5.eng, { dpi: 120 }).paginate('ปก ปพ.5 รายชั้น');
    assert.ok(pg.g.rh(17) > 0 && pg.g.rh(18) > 0, 'แถวหัวตาราง (17) ต้องมีความสูง');
    assert.equal(pg.g.rh(100), 0, 'แถวที่ไม่ได้เขียนไว้ยังซ่อนตามเดิม');
    // แบบพิมพ์ ปพ.5: ไม่มีสีพื้น (สีชมพูในไฟล์ = ช่องกรอก ไม่ใช่สีที่พิมพ์)
    F5.fill('พ.ค.', m5); const sh = F5.wb.sheet('พ.ค.'); const xfs = F5.wb.styles.cellXfs;
    assert.ok([...sh.cells.values()].every((c) => !c.s || !xfs[c.s]?.fillId), 'พ.ค. ต้องไม่มีสีพื้น');
  }
  F5.fill('พ.ค.', m5);                                       // กรอกซ้ำต้องล้างค่าเดิม
  assert.equal(val('พ.ค.', 'T4'), 1);
}
