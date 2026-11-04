// ทดสอบชุดมาตรฐานและการตรวจก่อนพิมพ์ของเล่ม ปพ.: node tests/pp-book.test.mjs
import assert from 'node:assert/strict';
import { defaultBook, bookChecks, MONTHS } from '../js/pp-book.js';

const names = ['ข้อมูลพื้นฐาน', 'ปก ปพ.5 รายชั้น', 'ปก ปพ.5 รายวิชา', 'ชื่อนักเรียน', ...MONTHS.map((m) => m[0]), 'เวลา รวม 1', 'เวลา รวม 2', 'น้ำหนัก-ส่วนสูง',
  'โภชนาการ 1', 'โภชนาการ 2', 'วิชาที่ 1', 'วิชาที่ 2', 'วิชาที่ 3', 'คุณลักษณะอันพึงประสงค์', 'สมรรถนะ', 'กิจกรรมพัฒนาผู้เรียน', 'เกรดร้อยละ', 'ปพ.6'];
const sheets = names.map((name, i) => ({ name, index: i, state: 'visible' }));

const t1 = defaultBook(sheets, 2, { term: 1 });
assert.deepEqual(t1.filter((n) => MONTHS.some((m) => m[0] === n)), ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.'], 'ภาค 1 = พ.ค.–ต.ค.');
assert.ok(t1.includes('เวลา รวม 1') && !t1.includes('เวลา รวม 2'));
assert.ok(!t1.includes('ปก ปพ.5 รายวิชา') && !t1.includes('วิชาที่ 3') && !t1.includes('ปพ.6') && !t1.includes('ข้อมูลพื้นฐาน'));
assert.equal(t1[0], 'ปก ปพ.5 รายชั้น'); assert.equal(t1.at(-1), 'เกรดร้อยละ');
assert.ok(defaultBook(sheets, 2, { term: 2 }).includes('ธ.ค.') && !defaultBook(sheets, 2, { term: 2 }).includes('พ.ค.'));

// ข้อมูลตัวอย่าง: มีเวลาเรียนแค่ พ.ค. · ชั่งน้ำหนักครั้งที่ 1 · วิชา 1 มีคะแนนครบ วิชา 2 ไม่มี
const st = (att) => ({ att, trait8: [null], rtw: [null], values12: [3], comp5: [null], acts: [null] });
const d = {
  year: 2569, school: { school_name: 'ร.ร.' }, warnings: [], rounds: ['2026-05-18', null, null, null],
  students: [st({ '2026-05-18': 1 }), st({})],
  subjects: [{ name: 'ไทย', rows: [{ scores: [5], ind: [], final: null }, { scores: [4], ind: [], final: null }] }, { name: 'คณิต', rows: [{ scores: [null], ind: [], final: null }, { scores: [null], ind: [], final: null }] }],
};
const sel = ['ปก ปพ.5 รายชั้น', 'พ.ค.', 'มิ.ย.', 'โภชนาการ 1', 'โภชนาการ 2', 'วิชาที่ 1', 'วิชาที่ 2', 'วิชาที่ 3', 'คุณลักษณะอันพึงประสงค์', 'สมรรถนะ'];
const r = bookChecks(d, sel, t1, 1).map((x) => x.text).join('\n');
assert.match(r, /ยังไม่ได้เลือกพิมพ์/, 'หน้าที่หายจากชุดมาตรฐาน');
assert.match(r, /เวลาเรียนเดือน มิ\.ย\./); assert.doesNotMatch(r, /เวลาเรียนเดือน พ\.ค\./);
assert.match(r, /ครั้งที่ 2/); assert.doesNotMatch(r, /ครั้งที่ 1,/);
assert.match(r, /วิชา คณิต ยังไม่ได้ลงคะแนน\/ตัวชี้วัดเลย/); assert.doesNotMatch(r, /วิชา ไทย/);
assert.match(r, /วิชาที่ 3/, 'วิชาที่ไม่มีในห้อง');
assert.match(r, /ยังไม่ได้ลงคุณลักษณะ.*เลย/); assert.doesNotMatch(r, /ค่านิยม\/สมรรถนะ/, 'สมรรถนะมีข้อมูลแล้ว');
assert.equal(bookChecks({ ...d, students: [] }, sel, t1, 1)[0].level, 'err');
assert.equal(bookChecks(d, ['ปก ปพ.5 รายชั้น'], ['ปก ปพ.5 รายชั้น'], 1).length, 0, 'ครบและไม่มีอะไรผิดปกติ');
console.log('pp-book: ผ่านทั้งหมด');
