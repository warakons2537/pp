// ทดสอบแบบประเมินละเอียด:  node tests/assess-forms.test.mjs
// สูตรส่งออกตรวจกับ LibreOffice แล้ว: สมรรถนะของไฟล์จริง ม.1 (14 คน × 5 ด้าน) ได้ผลตรงกับไฟล์เดิมทุกช่อง
// และคุณลักษณะข้อมูลสุ่ม 20 คน × 18 ตัวชี้วัด ตรงกับเครื่องคำนวณในแอปทุกช่อง
import assert from 'node:assert/strict';
import { TRAITS, SUBS, subResult, traitResult, traitOverall, levelOfAvg, COMPETENCIES, compResult, compOverall } from '../js/assess-forms.js';
import { traitWorkbook, competencyWorkbook } from '../js/assess-export.js';

assert.equal(SUBS.length, 18);
assert.deepEqual(TRAITS.map((t) => t.subs.reduce((n, s) => n + s.items.length, 0)), [11, 6, 2, 6, 6, 6, 8, 6]);   // ตัวหารในไฟล์เดิม
const map = (o) => (c) => o[c] ?? null;

// ตัวชี้วัด 1.1 (เกณฑ์ >6, >=4, >=3): รวม 2 ในไฟล์เดิมได้ FALSE → ระบบให้ "ไม่ผ่าน"
const s11 = SUBS.find((s) => s.code === '1.1');
assert.equal(subResult(s11, map({ '1.1.1': 3, '1.1.2': 2, '1.1.3': 3 })).label, 'ดีเยี่ยม');
assert.equal(subResult(s11, map({ '1.1.1': 2, '1.1.2': 1, '1.1.3': 1 })).label, 'ดี');
assert.equal(subResult(s11, map({ '1.1.1': 1, '1.1.2': 1, '1.1.3': 1 })).label, 'ผ่าน');
assert.equal(subResult(s11, map({ '1.1.1': 1, '1.1.2': 0, '1.1.3': 1 })).label, 'ไม่ผ่าน');
const s51 = SUBS.find((s) => s.code === '5.1');
assert.equal(subResult(s51, map({ '5.1.1': 3, '5.1.2': 3, '5.1.3': 2, '5.1.4': 2 })).label, 'ดีเยี่ยม');   // 10 > 9

// ค่าเฉลี่ยรายข้อ = รวมทุกพฤติกรรม ÷ จำนวน (ช่องว่าง = 0)
const all3 = Object.fromEntries(SUBS.flatMap((s) => s.codes.map((c) => [c, 3])));
assert.equal(traitResult(TRAITS[0], map(all3)).avg, 3);
assert.equal(traitOverall(map(all3)).level, 3);
assert.equal(traitResult(TRAITS[0], map({ '1.1.1': 3 })).avg, 3 / 11);
assert.deepEqual([2.6, 2.5, 1.5, 1.49, 1, 0.99].map(levelOfAvg), [3, 2, 2, 1, 1, 0]);

// สมรรถนะ: ฐานนิยม ถ้าเท่ากันใช้ค่าต่ำ (MIN(MODE.MULT))
const c1 = COMPETENCIES[0];
const cm = (arr) => map(Object.fromEntries(arr.map((v, i) => [`1.${i + 1}`, v]).filter(([, v]) => v !== null)));
assert.equal(compResult(c1, cm([2, 1, 2, 1, 2])).level, 2);
assert.equal(compResult(c1, cm([3, 3, 2, 2, 1])).level, 2);
assert.equal(compResult(c1, cm([1, 2, 3, null, null])).level, 1);
assert.equal(compResult(c1, cm([null, null, null, null, null])).level, 0);
assert.deepEqual([[3, 3, 3, 2, 2], [2, 2, 2, 1, 2], [1, 2, 1, 2, 2], [null, null, null, null, null]].map((a) => compResult(c1, cm(a)).label), ['ดีเยี่ยม', 'ดี', 'ผ่าน', 'ไม่ผ่าน']);
// ภาพรวม: ผลรวม 5 ด้าน ÷ 15
const lv = (v) => map(Object.fromEntries(COMPETENCIES.flatMap((c) => c.items.map((_, i) => [`${c.no}.${i + 1}`, v]))));
assert.equal(compOverall(lv(3)).label, 'ดีเยี่ยม');
assert.equal(compOverall(lv(2)).label, 'ดี');          // 10/15 = 66.7%
assert.equal(compOverall(lv(1)).label, 'พอใช้');       // 5/15 = 33.3%
assert.equal(compOverall(() => null).label, 'ปรับปรุง');

// ไฟล์ส่งออกมีแผ่นงานครบตามไฟล์เดิม
const info = { line2: 'ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569', schoolName: 'โรงเรียนตัวอย่าง', area: 'สพป.ตัวอย่าง' };
const kids = [{ no: 1, name: 'ทดสอบ หนึ่ง', get: map(all3) }];
assert.deepEqual(traitWorkbook(info, kids).map((s) => s.name), [...SUBS.map((s) => `ข้อที่ ${s.code}`), 'แบบสรุปผลการประเมิน', 'สรุปผล']);
assert.deepEqual(competencyWorkbook(info, kids).map((s) => s.name), [...COMPETENCIES.map((c) => c.sheet), 'สรุปผล', 'แบบสรุปผล']);

console.log('assess-forms: ผ่านทั้งหมด');
