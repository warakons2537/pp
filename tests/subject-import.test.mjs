// ทดสอบการนำเข้าไฟล์คะแนนเก็บเพื่อสร้างรายวิชา:  node tests/subject-import.test.mjs
// หัวกระดาษตัวอย่างนำมาจากไฟล์จริงของโรงเรียน ม.2 ภาค 1/2569 (15 ไฟล์)
import assert from 'node:assert/strict';
import { parseLine1, parseLine2, codeLevel, matchSubject, pickClassroom, buildRows, rowStatus, defaultAction, courseRatio } from '../js/subject-import.js';

assert.deepEqual(parseLine1('ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569'), { level: 'ม.2', room: null, term: 1, year: 2569 });
assert.deepEqual(parseLine1('ชั้นมัธยมศึกษาปี ที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569'), { level: 'ม.2', room: null, term: 1, year: 2569 });
assert.deepEqual(parseLine1('ม.2 เทอม 1'), { level: 'ม.2', room: null, term: 1, year: null });
assert.deepEqual(parseLine1('ชั้นประถมศึกษาปีที่ ๔ ห้อง ๒ ภาคเรียนที่ ๒ ปีการศึกษา ๒๕๖๙'), { level: 'ป.4', room: 2, term: 2, year: 2569 });
assert.deepEqual(parseLine1('ป.4/2 ภาค 2'), { level: 'ป.4', room: 2, term: 2, year: null });
assert.equal(parseLine1('').level, null);

assert.deepEqual(parseLine2('วิชา ภาษาอังกฤษ (อ22101)'), { code: 'อ22101', name: 'ภาษาอังกฤษ', alt: '' });
assert.deepEqual(parseLine2('วิชาภาษาไทย'), { code: '', name: 'ภาษาไทย', alt: '' });
assert.deepEqual(parseLine2('วิชา  สังคมศึกษา ศาสนาและวัฒนธรรม'), { code: '', name: 'สังคมศึกษา ศาสนาและวัฒนธรรม', alt: '' });
assert.deepEqual(parseLine2('วิฃา สุขศึกษา'), { code: '', name: 'สุขศึกษา', alt: '' });
assert.deepEqual(parseLine2('วิฃา สุขศึกษา', 'พลศึกษา'), { code: '', name: 'พลศึกษา', alt: 'สุขศึกษา' });
assert.deepEqual(parseLine2('วิชา คอมพิวเตอร์ (ว22201)', 'วิชา คอมพิวเตอร์ (ว22201)'), { code: 'ว22201', name: 'คอมพิวเตอร์', alt: '' });

const subjects = [
  { id: 's1', code: 'ท22101', name: 'ภาษาไทย', level: 'ม.2' },
  { id: 's2', code: 'ท21101', name: 'ภาษาไทย', level: 'ม.1' },
  { id: 's3', code: 'อ22101', name: 'ภาษาอังกฤษ 2', level: 'ม.2' },
  { id: 's4', code: 'พ22101', name: 'สุขศึกษา', level: null },
  { id: 's5', code: 'พ21101', name: 'สุขศึกษา', level: null },
];
assert.equal(codeLevel('ท22101'), 'ม.2'); assert.equal(codeLevel('ค 14101'), 'ป.4'); assert.equal(codeLevel('ท31101'), null); assert.equal(codeLevel('ไม่มี'), null);
assert.equal(matchSubject(subjects, { code: 'อ22101', name: 'ภาษาอังกฤษ' }, 'ม.2').subject.id, 's3');
// ไฟล์มีรหัสแต่ระบบยังไม่มี → วิชาใหม่ ห้ามไปจับวิชาชื่อเดียวกันรหัสอื่น
assert.equal(matchSubject([{ id: 'e1', code: 'อ21101', name: 'ภาษาอังกฤษ', level: null }], { code: 'อ22101', name: 'ภาษาอังกฤษ' }, 'ม.2').subject, null);
// ชื่อตรงแต่เป็นวิชาของชั้นอื่น (ดูจากรหัส) → ไม่จับคู่
assert.equal(matchSubject([{ id: 'e2', code: 'ท21101', name: 'ภาษาไทย', level: null }], { code: '', name: 'ภาษาไทย' }, 'ม.2').subject, null);
assert.equal(matchSubject(subjects, { code: '', name: 'ภาษาไทย' }, 'ม.2').subject.id, 's1');
assert.equal(matchSubject(subjects, { code: '', name: 'ภาษาไทย' }, null).subject, null);
assert.equal(matchSubject(subjects, { code: '', name: 'สุขศึกษา' }, 'ม.2').subject.id, 's4');
assert.equal(matchSubject([...subjects, { id: 's6', code: 'พ22102', name: 'สุขศึกษา', level: 'ม.2' }], { code: '', name: 'สุขศึกษา' }, 'ม.2').many, 2);
assert.equal(matchSubject(subjects, { code: '', name: 'คณิตศาสตร์' }, 'ม.2').subject, null);

const classrooms = [{ id: 'c1', level: 'ม.2', room: 1 }, { id: 'c2', level: 'ป.4', room: 1 }, { id: 'c3', level: 'ป.4', room: 2 }];
assert.equal(pickClassroom(classrooms, { level: 'ม.2', room: null }).id, 'c1');
assert.equal(pickClassroom(classrooms, { level: 'ป.4', room: null }), null);
assert.equal(pickClassroom(classrooms, { level: 'ป.4', room: 2 }).id, 'c3');

const P = (line1, line2, extra = {}) => ({ line1, line2, midRatio: 70, finalRatio: 30, items: [{ title: 'งาน 1', max: 10 }],
  students: [{ no: 1, name: 'ก', scores: [5], final: 20, special: null }], warnings: [], ...extra });
const term = { term: 1, academic_year: 2569 };
const files = [
  { fileName: 'ไทย.xlsb', parsed: P('ม.2 เทอม 1', 'วิชาภาษาไทย') },
  { fileName: 'อังกฤษ.xlsx', parsed: P('ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569', 'วิชา ภาษาอังกฤษ (อ22101)') },
  { fileName: 'อังกฤษ (สำเนา).xlsx', parsed: P('ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569', 'วิชา ภาษาอังกฤษ (อ22101)') },
  { fileName: 'พละ.xlsb', parsed: P('ชั้นมัธยมศึกษาปี ที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569', 'วิฃา สุขศึกษา', { midRatio: 80, finalRatio: 20 }), d2: 'พลศึกษา' },
  { fileName: 'นาฏศิลป์.xlsb', parsed: P('ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2568', 'วิชา นาฏศิลป์เพิ่มเติม') },
];
const rows = buildRows(files, { subjects, classrooms, term });
assert.equal(rows[0].code, 'ท22101'); assert.equal(rows[0].matchedBy, 'name'); assert.equal(rows[0].classroomId, 'c1');
assert.equal(rows[1].code, 'อ22101'); assert.equal(rows[1].name, 'ภาษาอังกฤษ 2'); assert.equal(rows[1].matchedBy, 'code');
assert.equal(rows[3].name, 'พลศึกษา'); assert.equal(rows[3].code, '');
assert.ok(rows[3].warnings.some((w) => w.includes('2 ชื่อ')));
assert.ok(rows[4].warnings.some((w) => w.includes('1/2568')));
assert.ok(!rows[1].warnings.some((w) => w.includes('ภาคเรียนปัจจุบัน')));

const courses = [{ id: 'k1', subject_id: 's1', classroom_id: 'c1' }];
const db = { subjects, courses };
const st = rows.map((_, i) => rowStatus(rows, i, db));
assert.equal(st[0].kind, 'exists'); assert.equal(st[0].course.id, 'k1'); assert.equal(defaultAction(st[0]), 'skip');
assert.equal(st[1].kind, 'new'); assert.equal(defaultAction(st[1]), 'import');
assert.equal(st[2].kind, 'dup'); assert.equal(st[2].dupOf, 1); assert.equal(defaultAction(st[2]), 'skip');
assert.deepEqual(st[3].missing, ['รหัสวิชา']);
rows[3].code = 'พ22102'; assert.deepEqual(rowStatus(rows, 3, db).missing, []);

assert.deepEqual(courseRatio({ midRatio: 80, finalRatio: 20 }), [80, 20]);
assert.deepEqual(courseRatio({ midRatio: 100, finalRatio: 0 }), [100, 0]);
assert.deepEqual(courseRatio({ midRatio: 70, finalRatio: 20 }), [70, 30]);
console.log('subject-import: ผ่านทั้งหมด');
