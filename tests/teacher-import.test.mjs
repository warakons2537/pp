// ทดสอบการนำเข้าครูจากไฟล์ CSV ของ WL Scheduler:  node tests/teacher-import.test.mjs
import assert from 'node:assert/strict';
import { parseCsv, readSchedulerCsv, teacherKey, displayName, looksLikePerson, subjectNameKey, teacherChoices, subjectChoices, planLinks } from '../js/teacher-import.js';

assert.deepEqual(parseCsv('﻿"a","b ""c""",d\r\n"x,y","",z\n'), [['a', 'b "c"', 'd'], ['x,y', '', 'z']]);

const csv = `"ชั้น","รายวิชา","ชั่วโมงเดิม","ครูประจำรายวิชา","ครูร่วมรายวิชา"
"ป.1","ภาษาไทย","5","ครูเจษฎ์สุดา ขำพงศ์",""
"ป.2","ภาษาไทย","5","ครูสุปราณี นาคชม",""
"ม.2","ภาษาอังกฤษ","3","ครูวรากร ตรงต่อกิจ",""
"ป.1","แนะแนว","1","ครูแนะแนวและสวดมนต์","ครูเจษฎ์สุดา ขำพงศ์ + ครูอุสา หิรัญหลวง"
"ป.1","พละ","1","ครูวิวัฒน์ พานทอง",""
"ม.3","ภาษาไทย","3","ครูพราภรณ์ รอดนุช",""
`;
const rows = readSchedulerCsv(csv);
assert.equal(rows.length, 6);
assert.deepEqual(rows[0], { line: 2, level: 'ป.1', subject: 'ภาษาไทย', teacher: 'ครูเจษฎ์สุดา ขำพงศ์' });
assert.throws(() => readSchedulerCsv('"ชั้น","วิชา"\n"ป.1","x"'), /ไม่พบคอลัมน์ รายวิชา, ครูประจำรายวิชา/);

assert.equal(teacherKey('ครูนางสาว สมศรี  ใจดี'), 'สมศรีใจดี');
assert.equal(teacherKey('นาง สาวิตรี ดี'), 'สาวิตรีดี');
assert.equal(teacherKey('ครูวรากร ตรงต่อกิจ'), teacherKey('นายวรากร  ตรงต่อกิจ'));
assert.equal(displayName('ครูวีระยุทธ์  นาคมี'), 'วีระยุทธ์ นาคมี');
assert.equal(looksLikePerson('ครูแนะแนวและสวดมนต์'), false);
assert.equal(looksLikePerson('ครูอุษา ภูวิใจ'), true);
assert.equal(subjectNameKey('ภาษาอังกฤษ 2'), 'ภาษาอังกฤษ');
assert.equal(subjectNameKey('ภาษาอังกฤษ ๒'), 'ภาษาอังกฤษ');

const profiles = [
  { id: 'u1', full_name: 'นายวรากร ตรงต่อกิจ', has_account: true },
  { id: 'u2', full_name: 'สุปราณี นาคชม', has_account: false },
  { id: 'u3', full_name: 'พราภรณ์ รอดนุช' }, { id: 'u4', full_name: 'นางพราภรณ์ รอดนุช' },
];
const tc = teacherChoices(rows, profiles);
const choice = (n) => tc.find((t) => t.name === n).choice;
assert.equal(choice('ครูวรากร ตรงต่อกิจ'), 'u1');
assert.equal(choice('ครูสุปราณี นาคชม'), 'u2');
assert.equal(choice('ครูเจษฎ์สุดา ขำพงศ์'), 'new');
assert.equal(choice('ครูแนะแนวและสวดมนต์'), 'skip');
assert.equal(choice('ครูพราภรณ์ รอดนุช'), ''); // ชื่อตรง 2 คน → ให้ผู้ดูแลเลือก
assert.equal(tc.length, 6);

const subjects = [{ id: 's1', name: 'ภาษาไทย' }, { id: 's2', name: 'ภาษาอังกฤษ 2' }, { id: 's3', name: 'พลศึกษา' }];
const sc = subjectChoices(rows, subjects);
assert.deepEqual(sc.map((s) => [s.name, s.choice]), [['ภาษาไทย', 'ภาษาไทย'], ['ภาษาอังกฤษ', 'ภาษาอังกฤษ'], ['แนะแนว', ''], ['พละ', '']]);

const room = (level, n = 1) => ({ level, room: n });
const courses = [
  { id: 'k1', subject: subjects[0], classroom: room('ป.1'), teachers: [] },
  { id: 'k2', subject: subjects[0], classroom: room('ป.2', 1), teachers: [{ id: 'u2' }] },
  { id: 'k3', subject: subjects[0], classroom: room('ป.2', 2), teachers: [] },
  { id: 'k4', subject: subjects[1], classroom: room('ม.2'), teachers: [] },
  { id: 'k5', subject: subjects[2], classroom: room('ป.1'), teachers: [] },
];
const tMap = new Map(tc.map((t) => [t.name, t.choice]));
const sMap = new Map(sc.map((s) => [s.name, s.choice]));
sMap.set('พละ', 'พลศึกษา'); // ผู้ดูแลเลือกเอง
let plan = planLinks(rows, courses, tMap, sMap);
assert.deepEqual(plan.links.map((l) => [l.courseId, l.teacherId, l.already]),
  [['k1', 'new', false], ['k2', 'u2', true], ['k3', 'u2', false], ['k4', 'u1', false], ['k5', 'new', false]]);
assert.deepEqual(plan.skipped.map((r) => [r.line, r.reason]), [[5, 'ข้ามชื่อนี้'], [7, 'ยังไม่ได้เลือกครู']]);
tMap.set('ครูพราภรณ์ รอดนุช', 'u3');
plan = planLinks(rows, courses, tMap, sMap);
assert.match(plan.skipped.find((r) => r.line === 7).reason, /ไม่พบการเปิดสอนวิชานี้ของ ม\.3/);

console.log('teacher-import: ผ่านทั้งหมด');
