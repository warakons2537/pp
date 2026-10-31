import assert from 'node:assert/strict';
import { rank, norm } from '../js/search-core.js';
const items = [{ label: 'เช็กชื่อประจำวัน', hay: 'มาเรียน ขาด' }, { label: 'เช็กชื่อรายคาบ' }, { label: 'คะแนนรายวิชา', hay: 'เกรด' },
  { label: 'เด็กหญิงสมใจ ใจดี', hay: '12345 5' }, { label: 'เด็กชายใจกล้า สายบัว', hay: '12346 6' }];
assert.equal(norm('เช็ก​ชื่อ  ประจำ'), 'เช็กชื่อประจำ');
assert.deepEqual(rank(items, 'เช็กชื่อ').map((x) => x.label), ['เช็กชื่อรายคาบ', 'เช็กชื่อประจำวัน']);     // ขึ้นต้นตรงเท่ากัน: ชื่อสั้นก่อน
assert.deepEqual(rank(items, 'เกรด').map((x) => x.label), ['คะแนนรายวิชา']);                          // หาจากคำค้นเสริม
assert.deepEqual(rank(items, '12346').map((x) => x.label), ['เด็กชายใจกล้า สายบัว']);                 // หาจากเลขประจำตัว
assert.deepEqual(rank(items, 'ใจ').map((x) => x.label), ['เด็กหญิงสมใจ ใจดี', 'เด็กชายใจกล้า สายบัว']);
assert.deepEqual(rank(items, 'zzz'), []);
assert.equal(rank(items, '', 3).length, 3);
console.log('search-core ok');
