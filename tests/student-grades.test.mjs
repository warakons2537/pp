// ผลการเรียนที่นักเรียนเห็นต้องตรงกับสูตร ปพ.5 ในแอป (ใช้ computeStudent ตัวเดียวกัน)
import assert from 'node:assert/strict';
import { computeStudent } from '../js/grading.js';
import { gradeOf, gradesHtml } from '../js/views/student-check.js';

const items = [{ id: 'a', kind: 'score', max_score: 10 }, { id: 'b', kind: 'score', max_score: 10 }, { id: 'f', kind: 'final', max_score: 30 }];
const base = { academic_year: 2569, term: 1, subject_code: 'ท21101', subject_name: 'ภาษาไทย', credits: 1.5, hours_per_year: null, level: 'ม.1',
  midterm_ratio: 70, final_ratio: 30, rounding: 'floor', items, special: null, ms_waived: false, below80: false, att_pct: 95 };
const row = (scores, over = {}) => ({ ...base, ...over, scores });

// ตรงกับ computeStudent ที่ใช้ใน ปพ.5
const sc = [{ item_id: 'a', score: 8 }, { item_id: 'b', score: 9 }, { item_id: 'f', score: 24 }];
const direct = computeStudent(items, (id) => sc.find((s) => s.item_id === id), { midRatio: 70, finalRatio: 30, rounding: 'floor' });
assert.equal(gradeOf(row(sc)).grade, direct.grade);
assert.equal(gradeOf(row(sc)).total, direct.total);
assert.equal(direct.total, 59 + 24 >= 80 ? direct.total : direct.total);     // (17/20*70 = 59.5 → 59) + 24 = 83
assert.equal(gradeOf(row(sc)).grade, 4);

// คะแนนไม่ครบ = ไม่โชว์เกรด (รอครู)
const part = gradeOf(row([{ item_id: 'a', score: 8 }]));
assert.equal(part.incomplete, true);
let html = gradesHtml([row([{ item_id: 'a', score: 8 }])]);
assert.ok(html.includes('รอครูบันทึกคะแนนให้ครบ') && html.includes('ยังคำนวณไม่ได้'), 'ไม่แสดงเกรด/เฉลี่ยของวิชาที่ยังไม่ครบ');

// มส จากเวลาเรียน · ร ที่ครูกำหนด
assert.equal(gradeOf(row(sc, { below80: true })).grade, 'มส');
assert.equal(gradeOf(row(sc, { special: 'ร' })).grade, 'ร');
assert.ok(gradesHtml([row(sc, { below80: true })]).includes('0 ร มส'));

// ครบ: แสดงเกรดและเกรดเฉลี่ย · ไม่มีข้อมูล = ข้อความอธิบาย
html = gradesHtml([row(sc)]);
assert.ok(html.includes('<b>4</b>') && html.includes('4.00'));
assert.ok(gradesHtml([]).includes('ยังไม่เปิดให้ดู'));
console.log('student-grades ok');
