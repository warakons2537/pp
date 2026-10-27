// ทดสอบตัวชี้วัดกลางของรายวิชา:  node tests/indicators.test.mjs
import assert from 'node:assert/strict';
import { normIndicatorCode, indKey, codeLevelOf, levelMismatch, parseIndicatorLines, missingForCourse, parseBookIndicators, planBookImport } from '../js/indicators.js';

// จัดรูปแบบรหัส (รูปแบบที่พบจริงในเล่ม ปพ. ม.3)
assert.equal(normIndicatorCode('ท 1.1 ม 3/3'), 'ท 1.1 ม.3/3');
assert.equal(normIndicatorCode('ค 1.1 ม 3/1'), 'ค 1.1 ม.3/1');
assert.equal(normIndicatorCode('  ท1.1   ม.3/1 '), 'ท 1.1 ม.3/1');
assert.equal(normIndicatorCode('ท 1.1ม.3/1'), 'ท 1.1 ม.3/1');
assert.equal(normIndicatorCode('ว 1.1 ม.3/1 - 6'), 'ว 1.1 ม.3/1-6');       // ช่วงไม่แตก
assert.equal(normIndicatorCode('ป 4 / 2'), 'ป.4/2');
assert.equal(normIndicatorCode('ผลการเรียนรู้ 1'), 'ผลการเรียนรู้ 1');
assert.equal(normIndicatorCode('ท ๑.๑ ม ๓/๓'), 'ท ๑.๑ ม.๓/๓');            // คงเลขไทย
assert.equal(indKey('ท ๑.๑ ม.๓/๓'), indKey('ท 1.1 ม 3/3'));

// ชั้นในรหัส
assert.equal(codeLevelOf('ท 1.1 ม 4/4'), 'ม.4');
assert.equal(codeLevelOf('ผลการเรียนรู้ 1'), null);
assert.deepEqual(levelMismatch(['ท 1.1 ม.3/1', 'ท 1.1 ม.4/4', 'ท 1.1 ม.5/5', 'ผลการเรียนรู้ 1'], { code: 'ท23101' }), ['ท 1.1 ม.4/4', 'ท 1.1 ม.5/5']);
assert.deepEqual(levelMismatch(['ท 1.1 ม.4/4'], { code: 'ท23101', level: 'ม.4' }), []);

// วางหลายบรรทัด: ตัดซ้ำกันเองและซ้ำกับของเดิม
const p = parseIndicatorLines('ท 1.1 ม.3/1\tอ่านออกเสียง\nท 1.1 ม 3/1\n\nท 1.1 ม.3/2\nท 1.1 ม.3/3', [{ code: 'ท 1.1 ม.3/3' }]);
assert.deepEqual(p.rows, [{ code: 'ท 1.1 ม.3/1', title: 'อ่านออกเสียง' }, { code: 'ท 1.1 ม.3/2', title: null }]);
assert.deepEqual(p.dup, ['ท 1.1 ม.3/1', 'ท 1.1 ม.3/3']);

// ใส่ลงห้อง: เพิ่มเฉพาะที่ไม่มี (เทียบแบบจัดรูปแบบแล้ว) ต่อท้ายลำดับเดิม
const master = [{ code: 'ท 1.1 ม.3/2', sort_order: 2 }, { code: 'ท 1.1 ม.3/1', sort_order: 1 }, { code: 'ท 1.1 ม.3/3', title: 'x', sort_order: 3 }];
const items = [{ kind: 'score', sort_order: 5 }, { kind: 'indicator', code: 'ท 1.1 ม 3/1', sort_order: 6 }];
assert.deepEqual(missingForCourse('k1', master, items), [
  { course_id: 'k1', kind: 'indicator', code: 'ท 1.1 ม.3/2', title: null, max_score: null, sort_order: 7 },
  { course_id: 'k1', kind: 'indicator', code: 'ท 1.1 ม.3/3', title: 'x', max_score: null, sort_order: 8 }]);
assert.deepEqual(missingForCourse('k1', master, [...items, { kind: 'indicator', code: 'ท 1.1 ม.3/2' }, { kind: 'indicator', code: 'ท1.1 ม.3/3' }]), []);

// อ่านเล่ม ปพ. (โครงสร้างเดียวกับไฟล์จริง: แถว 6 = วิชาที่ 1, แถว 14 เว้น, รหัสซ้ำ ง 23201 สองวิชา)
const grid = (rows) => rows;
const list = [];
list[1] = ['ชั้น', 'มัธยมศึกษาปีที่ 3']; list[2] = ['ภาคเรียนที่', 1];
list[5] = [1, 'ท 23101', 'ภาษาไทย']; list[6] = [2, 'ค 23101', 'คณิตศาสตร์'];
list[18] = [13, 'ง 23201', 'คอมพิวเตอร์ ']; list[19] = [14, 'ง 23201', 'ทักษะอาชีพเบื้องต้น'];
const hdr = (codes) => { const r = []; r[4] = [null, null, ...codes]; return r; };
const sheets = {
  'รายวิชา': grid(list),
  'วิชาที่ 1': hdr(['ท 1.1 ม.3/1', 'ท 1.1 ม 3/1', 'ท 1.1 ม 4/4', ...Array(33).fill(null), 'นอกช่อง AM']),
  'วิชาที่ 2': hdr(['ค 1.1 ม 3/1']),
  'วิชาที่ 3': hdr([]),
  'วิชาที่ 13': hdr(['ผลการเรียนรู้ 1']), 'วิชาที่ 14': hdr(['ผลการเรียนรู้ 1', 'ผลการเรียนรู้ 2']),
};
const book = parseBookIndicators(sheets);
assert.equal(book.level, 'มัธยมศึกษาปีที่ 3');
assert.deepEqual(book.subjects.map((s) => [s.n, s.code, s.codes]), [
  [1, 'ท 23101', ['ท 1.1 ม.3/1', 'ท 1.1 ม.4/4']], [2, 'ค 23101', ['ค 1.1 ม.3/1']],
  [13, 'ง 23201', ['ผลการเรียนรู้ 1']], [14, 'ง 23201', ['ผลการเรียนรู้ 1', 'ผลการเรียนรู้ 2']]]);
assert.deepEqual(book.subjects[0].dup, ['ท 1.1 ม.3/1']);
assert.throws(() => parseBookIndicators({ 'รายวิชา': [] }), /ไม่ใช่ไฟล์เล่ม/);

const subjects = [{ id: 's1', code: 'ท23101', name: 'ภาษาไทย' }, { id: 's2', code: 'ง23201', name: 'ทักษะอาชีพเบื้องต้น' }];
const plan = planBookImport(book, subjects, { s1: [{ code: 'ท 1.1 ม 3/1' }] });
assert.deepEqual(plan.map((r) => [r.n, r.subject?.id ?? null, r.fresh, r.pick, r.conflict]), [
  [1, 's1', ['ท 1.1 ม.4/4'], true, null], [2, null, ['ค 1.1 ม.3/1'], false, null],
  [13, 's2', ['ผลการเรียนรู้ 1'], false, 14], [14, 's2', ['ผลการเรียนรู้ 1', 'ผลการเรียนรู้ 2'], true, null]]);
assert.deepEqual(plan[0].levelWarn, ['ท 1.1 ม.4/4']);

console.log('indicators: ผ่านทั้งหมด');
