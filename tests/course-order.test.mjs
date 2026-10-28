import assert from 'node:assert/strict';
import { VERSION } from '../js/brand.js';
const { applyCourseOrder, inheritedOrder } = await import(`../js/course-order.js?v=${VERSION}`);
// ฐานข้อมูลจำลองแบบเบา: select(in)/update(id)
const rows = [];
const mk = (id, cl, term, sub, so) => rows.push({ id, classroom_id: cl, term_id: term, subject_id: sub, sort_order: so });
mk('a1', 'r1', 't1', 'A', 1); mk('b1', 'r1', 't1', 'B', 2); mk('c1', 'r1', 't1', 'C', 3);
mk('a2', 'r2', 't1', 'A', 1); mk('b2', 'r2', 't1', 'B', 2); mk('c2', 'r2', 't1', 'C', 3); mk('x2', 'r2', 't1', 'X', 4);
mk('a3', 'r1', 't2', 'A', 1); mk('b3', 'r1', 't2', 'B', 2);
mk('z', 'r9', 't1', 'A', 1);   // ห้องคนละระดับ ต้องไม่ถูกแตะ
const ctx = {
  classrooms: [{ id: 'r1', level: 'ม.3', academic_year: 2569 }, { id: 'r2', level: 'ม.3', academic_year: 2569 }, { id: 'r9', level: 'ม.2', academic_year: 2569 }],
  terms: [{ id: 't1', academic_year: 2569 }, { id: 't2', academic_year: 2569 }],
  db: {
    select: async (t, { in: inn }) => { const [[col, vals]] = Object.entries(inn); return rows.filter((r) => vals.includes(r[col])).map((r) => ({ ...r })); },
    update: async (t, { id }, p) => Object.assign(rows.find((r) => r.id === id), p),
  },
};
await applyCourseOrder(ctx, ctx.classrooms[0], ['C', 'A', 'B']);
const ord = (cl, t) => rows.filter((r) => r.classroom_id === cl && r.term_id === t).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.subject_id).join('');
assert.equal(ord('r1', 't1'), 'CAB'); assert.equal(ord('r2', 't1'), 'CABX'); assert.equal(ord('r1', 't2'), 'AB');
assert.equal(rows.find((r) => r.id === 'z').sort_order, 1);
assert.equal(await inheritedOrder(ctx, ctx.classrooms[0], 't2', 'C'), 1);   // วิชา C ภาค 2 รับลำดับจากภาค 1
assert.equal(await inheritedOrder(ctx, ctx.classrooms[0], 't2', 'Q'), null);
console.log('course-order: ผ่านทั้งหมด');
