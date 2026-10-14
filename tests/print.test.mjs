// ทดสอบการนับนักเรียน ต้นภาค/ออก/เข้า/สิ้นภาค:  node tests/print.test.mjs
import assert from 'node:assert/strict';
import { enrollmentCounts } from '../js/yeardata.js';

const term = { academic_year: 2569, term: 1, start_date: '2026-05-16', end_date: '2026-10-09' };
const rows = [
  { gender: 'ช' }, { gender: 'ช' }, { gender: 'ญ' },                       // อยู่ตลอดภาค
  { gender: 'ญ', left_on: '2026-07-01' },                                 // ออกระหว่างภาค
  { gender: 'ช', entered_on: '2026-06-15' },                              // เข้าระหว่างภาค
  { gender: 'ช', entered_on: '2026-05-16' },                              // เข้าวันเปิดภาค = ต้นภาค
  { gender: 'ญ', left_on: '2026-05-01' },                                 // ออกก่อนเปิดภาค ไม่นับ
  { gender: 'ญ', entered_on: '2026-11-01' },                              // เข้าภาคหน้า ไม่นับ
];
const c = enrollmentCounts(rows, term);
assert.deepEqual(c.start, { ช: 3, ญ: 2 });
assert.deepEqual(c.left, { ช: 0, ญ: 1 });
assert.deepEqual(c.joined, { ช: 1, ญ: 0 });
assert.deepEqual(c.end, { ช: 4, ญ: 1 });
console.log('ผ่านทุกข้อ ✓');
