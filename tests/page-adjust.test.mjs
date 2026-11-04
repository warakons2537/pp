// ทดสอบตัวช่วยปรับหน้ากระดาษรายแผ่น (js/page-adjust.js): node tests/page-adjust.test.mjs
import assert from 'node:assert/strict';
import { adjOpt, adjText } from '../js/page-adjust.js';

assert.equal(adjOpt(null), null); assert.equal(adjText(null), ''); assert.equal(adjText(undefined), '');
const a = { mt: 25.4, ml: 12.7, font: 110, scale: 90, hCenter: false };
const o = adjOpt(a);
assert.equal(o.mt, 1); assert.equal(o.ml, 0.5); assert.ok(!('mb' in o) && !('mr' in o), 'ด้านที่ไม่ได้ตั้งต้องไม่ถูกใส่ (ใช้ค่าเดิมของแบบพิมพ์)');
assert.equal(o.font, 110); assert.equal(o.scale, 90); assert.equal(o.hCenter, false);
assert.equal(a.mt, 25.4, 'ไม่แก้ค่าเดิม');
assert.equal(adjText({ font: 110, row: 90 }), 'ตัวอักษร 110% · ระยะบรรทัด 90%');
assert.equal(adjText({ mt: 20, scale: 95, hCenter: true }), 'ขอบ บน20 ล่าง- ซ้าย- ขวา- มม. · ย่อ/ขยาย 95% · กึ่งกลาง');
console.log('page-adjust: ผ่านทั้งหมด');
