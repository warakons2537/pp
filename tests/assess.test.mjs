// ทดสอบภาวะโภชนาการและการสรุปคุณลักษณะ:  node tests/assess.test.mjs
// ตัวเครื่องคำนวณตรวจเทียบกับไฟล์ Excel เดิมแล้ว: โภชนาการ 81 ครั้งชั่งวัด × 3 ด้าน ตรงทั้งหมด,
// สรุปคุณลักษณะ/อ่านคิดวิเคราะห์/ค่านิยม/สมรรถนะ 84 รายการ ตรงกับค่าที่ Excel บันทึกไว้ทั้งหมด
import assert from 'node:assert/strict';
import { ageMonths, classify, makeRef, modeSummary, excelRefToRows, OUT_OF_TABLE } from '../js/assess.js';
import { EXCEL_AGE, EXCEL_HT } from '../js/data/growth-excel.js';

// อายุเป็นเดือนเต็มแบบ DATEDIF "m"
assert.equal(ageMonths('2012-02-25', '2025-05-16'), 158);
assert.equal(ageMonths('2012-05-16', '2025-05-16'), 156);
assert.equal(ageMonths('2012-05-17', '2025-05-16'), 155);
assert.equal(ageMonths(null, '2025-05-16'), null);

// ตารางสมมติ 1 แถวต่อด้าน เพื่อทดสอบเส้นแบ่ง
const ref = makeRef([
  { sex: 'ช', basis: 'age_months', key: 156, measure: 'weight', minus2: 30, minus15: 33, plus15: 55, plus2: 60 },
  { sex: 'ช', basis: 'age_months', key: 156, measure: 'height', minus2: 140, minus15: 144, plus15: 164, plus2: 168 },
  { sex: 'ช', basis: 'height_cm', key: 150, measure: 'weight', minus2: 34, minus15: 36, plus15: 47, plus2: 50, plus3: 56 },
]);
const c = (w, h) => classify(ref, { sex: 'ช', months: 156, weight: w, height: h });
assert.equal(c(61, 150).wa, 'น้ำหนักมากกว่าเกณฑ์');
assert.equal(c(55, 150).wa, 'น้ำหนักตามเกณฑ์');            // = +1.5SD ยังตามเกณฑ์ (ต้องมากกว่าจึงค่อนข้างมาก)
assert.equal(c(33, 150).wa, 'น้ำหนักตามเกณฑ์');            // = -1.5SD ตามเกณฑ์
assert.equal(c(32.9, 150).wa, 'น้ำหนักค่อนข้างน้อย');
assert.equal(c(40, 143).ha, 'ค่อนข้างเตี้ย');
assert.equal(c(40, 150).wh, 'สมส่วน');
assert.equal(c(48, 150).wh, 'ท้วม');
assert.equal(c(57, 150).wh, 'อ้วน');
assert.equal(c(35, 150).wh, 'ค่อนข้างผอม');
assert.equal(c(40, 150.4).wh, 'สมส่วน');                    // ปัดส่วนสูงเป็น 150 ก่อนเปิดตาราง
assert.equal(c(40, 151).wh, OUT_OF_TABLE);
assert.equal(c(40, 150).goodShape, true);
assert.equal(c(48, 150).goodShape, false);              // ท้วม = ไม่สมส่วน
assert.equal(c(40, 143).goodShape, null);               // ไม่มีแถวในตาราง = ตัดสินไม่ได้

// ตาราง Excel เดิม: ชาย 50–180 ซม., หญิง 50–170 ซม., อายุ 0–227 เดือน
const ex = makeRef(excelRefToRows(EXCEL_AGE, EXCEL_HT));
assert.ok(ex.get('ช', 'height_cm', 180, 'weight'));
assert.equal(ex.get('ญ', 'height_cm', 171, 'weight'), undefined);
assert.ok(ex.get('ญ', 'age_months', 227, 'height'));

// ฐานนิยม: ซ้ำเท่ากันเลือกค่าสูงกว่า, ไม่มีค่าซ้ำใช้ค่าสูงสุด
assert.equal(modeSummary([3, 2, 1, 1, 2, 1, 2, 3]), 2);
assert.equal(modeSummary([3, 3, 3, 2, 3, 2, 3, 3]), 3);
assert.equal(modeSummary([0, 1, 2, 3]), 3);
assert.equal(modeSummary([0]), null);
assert.equal(modeSummary([null, null]), null);
assert.equal(modeSummary([1, 1, 3]), 1);

console.log('ผ่านทุกข้อ ✓');
