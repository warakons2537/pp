import assert from 'node:assert/strict';
import { parseClip, toTsv, fillValues, wantSeries, isNum } from '../js/sheet-core.js';

assert.deepEqual(parseClip('1\t2\r\n3\t4\n'), [['1', '2'], ['3', '4']]);
assert.deepEqual(parseClip('x'), [['x']]);
assert.equal(toTsv([['a', ''], ['b', 'c']]), 'a\t\nb\tc');
assert.ok(isNum('-3.5') && isNum(' 7 ') && !isNum('') && !isNum('1a') && !isNum('ข'));

// คัดลอกวนซ้ำ
assert.deepEqual(fillValues(['ผ'], 3), ['ผ', 'ผ', 'ผ']);
assert.deepEqual(fillValues(['มา', 'ขาด'], 5), ['มา', 'ขาด', 'มา', 'ขาด', 'มา']);
// เรียงเลข
assert.deepEqual(fillValues(['1', '2'], 3, { series: true }), ['3', '4', '5']);
assert.deepEqual(fillValues(['5'], 3, { series: true }), ['6', '7', '8']);
assert.deepEqual(fillValues(['10', '20'], 2, { series: true }), ['30', '40']);
assert.deepEqual(fillValues(['0.1', '0.2'], 2, { series: true }), ['0.3', '0.4']);   // ไม่มีเศษลอยตัว
// เติมขึ้น: ส่งต้นทางกลับด้านมา (ตัวสุดท้ายติดช่องปลายทาง)
assert.deepEqual(fillValues(['2', '1'], 3, { series: true }), ['0', '-1', '-2']);
// ต้นทางไม่ใช่ตัวเลข → ไม่เรียงเลขแม้ขอ
assert.deepEqual(fillValues(['ก', 'ข'], 2, { series: true }), ['ก', 'ข']);
assert.deepEqual(fillValues([], 2), ['', '']);
// กฎ Excel
assert.equal(wantSeries(['5'], false), false);
assert.equal(wantSeries(['5'], true), true);
assert.equal(wantSeries(['1', '2'], false), true);
assert.equal(wantSeries(['1', '2'], true), false);
assert.equal(wantSeries(['ก'], true), false);
console.log('sheet-core ok');
