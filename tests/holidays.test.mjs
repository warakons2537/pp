// ทดสอบวันหยุด/วันสำคัญ (js/holidays.js): node tests/holidays.test.mjs
import assert from 'node:assert/strict';
import { loadSchoolDays, dayMapOf, isHoliday, expandRange, fixedHolidayRows, FIXED_HOLIDAYS, KINDS } from '../js/holidays.js';

// ช่วงวันที่
assert.deepEqual(expandRange('2026-10-12', '2026-10-14'), ['2026-10-12', '2026-10-13', '2026-10-14']);
assert.deepEqual(expandRange('2026-10-13'), ['2026-10-13']);
assert.deepEqual(expandRange('2026-10-16', '2026-10-19', { skipWeekend: true }), ['2026-10-16', '2026-10-19']);   // ศ. → จ. (ข้าม ส.-อา.)
assert.deepEqual(expandRange(''), []);
assert.equal(expandRange('2026-01-01', '2027-12-31').length, 120, 'จำกัดไม่เกิน 120 วัน');

// แผนที่วัน / วันหยุด
const rows = [{ day: '2026-10-13', name: 'วันนวมินทรมหาราช', kind: 'holiday' }, { day: '2026-10-20', name: 'งานกีฬาสี', kind: 'note' }];
const map = dayMapOf(rows);
assert.ok(isHoliday(map, '2026-10-13')); assert.ok(!isHoliday(map, '2026-10-20'), 'วันสำคัญไม่ปิดช่อง'); assert.ok(!isHoliday(map, '2026-10-14'));
assert.deepEqual(Object.keys(KINDS), ['holiday', 'note']);

// วันสำคัญคงที่ของปีการศึกษา 2569 (พ.ค. 2026 – เม.ย. 2027)
const fixed = fixedHolidayRows(2569);
assert.equal(fixed.length, FIXED_HOLIDAYS.length);
assert.equal(fixed[0].day, '2026-05-01'); assert.equal(fixed.at(-1).day, '2027-04-15');
assert.ok(fixed.some((x) => x.day === '2026-07-28' && /ร\.10/.test(x.name)) && fixed.some((x) => x.day === '2027-01-01') && fixed.some((x) => x.day === '2026-10-23'));
assert.ok(fixed.every((x) => x.kind === 'holiday') && fixed.every((x, i, a) => i === 0 || a[i - 1].day <= x.day), 'เรียงตามวันที่');
assert.equal(new Set(fixed.map((x) => x.day)).size, fixed.length, 'ไม่มีวันซ้ำ');

// อ่านจากฐานข้อมูล: กรองช่วง + เรียง · ตารางยังไม่มี = missing
const db = { select: async (t, q) => { assert.equal(t, 'school_days'); return rows.filter((r) => (!q.gte || r.day >= q.gte.day) && (!q.lte || r.day <= q.lte.day)).reverse(); } };
const a = await loadSchoolDays(db, '2026-10-01', '2026-10-31'); assert.equal(a.missing, false); assert.deepEqual(a.rows.map((r) => r.day), ['2026-10-13', '2026-10-20']);
assert.equal((await loadSchoolDays(db, '2026-10-14', '2026-10-31')).rows.length, 1);
const m = await loadSchoolDays({ select: async () => { throw new Error('relation "school_days" does not exist'); } }, '2026-10-01', '2026-10-31');
assert.deepEqual(m, { rows: [], missing: true });
console.log('holidays: ผ่านทั้งหมด');
