import assert from 'node:assert/strict';
import { reorderPlan, moveItem } from '../js/reorder-core.js';

const active = [{ enrollment_id: 'a', number: 1 }, { enrollment_id: 'b', number: 2 }, { enrollment_id: 'c', number: 3 }, { enrollment_id: 'd', number: 4 }];
// ย้าย d ขึ้นไปที่ 2 → b,c เลื่อนลง · a ไม่เปลี่ยน
assert.deepEqual(reorderPlan(active, ['a', 'd', 'b', 'c']), [{ id: 'd', from: 4, to: 2 }, { id: 'b', from: 2, to: 3 }, { id: 'c', from: 3, to: 4 }]);
assert.deepEqual(reorderPlan(active, ['a', 'b', 'c', 'd']), [], 'ไม่เปลี่ยนลำดับ = ไม่มีอะไรต้องบันทึก');
// เลขที่เดิมเว้นช่อง/ว่าง → ถูกจัดเป็น 1..N ต่อเนื่อง
const gappy = [{ enrollment_id: 'x', number: 5 }, { enrollment_id: 'y', number: null }, { enrollment_id: 'z', number: 9 }];
assert.deepEqual(reorderPlan(gappy, ['y', 'x', 'z']).map((c) => c.to), [1, 2, 3]);
// ข้อมูลไม่ครบ/ซ้ำ ต้องไม่ยอมบันทึก (กันเลขที่เพี้ยน)
assert.throws(() => reorderPlan(active, ['a', 'b', 'c']));
assert.throws(() => reorderPlan(active, ['a', 'a', 'b', 'c']));
assert.throws(() => reorderPlan(active, ['a', 'b', 'c', 'zz']));
// ปุ่มลูกศร
assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 99), ['a', 'c', 'b']);
console.log('reorder-core ok');
