// ทดสอบชุดมาตรฐานและการตรวจก่อนพิมพ์ของเล่ม ปพ.: node tests/pp-book.test.mjs
import assert from 'node:assert/strict';
import { defaultBook, bookChecks, fillBook, coursesOf, MONTHS } from '../js/pp-book.js';
import { scoreColIndex } from '../js/score-columns.js';

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
  year: 2569, school: { school_name: 'ร.ร.', director_name: 'ผอ.', academic_head_name: 'วิชาการ', area_office: 'เขต 1' }, homeroom: ['ครู'], approveDate: '2026-10-30', warnings: [], rounds: ['2026-05-18', null, null, null],
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
// ข้อมูลที่ต้องกรอกเพิ่ม: บอกว่าไปแก้ที่ไหน
{
  const w = (dd, sheets) => bookChecks(dd, sheets, sheets, 1).map((x) => x.text).join('\n');
  const stx = (o) => ({ att: {}, trait8: [], rtw: [], values12: [], comp5: [], acts: [], s: { student_code: '1' }, citizen: '1', birth: '2013-01-01', fam: { father: 'นายพ่อ', guardian: 'นางยาย' }, addrShort: '1 ม.2', ...o });
  const dd = { ...d, students: [stx({}), stx({ citizen: null, birth: null, s: {}, fam: {}, addrShort: null })] };
  const r1 = w(dd, ['ชื่อนักเรียน', 'บิดามารดา', 'ผู้ปกครอง']);
  assert.match(r1, /เลขประจำตัวประชาชน: 1 คน/); assert.match(r1, /วันเกิด: 1 คน/); assert.match(r1, /เลขประจำตัวนักเรียน: 1 คน/);
  assert.match(r1, /ชื่อบิดา\/มารดา: 1 คน/); assert.match(r1, /ผู้ปกครอง: 1 คน/); assert.match(r1, /ที่อยู่ปัจจุบัน: 1 คน/); assert.match(r1, /เมนู "นักเรียน" → แก้ไข/);
  const r2 = w({ ...dd, school: { school_name: 'ร.ร.' }, homeroom: [], approveDate: null }, ['ปก ปพ.5 รายชั้น']);
  assert.match(r2, /ชื่อผู้อำนวยการ/); assert.match(r2, /ครูประจำชั้น/); assert.match(r2, /วันที่อนุมัติผลการเรียน/);
}
// เล่ม ปพ.: ช่องคะแนนเริ่มที่ BZ (คอลัมน์ 78) เหมือนใบที่โรงเรียนพิมพ์ · ชิ้นที่ 13+ ต่อไปที่ AP
{
  assert.equal(scoreColIndex(0), 78); assert.equal(scoreColIndex(11), 89); assert.equal(scoreColIndex(12), 42); assert.equal(scoreColIndex(13), 43);
  const writes = new Map();
  const t = { sheet: () => true, readText: () => null, existing: () => [], write: (name, edits) => { writes.set(name, edits); return { written: edits.size, skipped: [] }; } };
  const items = Array.from({ length: 14 }, (_, k) => ({ title: `งาน ${k + 1}`, max: 10 }));
  const dd = { level: 'ม.1', levelShort: 'ม.1', room: 1, term: 1, year: 2569, school: {}, students: [{ no: 1, s: { first_name: 'ก' }, raw: {}, occ: [], trait8: [], rtw: [], values12: [], comp5: [], acts: [], health: [], att: {} }], warnings: [], rounds: [],
    subjects: [{ code: 'ท', name: 'ไทย', credits: 1, mid: 70, fin: 30, group: '', teachers: [], indicators: [], items, rows: [{ ind: [], scores: items.map((_, k) => k + 1), final: null, special: null }] }] };
  fillBook(t, dd);
  const e = writes.get('วิชาที่ 1');
  const val = (ref) => e.get(ref)?.v;
  assert.equal(val('BZ5'), 'งาน 1'); assert.equal(val('BZ6'), 10); assert.equal(val('BZ7'), 1); assert.equal(val('CK7'), 12);   // ชิ้นที่ 1–12 = BZ–CK
  assert.equal(val('AP7'), 13); assert.equal(val('AQ7'), 14);                                                                      // ชิ้นที่ 13–14 = AP–AQ
}
// รายวิชาของภาคเรียนใดก็ได้ (เลือกภาคเรียน/ปีการศึกษาย้อนหลังในแบบพิมพ์ ปพ.5)
{
  const room = { id: 'c1' };
  const ctx = {
    term: { id: 't-now' }, courses: [{ id: 'k-now', classroom_id: 'c1', term_id: 't-now' }, { id: 'k-other-room', classroom_id: 'c2', term_id: 't-now' }],
    subjectById: { s1: { code: 'ท', name: 'ไทย' }, s2: { code: 'ค', name: 'คณิต' } }, profileById: { p1: { id: 'p1', full_name: 'ครู ก' } }, courseTeacherRows: [{ course_id: 'k-old2', teacher_id: 'p1' }],
    db: { select: async (t, q) => { assert.equal(t, 'courses'); assert.deepEqual(q.eq, { classroom_id: 'c1', term_id: 't-old' });
      return [{ id: 'k-old2', subject_id: 's2', sort_order: 2, classroom_id: 'c1', term_id: 't-old' }, { id: 'k-old1', subject_id: 's1', sort_order: 1, classroom_id: 'c1', term_id: 't-old' }]; } },
  };
  assert.deepEqual((await coursesOf(ctx, room, { id: 't-now' })).map((k) => k.id), ['k-now'], 'ภาคปัจจุบันใช้ ctx.courses เฉพาะห้องนี้');
  const old = await coursesOf(ctx, room, { id: 't-old' });
  assert.deepEqual(old.map((k) => k.id), ['k-old1', 'k-old2'], 'ภาคอื่นอ่านจากฐานข้อมูลและเรียงตามลำดับ');
  assert.equal(old[0].subject.name, 'ไทย'); assert.equal(old[0].classroom, room); assert.deepEqual(old[1].teachers.map((t) => t.full_name), ['ครู ก']);
}
console.log('pp-book: ผ่านทั้งหมด');
