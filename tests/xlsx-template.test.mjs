// ทดสอบตัวเติมแม่แบบ Excel (js/xlsx-template.js): node tests/xlsx-template.test.mjs
import assert from 'node:assert/strict';
import { Sheet, buildXlsx } from '../js/xlsx-write.js';
import { Template, shiftFormula, excelSerialBE, colNum, colName } from '../js/xlsx-template.js';

// สร้างสมุดงานทดสอบ 3 แผ่น มีพื้นที่พิมพ์ซ้ำที่แผ่นสุดท้าย
const a = new Sheet('ปก'); a.set(1, 1, 'ชื่อ').set(2, 1, null).set(3, 2, 5).set(4, 2, null, null, 'C2*2');
const b = new Sheet('รายชื่อ'); b.set(1, 1, 'x'); b.printTitles = { rows: [1, 2] };
const c = new Sheet('เกรด'); c.set(1, 1, 1); c.page = { orientation: 'portrait' };
const bytes = buildXlsx([a, b, c]);

const t = await Template.open(bytes);
assert.deepEqual(t.sheets.map((s) => s.name), ['ปก', 'รายชื่อ', 'เกรด']);

const r = t.write('ปก', { B1: { v: 'เด็กชาย ก & <ข>' }, C2: { v: 7 }, A1: { clear: true } });
assert.equal(r.written, 3);
assert.equal(t.write('ไม่มีแผ่นนี้', { A1: { v: 1 } }).missing, true);
assert.equal(t.readText('ปก', 'B1'), 'เด็กชาย ก & <ข>');

t.setOrientation('เกรด', 'landscape');
assert.equal(t.orientation('เกรด'), 'landscape');
t.arrange(['เกรด', 'รายชื่อ']); // ปก ถูกซ่อนและไปอยู่ท้าย

const t2 = await Template.open(await t.save());
assert.deepEqual(t2.sheets.map((s) => [s.name, s.state]), [['เกรด', 'visible'], ['รายชื่อ', 'visible'], ['ปก', 'hidden']]);
assert.equal(t2.readText('ปก', 'B1'), 'เด็กชาย ก & <ข>');
assert.match(t2.sheetXml('ปก'), /<c r="C2"[^>]*><v>7<\/v>/);
assert.equal(t2.orientation('เกรด'), 'landscape');
// หัวตารางซ้ำของ "รายชื่อ" ต้องย้ายไปลำดับใหม่ (1)
assert.match(t2.wb, /localSheetId="1">'รายชื่อ'!\$1:\$2/);
assert.match(t2.wb, /fullCalcOnLoad="1"/);

// ฟังก์ชันช่วย
assert.equal(shiftFormula('SUM(A1:B$2)+$C3', 2, 1), 'SUM(B3:C$2)+$C5');
assert.equal(colName(colNum('CO')), 'CO');
assert.ok(excelSerialBE('2025-06-01') > 200000); // ปีเก็บเป็น พ.ศ.

console.log('xlsx-template: ผ่านทั้งหมด');
