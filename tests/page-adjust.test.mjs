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
// ค่าพิมพ์ทั้งชุด (แผงขวา ปพ.5)
import { globalAdj, mergeAdj, withPageNo, MARGIN_PRESETS } from '../js/page-adjust.js';
assert.deepEqual(globalAdj({}), {}, 'ไม่ตั้งอะไร = ตามแบบพิมพ์');
const gov = globalAdj(MARGIN_PRESETS.gov[1]);
assert.deepEqual([gov.mt, gov.mb, gov.ml, gov.mr], [25, 20, 30, 20], 'ตามราชการ บน 2.5 ล่าง 2 ซ้าย 3 ขวา 2 ซม.');
assert.equal(globalAdj(MARGIN_PRESETS.pp5[1]).ml, 25.4);
assert.equal(globalAdj({ pt: 16 }).font, 100); assert.equal(globalAdj({ pt: 14 }).font, 87.5);
assert.equal(globalAdj({ scale: 90, fit: true }).scale, undefined, 'พอดีหน้าใช้แทน %'); assert.equal(globalAdj({ scale: 90, fit: true }).autoFit, true);
// ลำดับ: ค่าตั้งต้นของแผ่น < ทั้งชุด < รายแผ่น
let m = mergeAdj({ scale: 104 }, { mt: 2 }, null);
assert.equal(m.scale, 104, 'ไม่ตั้งขนาดทั้งชุด = คงค่าย่อของแผ่น'); assert.ok(Math.abs(m.mt - 20 / 25.4) < 1e-9);
m = mergeAdj({ scale: 104 }, { fit: true }, null); assert.equal(m.scale, undefined); assert.equal(m.autoFit, true);
m = mergeAdj({ scale: 104 }, { scale: 80, mt: 2 }, { mt: 10, scale: 95 });
assert.equal(m.scale, 95, 'รายแผ่นชนะ'); assert.ok(Math.abs(m.mt - 10 / 25.4) < 1e-9, 'ขอบรายแผ่นชนะ');
m = mergeAdj(null, { scale: 80 }, { autoFit: true }); assert.equal(m.scale, undefined, 'แผ่นที่ตั้งอัตโนมัติเองไม่ถูก % ทั้งชุดทับ');
assert.equal(mergeAdj(null, {}, null), undefined);
m = mergeAdj({ scale: 104 }, { fit: true, scale: 80 }, { autoFit: false }); assert.equal(m.scale, 104, 'แผ่นนี้ "ตามแบบ" ชนะพอดีขอบทั้งชุด'); assert.equal(m.autoFit, undefined);
m = mergeAdj({ scale: 104 }, { fit: true }, { autoFit: false, mt: 20 }); assert.ok(Math.abs(m.mt - 20 / 25.4) < 1e-9); assert.equal(m.scale, 104);
const pg = withPageNo('<div class="xl-page"><div class="xl-content"></div></div>', 3, 40);
assert.ok(pg.endsWith('>3</div></div>') && pg.includes('bottom:13.0pt'), 'เลขหน้าอยู่ใน .xl-page');
console.log('page-adjust: ผ่านทั้งหมด');
