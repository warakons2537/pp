// ทดสอบรายชื่อนักเรียน + ช่องว่าง:  node tests/report-list.test.mjs
import assert from 'node:assert/strict';
import { blankHeads, roomsInScope, listGroups, listPages, LIST_DEFAULTS } from '../js/views/report-list.js';

// หัวช่อง: ชื่อที่พิมพ์มาก่อน ที่เหลือว่าง · ชื่อเกินจำนวนช่อง = เพิ่มช่อง
assert.deepEqual(blankHeads({ cols: 4, labels: 'ก, ข' }), ['ก', 'ข', '', '']);
assert.deepEqual(blankHeads({ cols: 1, labels: 'ก,ข,ค,' }), ['ก', 'ข', 'ค']);
assert.deepEqual(blankHeads({ cols: 0, labels: '' }), []);
assert.equal(blankHeads({ cols: 999 }).length, 40);

const rooms = [
  { id: 'a', level: 'ป.1', room: 1 }, { id: 'b', level: 'ป.1', room: 2 }, { id: 'c', level: 'ม.1', room: 1 },
];
assert.deepEqual(roomsInScope(rooms, 'room', 'b').map((r) => r.id), ['b']);
assert.deepEqual(roomsInScope(rooms, 'lv:ป.1').map((r) => r.id), ['a', 'b']);
assert.equal(roomsInScope(rooms, 'all').length, 3);

const st = (n, g, first) => ({ number: n, gender: g, prefix: 'ด.ช.', first_name: first, last_name: 'ใจดี', student_code: `0${n}` });
const entries = [
  { room: rooms[0], roster: [st(1, 'ช', 'ก'), st(2, 'ญ', 'ข')] },
  { room: rooms[1], roster: [st(1, 'ช', 'ค')] },
  { room: rooms[2], roster: [st(1, 'ญ', 'ง')] },
];
// หน้าละห้อง
assert.equal(listGroups(entries, { scope: 'all', group: 'room' }).length, 3);
// รวมทั้งชั้น: ป.1 สองห้องรวมเป็นหน้าเดียว (ไม่มี room) · ม.1 ห้องเดียวคงเป็นหน้าห้อง
const lv = listGroups(entries, { scope: 'all', group: 'level' });
assert.equal(lv.length, 2);
assert.equal(lv[0].room, null); assert.equal(lv[0].students.length, 3);
assert.equal(lv[1].room.id, 'c');

const ctx = { term: { term: 2, academic_year: 2569 }, settings: { school_name: 'ทดสอบ' }, homeroomTeachers: () => [{ full_name: 'ครูเอ' }] };
const o = { ...LIST_DEFAULTS, scope: 'all', group: 'level', cols: 3, labels: 'ชิ้นที่ 1', note: 'กิจกรรม <ลอยกระทง>', total: true };
const html = listPages(ctx, lv, o);
assert.equal((html.match(/class="a4 /g) || []).length, 2, 'สองหน้า');
assert.ok(html.includes('ชั้นประถมศึกษาปีที่ 1</h2>') || html.includes('ชั้นประถมศึกษาปีที่ 1'), 'หัวเรื่องทั้งชั้น');
assert.ok(html.includes('&lt;ลอยกระทง&gt;'), 'escape ชื่อกิจกรรม');
assert.ok(html.includes('<td>ป.1/2</td>'), 'มีคอลัมน์ห้องเมื่อรวมทั้งชั้น');
assert.ok(html.includes('ชิ้นที่ 1') && html.includes('>รวม</th>'));
// ช่องว่างซ้าย: แถวแรกขึ้นต้นด้วยช่องว่าง 3+1 ช่อง ก่อนลำดับ
assert.match(html, /<tr><td><\/td><td><\/td><td><\/td><td><\/td><td>1<\/td>/);
// ขวา: ลำดับมาก่อน
const r = listPages(ctx, listGroups(entries.slice(0, 1), { scope: 'room' }), { ...o, scope: 'room', side: 'right', total: false });
assert.match(r, /<tr><td>1<\/td><td>01<\/td>/);
assert.ok(r.includes('ครูเอ'), 'ลงชื่อครูประจำชั้น');
assert.ok(!listPages(ctx, [], o).includes('a4'));
console.log('ผ่านทุกข้อ ✓');
