// ทดสอบการอ่านไฟล์ประเมิน (คุณลักษณะ / สมรรถนะ / อ่านคิดวิเคราะห์เขียน):  node tests/assess-import.test.mjs
// ตารางตัวอย่างจำลองรูปแบบไฟล์จริงของโรงเรียน (ม.2 ภาค 1/2569)
import assert from 'node:assert/strict';
import { detectKind, parseAssessFile } from '../js/assess-import.js';

const N = null;
const head = (line2) => [['แบบประเมิน'], [line2], ['โรงเรียน'], []];

// ---- คุณลักษณะ: แผ่น 1.1 (3 พฤติกรรม) และ 6.1 ที่มีแถวว่างแทรก ----
const t11 = [...head('ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569'),
  ['เลขที่', 'ชื่อ-สกุล', N, N, 'ตัวชี้วัด/พฤติกรรม', N, N, 'รวม'],
  [N, N, N, N, '1.1 เป็นพลเมืองดี'],
  [N, N, N, N, '1.1.1 ยืนตรง', '1.1.2  ปฏิบัติตน', '1.1.3  สามัคคี'],
  ['1', 'เด็กชายก ข', N, N, '3', '2', '3', 8],
  [2, 'เด็กหญิงค ง', N, N, 1, '', 0],
  ['', '', N, N, 3, 3, 3]];            // ไม่มีเลขที่/ชื่อ → ข้าม
const t61 = [...head('x'),
  ['เลขที่', 'ชื่อ-สกุล'], [N, N, N, N, '6.1 ตั้งใจ'],
  [N, N, N, N, '6.1.1  เอาใจใส่', '6.1.2  ตั้งใจ', '6.1.3  ปรับปรุง'], [],
  ['1', 'เด็กชายก ข', N, N, '3', '3', '3'], ['2', 'เด็กหญิงค ง', N, N, '5', '2', '2']];
const sheets = { 'ข้อที่ 1.1': t11, 'ข้อที่ 6.1': t61, 'ข้อที่ 1.2': [], 'ข้อที่ 2.1': [], 'ข้อที่ 3.1': [], 'สรุปผล': [] };
assert.equal(detectKind(Object.keys(sheets)), 'trait8');
const tr = parseAssessFile(sheets, 'trait.xlsx');
assert.equal(tr.kind, 'trait8'); assert.equal(tr.level, 'ม.2'); assert.equal(tr.term, 1); assert.equal(tr.year, 2569);
assert.equal(tr.students.length, 2);
const a = tr.students[0];
assert.deepEqual([...a.values], [['1.1.1', 3], ['1.1.2', 2], ['1.1.3', 3], ['6.1.1', 3], ['6.1.2', 3], ['6.1.3', 3]]);
const b = tr.students[1];
assert.equal(b.values.get('1.1.1'), 1); assert.equal(b.values.has('1.1.2'), false); assert.equal(b.values.get('1.1.3'), 0);
assert.equal(b.values.has('6.1.1'), false);                       // 5 อยู่นอกช่วง 0–3 → ข้ามพร้อมเตือน
assert.ok(tr.warnings.some((w) => w.includes('"5"') && w.includes('0–3')));

// ---- สมรรถนะ: หัวรายการ "1.มี…" ไม่มีช่องว่างหลังจุดก็อ่านได้ · ไม่มีภาคเรียนในหัวไฟล์ ----
const comp = (n) => [['แบบประเมินสมรรถนะ'], ['ชั้นมัธยมศึกษาปีที่ 2 ปีการศึกษา 2569 โรงเรียน'], [], [],
  ['เลขที่', 'ชื่อ - สกุล', N, N, 'รายการประเมิน'],
  [N, N, N, N, '1. สื่อสาร', '2.คิด', '3. แก้', '4. ทักษะ', '5. เขียน'],
  [N, N, N, N, N, N, N, N, N, 'คะแนน'],
  [1.0, 'เด็กชายก ข', N, N, 3.0, 2.0, 1.0, 2.0, 2.0, 10]];
const cs = parseAssessFile({ 'ข้อที่1 สื่อสาร': comp(1), 'ข้อที่2 การคิด': comp(2), 'ข้อที่3 แก้ปัญหา': comp(3), 'สรุปผล': [] }, 'c.xlsx');
assert.equal(cs.kind, 'competency5'); assert.equal(cs.term, null); assert.equal(cs.year, 2569); assert.equal(cs.level, 'ม.2');
assert.equal(cs.students.length, 1);
assert.deepEqual([...cs.students[0].values].filter(([k]) => k.startsWith('2.')), [['2.1', 3], ['2.2', 2], ['2.3', 1], ['2.4', 2], ['2.5', 2]]);
assert.equal(cs.students[0].values.size, 15);

// ---- อ่านคิดวิเคราะห์เขียน: แผ่น "สรุป" ค่าเป็นข้อความ "0".."3" ----
const rtwSummary = [['สรุปผลการประเมิน'], ['โรงเรียน'],
  ['เลขที่', 'ชื่อ - สกุล', 'ผลการประเมิน'], [N, N, 1.0, 2.0, 3.0, 4.0, 5.0], [N, N, N, N, N, N, N, 'รวม', 'แปลผล'],
  [1.0, 'เด็กชายก ข', '3', '3', '2', '1', '0', 9, 'ดี'], [2.0, 'เด็กหญิงค ง', '2', '', '2', '2', '2']];
const rtwSheet = [['แบบบันทึกการประเมินการอ่าน'], ['วิชา ภาษาไทย รหัสวิชา ท22101'], ['ระดับชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569']];
const rt = parseAssessFile({ 'ไทย': rtwSheet, 'รวม': [], 'สรุป': rtwSummary }, 'r.xlsx');
assert.equal(rt.kind, 'rtw'); assert.equal(rt.level, 'ม.2'); assert.equal(rt.term, 1);
assert.deepEqual([...rt.students[0].values], [['1', 3], ['2', 3], ['3', 2], ['4', 1], ['5', 0]]);
assert.equal(rt.students[1].values.has('2'), false);

// ---- ไฟล์ที่ไม่รู้จัก ----
const bad = parseAssessFile({ 'Sheet1': [['x']] }, 'x.xlsx');
assert.equal(bad.kind, null); assert.ok(bad.warnings[0].includes('ไม่ใช่ไฟล์'));

console.log('assess-import: ผ่านทั้งหมด');
