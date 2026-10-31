import assert from 'node:assert/strict';
import { parseCsv, toCsv, rowsFromTable, planImport, subjectLevel, normGrade, suggest, TEMPLATE_HEADERS } from '../js/remedial-import.js';

// CSV: BOM · เครื่องหมายคำพูด · บรรทัดว่าง
const csv = '﻿เลขประจำตัว,ชื่อ-สกุล,ห้อง,รหัสวิชา,ชื่อวิชา,หน่วยกิต,ผลเดิม,สถานะ,หมายเหตุ\r\n1001,"สมชาย, ใจดี",ม.1/1,ค21101,คณิตศาสตร์,1.5,0,,"มี ""คำพูด"""\r\n\r\n';
const t = parseCsv(csv); assert.equal(t.length, 2); assert.equal(t[1][1], 'สมชาย, ใจดี'); assert.equal(t[1][8], 'มี "คำพูด"');
assert.deepEqual(parseCsv(toCsv(t)), t, 'เขียนแล้วอ่านกลับได้เท่าเดิม');
assert.equal(rowsFromTable(t)[0].grade, '0');
assert.throws(() => rowsFromTable([['ก', 'ข']]), /ไม่พบหัวคอลัมน์/);
assert.equal(TEMPLATE_HEADERS.length, 9);
assert.equal(subjectLevel('ค21101'), 1); assert.equal(subjectLevel('ท23101'), 3); assert.equal(subjectLevel('ศ21202'), 1); assert.equal(subjectLevel('xx'), null);
assert.equal(normGrade('๐'), '0'); assert.equal(normGrade('มส.'), 'มส'); assert.equal(normGrade('1'), null);
assert.deepEqual(suggest('มส'), { cause: 'absent', plan: 'tutoring' });

// สภาพแวดล้อมจำลอง: ปี 2569 · ภาคปัจจุบัน = ภาค 2 (t2) · ภาค 1 (t1) เป็นภาคที่แล้ว
const m11 = { id: 'c11', level: 'ม.1', room: 1, academic_year: 2569 }; const m21 = { id: 'c21', level: 'ม.2', room: 1, academic_year: 2569 }; const p61 = { id: 'p61', level: 'ป.6', room: 1, academic_year: 2569 };
const S = (id, first) => ({ id, first_name: first, last_name: 'ทดสอบ' });
const env = {
  byCode: new Map([['1001', { student: S('s1', 'สมชาย'), classroom: m11 }], ['2002', { student: S('s2', 'สมหญิง'), classroom: m21 }], ['3003', { student: S('s3', 'ป่า'), classroom: p61 }]]),
  courses: [{ id: 'k1', classroom_id: 'c11', term_id: 't1', code: 'ค21101', name: 'คณิตศาสตร์' }, { id: 'k2', classroom_id: 'c11', term_id: 't2', code: 'ค21102', name: 'คณิตศาสตร์' },
    { id: 'k3', classroom_id: 'c21', term_id: 't2', code: 'ท22102', name: 'ภาษาไทย' }],
  terms: new Map([['t1', { academic_year: 2569, term: 1 }], ['t2', { academic_year: 2569, term: 2 }]]), currentTermId: 't2',
  existing: { course: new Set(), legacy: new Set() },
};
const R = (o) => ({ line: 2, code: '1001', name: '', room: '', subject: 'ค21101', title: 'คณิต', credits: '1.5', grade: '0', status: '', note: '', ...o });
const one = (o, e = env) => planImport([R(o)], e).items[0];

// ภาคปัจจุบัน = รายการปกติ · ภาคก่อน = วิชาค้าง (ปี/ภาคจากรายวิชาที่พบ)
let it = one({ subject: 'ค21102' }); assert.equal(it.kind, 'course'); assert.equal(it.payload.course_id, 'k2'); assert.equal(it.payload.cause, 'low_score'); assert.equal(it.payload.plan, 'retest');
it = one({ subject: 'ค21101' }); assert.equal(it.kind, 'legacy'); assert.equal(it.payload.legacy_year, 2569); assert.equal(it.payload.legacy_term, 1); assert.equal(it.payload.course_id, null); assert.equal(it.payload.classroom_id, 'c11');
// ม.2 ติดวิชา ม.1 ที่ไม่มีในระบบ → ปีก่อน (ไม่รู้ภาค) · วิชาของชั้นสูงกว่า = ผิดพลาด
it = one({ code: '2002', subject: 'ท21101' }); assert.equal(it.kind, 'legacy'); assert.equal(it.payload.legacy_year, 2568); assert.equal(it.payload.legacy_term, null); assert.equal(it.level, 'ok');
assert.equal(one({ code: '1001', subject: 'ท22101' }).level, 'error');
assert.equal(one({ code: '2002', subject: 'ท22102' }).kind, 'course');
// ข้อผิดพลาด: ไม่พบนักเรียน · ผลเดิมไม่ถูกต้อง · ไม่ใช่นักเรียนมัธยม
assert.equal(one({ code: '9999' }).level, 'error'); assert.equal(one({ grade: '5' }).level, 'error'); assert.equal(one({ code: '3003' }).level, 'error');
// ชื่อไม่ตรงทะเบียน = เตือน (ยังนำเข้าได้)
it = one({ name: 'คนอื่น ทดสอบ' }); assert.equal(it.level, 'warn'); assert.ok(it.messages[0].includes('ไม่ตรงกับทะเบียน'));
// ร / มส ได้ข้อเสนอแนะต่างกัน
assert.deepEqual([one({ grade: 'ร' }).payload.cause, one({ grade: 'ร' }).payload.plan], ['missing_work', 'extra_work']);
assert.deepEqual([one({ grade: 'มส' }).payload.cause, one({ grade: 'มส' }).payload.plan], ['absent', 'tutoring']);
// "แก้แล้ว" → กำลังแก้ + หมายเหตุ (ไม่ข้ามไป "รอยืนยัน" เพราะยังไม่มีผลหลังแก้)
it = one({ status: 'แก้แล้ว' }); assert.equal(it.payload.status, 'in_progress'); assert.ok(it.payload.note.includes('แก้แล้ว'));
// ซ้ำกับที่มีอยู่/ซ้ำในไฟล์ = ข้าม
const env2 = { ...env, existing: { course: new Set(['k2|s1']), legacy: new Set(['s1|ค21101|2569']) } };
assert.equal(one({ subject: 'ค21102' }, env2).level, 'skip'); assert.equal(one({ subject: 'ค21101' }, env2).level, 'skip');
const dup = planImport([R({ subject: 'ค21102', line: 2 }), R({ subject: 'ค21102', line: 3 })], env); assert.deepEqual([dup.items[0].level, dup.items[1].level], ['ok', 'skip']);
// ติด 0 ทั้ง 6 วิชาขึ้นไป = เตือนและเสนอสาเหตุ "ขาดเรียน"
const many = planImport(['ค21101', 'ท21101', 'ว21101', 'ส21101', 'ส21102', 'ศ21101'].map((s, i) => R({ subject: s, line: i + 2 })), env);
assert.ok(many.items.every((x) => x.level === 'warn' && x.payload.cause === 'absent'));
// สรุป + รายการที่นำเข้าได้ไม่รวมข้าม/ผิดพลาด
const mix = planImport([R({ subject: 'ค21102' }), R({ code: '9999' }), R({ subject: 'ค21102', line: 4 })], env);
assert.deepEqual(mix.counts, { ok: 1, warn: 0, skip: 1, error: 1 }); assert.equal(mix.importable.length, 1);
console.log('remedial-import ok');
