// ทดสอบแบบพิมพ์ในตัว (js/pp-forms.js): node tests/pp-forms.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summaryLevel, classModel, Forms } from '../js/pp-forms.js';

// ระดับสรุป (แบบไฟล์เดิม: MODE ของค่าที่เรียงจากมากไปน้อย, ไม่มีค่าซ้ำ = ค่าสูงสุด)
assert.equal(summaryLevel([2, 3, 3, 3, 2, 2, 2, 2]), 2);
assert.equal(summaryLevel([3, 3, 2, 2, 1, 0, 1, 0]), 3);      // เสมอ → ค่าสูงกว่า
assert.equal(summaryLevel([0, 1, 2, 3, null]), 3);            // ไม่มีค่าซ้ำ → สูงสุด
assert.equal(summaryLevel([0, 0, 0]), 0);
assert.equal(summaryLevel([0]), null);                        // ค่าเดียว = 0 → ว่าง (เหมือนไฟล์เดิม)
assert.equal(summaryLevel([null, null]), null);

// ข้อมูลห้องตัวอย่าง 3 คน 2 วิชา
const stu = (id, n, first) => ({ no: n, s: { id, prefix: 'เด็กชาย', first_name: first, last_name: 'ทดสอบ', student_code: String(6800 + n) },
  trait8: [3, 3, 3, 2, 2, 1, 1, 1], rtw: [2, 2, 1, 1, 0], values12: [], comp5: [1, 1, 2, 2, 3], acts: [true, true, false, true], club: 'ชุมนุมดนตรี' });
const d = {
  level: 'มัธยมศึกษาปีที่ 1', term: 1, year: 2569, approveDate: '2026-10-10', homeroom: ['ครู ก'],
  school: { school_name: 'บ้านทดสอบ', area_office: 'สพป.ทดสอบ เขต 1', director_name: 'ผอ. ทดสอบ', academic_head_name: 'วิชาการ ทดสอบ' },
  students: [stu('a', 1, 'หนึ่ง'), stu('b', 2, 'สอง'), stu('c', 3, 'สาม')],
  subjects: [
    { code: 'ท21101', name: 'ภาษาไทย', credits: 1.5, rows: [{ calc: { total: 80, grade: 4 } }, { calc: { total: 64, grade: 2 } }, { calc: { total: 49, grade: 0 } }] },
    { code: 'ค21101', name: 'คณิตศาสตร์', credits: 1, rows: [{ calc: { total: 70, grade: 3 } }, { calc: { total: 86, grade: 4 } }, { special: 'ร', calc: { total: 30, grade: 0 } }] },
  ],
};
const m = classModel(d);
assert.equal(m.subjects[0].avg, 64.33);
assert.deepEqual(m.students.map((s) => s.sumTotal), [150, 150, 79]);
assert.deepEqual(m.students.map((s) => s.rankTotal), [1, 1, 3]);           // เท่ากันได้อันดับเดียวกัน
assert.equal(m.students[0].gpa, 3.6);                                      // (4×1.5 + 3×1) ÷ 2.5
assert.equal(m.students[2].gpa, 0);                                        // ร ไม่นับ
assert.equal(m.students[0].code, 6801);
assert.equal(m.students[0].trait, 3);                                      // 3 กับ 1 มีอย่างละ 3 ครั้ง → ค่าสูงกว่า

// ใส่ลงแบบพิมพ์จริง
const F = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
assert.ok(F.wb.sheetNames.includes('ปพ.6'));
F.fill('ปพ.6', m, 1);
const v = (ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F.eng.value('ปพ.6', +mm[2], c); };
assert.equal(v('A2'), 'โรงเรียนบ้านทดสอบ สพป.ทดสอบ เขต 1');
assert.equal(v('A3'), 'ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569');
assert.equal(v('C5'), 'เด็กชายสอง ทดสอบ');
assert.equal(v('G10'), 86); assert.equal(v('H10'), 4);
assert.equal(v('D29'), 2.5); assert.equal(v('G29'), 150);
assert.equal(v('D36'), 'ผ่าน'); assert.equal(v('D37'), 'ไม่ผ่าน'); assert.equal(v('C37'), 'ชุมนุมดนตรี');
assert.equal(v('D39'), 'ดีเยี่ยม'); assert.equal(v('D40'), 'ดี'); assert.equal(v('D41'), 'ดี');
assert.equal(v('F34'), '10 ตุลาคม 2569');
// คนถัดไป: ค่าเดิมต้องถูกล้าง
F.fill('ปพ.6', m, 2);
assert.equal(v('H10'), 'ร'); assert.equal(v('C5'), 'เด็กชายสาม ทดสอบ');
// แบบพิมพ์ต้องไม่มีสูตรเหลืออยู่
for (const n of F.wb.sheetNames) for (const c of F.wb.sheet(n).cells.values()) assert.ok(!c.f, `${n} ยังมีสูตร`);
console.log('pp-forms: ผ่านทั้งหมด');

// ---------- ปพ.5 ในตัว เฟส 1 ----------
{
  const { pp5Set, PP5_PHASE1, citizenText, birthText } = await import('../js/pp-forms.js');
  assert.deepEqual(pp5Set(1).filter((n) => /^[ก-๙]+\.|^เวลา/.test(n)), ['พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'เวลา รวม 1']);
  assert.ok(pp5Set(2).includes('ธ.ค.') && pp5Set(2).includes('เวลา รวม 2') && !pp5Set(2).includes('พ.ค.'));
  assert.equal(citizenText('1648900175699'), '1 6489 00175 69 9');
  assert.equal(birthText('2013-06-14'), 'วันศุกร์ที่ 14 มิถุนายน 2556');
  const st5 = (n, att) => ({ no: n, s: { id: 'x' + n, prefix: 'เด็กชาย', first_name: 'ก' + n, last_name: 'ข', student_code: String(5700 + n), gender: 'ช' }, citizen: '1648900175699', birth: '2013-06-14',
    occ: ['รับจ้าง', 'ค้าขาย', 'ว่างงาน'], fam: { father: 'นายพ่อ ข', mother: 'นางแม่ ข', guardian: 'นางยาย ข', relation: 'ยาย' }, addrShort: '1 หมู่ 2 ต.ก',
    trait8: [3, 3, 3], rtw: [1, 1], values12: [], comp5: [2, 2], acts: [], att });
  const d5 = { ...d, room: 1, students: [st5(1, { '2026-05-18': 1, '2026-05-19': 'ข', '2026-05-20': 'ล', '2026-06-01': 1 }), st5(2, {})],
    counts: { start: { 'ช': 2, 'ญ': 0 }, left: { 'ช': 0, 'ญ': 0 }, joined: { 'ช': 0, 'ญ': 0 }, end: { 'ช': 2, 'ญ': 0 } } };
  d5.students.forEach((x) => { x.acts = [true]; });
  const m5 = classModel(d5);
  const F5 = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
  const val = (sh, ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F5.eng.value(sh, +mm[2], c); };
  for (const n of PP5_PHASE1) { assert.ok(F5.wb.sheetNames.includes(n), `แบบพิมพ์ไม่มีแผ่น ${n}`); assert.ok(F5.fill(n, m5), n); }
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AH10'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'BY13'), 2);
  assert.equal(val('ปก ปพ.5 รายชั้น', 'M18'), 'ภาษาไทย'); assert.equal(val('ปก ปพ.5 รายชั้น', 'BK18'), 1);   // ภาษาไทย เกรด 2 = 1 คน
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AX41'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'AB41'), 0);   // คุณลักษณะ 3 = ดีเยี่ยม
  assert.equal(val('ปก ปพ.5 รายชั้น', 'BN41'), 2); assert.equal(val('ปก ปพ.5 รายชั้น', 'CB41'), 0);   // อ่านคิดวิเคราะห์ 1 = ผ่าน
  assert.equal(val('ปก ปพ.5 รายชั้น', 'AQ45'), 2);                                                 // สมรรถนะ 2 = ดี
  assert.equal(val('ชื่อนักเรียน', 'C3'), 'เด็กชายก1 ข'); assert.equal(val('ชื่อนักเรียน', 'D3'), '1 6489 00175 69 9');
  assert.equal(val('บิดามารดา', 'C3'), 'นายพ่อ ข'); assert.equal(val('บิดามารดา', 'F3'), 'ค้าขาย');
  assert.equal(val('ผู้ปกครอง', 'D3'), 'ยาย'); assert.equal(val('ผู้ปกครอง', 'F3'), '1 หมู่ 2 ต.ก');
  assert.equal(val('พ.ค.', 'T4'), 1);                        // 18 พ.ค. = คอลัมน์ T
  assert.equal(val('พ.ค.', 'U4'), 'ข'); assert.equal(val('พ.ค.', 'AH4'), 1); assert.equal(val('พ.ค.', 'AI4'), '-'); assert.equal(val('พ.ค.', 'AJ4'), 1); assert.equal(val('พ.ค.', 'AK4'), 1);
  assert.equal(val('พ.ค.', 'M2'), 'พฤษภาคม'); assert.equal(val('พ.ค.', 'Y2'), 2569);
  assert.equal(val('เวลา รวม 1', 'C4'), 1); assert.equal(val('เวลา รวม 1', 'D4'), 1); assert.equal(val('เวลา รวม 1', 'E4'), '-');
  assert.equal(val('เวลา รวม 1', 'I4'), 4); assert.equal(val('เวลา รวม 1', 'J4'), 2); assert.equal(val('เวลา รวม 1', 'K4'), 50);
  assert.equal(val('เวลา รวม 1', 'K5'), null);               // ไม่มีบันทึกเวลาเรียนเลย
  { // แถวที่เขียนไว้ในไฟล์แต่ไม่มี ht (แผ่นที่ตั้ง zeroHeight) ต้องไม่ถูกซ่อน เช่น แถวหัวตารางสรุปผลสัมฤทธิ์ของปก
    const { Renderer } = await import('../js/xl-render.js');
    const pg = new Renderer(F5.wb, F5.eng, { dpi: 120 }).paginate('ปก ปพ.5 รายชั้น');
    assert.ok(pg.g.rh(17) > 0 && pg.g.rh(18) > 0, 'แถวหัวตาราง (17) ต้องมีความสูง');
    assert.equal(pg.g.rh(100), 0, 'แถวที่ไม่ได้เขียนไว้ยังซ่อนตามเดิม');
    // แบบพิมพ์ ปพ.5: ไม่มีสีพื้น (สีชมพูในไฟล์ = ช่องกรอก ไม่ใช่สีที่พิมพ์)
    F5.fill('พ.ค.', m5); const sh = F5.wb.sheet('พ.ค.'); const xfs = F5.wb.styles.cellXfs;
    assert.ok([...sh.cells.values()].every((c) => !c.s || !xfs[c.s]?.fillId), 'พ.ค. ต้องไม่มีสีพื้น');
  }
  F5.fill('พ.ค.', m5);                                       // กรอกซ้ำต้องล้างค่าเดิม
  assert.equal(val('พ.ค.', 'T4'), 1);
}

// ---------- ปพ.5 ในตัว เฟส 2: น้ำหนัก-ส่วนสูง / โภชนาการ ----------
{
  const { PP5_NUTRITION, pp5Set } = await import('../js/pp-forms.js');
  const { makeRef, WA, HA, WH } = await import('../js/assess.js');
  assert.equal(pp5Set(1).at(-1), 'สรุปโภชนาการ 4'); assert.ok(pp5Set(1).indexOf('เวลา รวม 1') < pp5Set(1).indexOf('น้ำหนัก-ส่วนสูง'));
  const nut = (weight, height, months, wa, ha, wh) => ({ date: '2026-05-18', months, weight, height, wa, ha, wh });
  const mk = (n, g, first, nuts) => ({ no: n, s: { id: 'n' + n, prefix: g === 'ช' ? 'เด็กชาย' : 'เด็กหญิง', first_name: first, last_name: 'ข', student_code: String(n), gender: g },
    citizen: null, birth: '2013-06-14', occ: [], fam: {}, trait8: [], rtw: [], values12: [], comp5: [], acts: [], att: {}, nut: nuts });
  const none = nut(null, null, 155, null, null, null);
  const sts = [
    mk(1, 'ช', 'อ้วนจัง', [nut(81, 168, 155, WA[0], HA[0], WH[0]), none, none, none]),
    mk(2, 'ญ', 'ปกติ', [nut(40, 150, 144, WA[2], HA[2], WH[3]), none, none, none]),
    mk(3, 'ช', 'ผอมจัง', [nut(30, 144, 150, WA[4], HA[3], WH[5]), none, none, none]),
    mk(4, 'ญ', 'ไม่มาชั่ง', [none, none, none, none]),
    mk(5, 'ช', 'สูงเกิน', [nut(98, 184, 155, WA[0], HA[0], 'เกินตารางอ้างอิง'), none, none, none]),
  ];
  const d6 = { ...d, subjects: [], room: 1, rounds: ['2026-05-18', null, null, null], students: sts, counts: { start: { 'ช': 3, 'ญ': 2 }, left: { 'ช': 0, 'ญ': 0 }, joined: { 'ช': 0, 'ญ': 0 }, end: { 'ช': 3, 'ญ': 2 } } };
  const m6 = classModel(d6);
  const F6 = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
  const v6 = (sh, ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F6.eng.value(sh, +mm[2], c); };
  for (const n of PP5_NUTRITION) { assert.ok(F6.wb.sheetNames.includes(n), `แบบพิมพ์ไม่มีแผ่น ${n}`); assert.ok(F6.fill(n, m6), n); }
  // น้ำหนัก-ส่วนสูง
  assert.equal(v6('น้ำหนัก-ส่วนสูง', 'C6'), '18/5/69'); assert.equal(v6('น้ำหนัก-ส่วนสูง', 'D6'), '18/5/69'); assert.equal(v6('น้ำหนัก-ส่วนสูง', 'E6'), null);
  assert.equal(v6('น้ำหนัก-ส่วนสูง', 'C7'), 81); assert.equal(v6('น้ำหนัก-ส่วนสูง', 'D7'), 168);
  assert.equal(v6('น้ำหนัก-ส่วนสูง', 'C52'), 62.25); assert.equal(v6('น้ำหนัก-ส่วนสูง', 'D52'), 161.5);   // เฉลี่ยเฉพาะคนที่มีค่า
  assert.equal(v6('น้ำหนัก-ส่วนสูง', 'E52'), null);
  // โภชนาการ 1
  assert.equal(v6('โภชนาการ 1', 'C8'), 'ชาย'); assert.equal(v6('โภชนาการ 1', 'D8'), 12); assert.equal(v6('โภชนาการ 1', 'E8'), 11); assert.equal(v6('โภชนาการ 1', 'I8'), WA[0]);
  assert.equal(v6('โภชนาการ 1', 'E9'), '-');              // 144 เดือน = 12 ปีเต็ม → เดือนแสดง -
  assert.equal(v6('โภชนาการ 1', 'K12'), 'เกินฐานข้อมูล'); assert.equal(v6('โภชนาการ 1', 'I11'), null);
  assert.equal(v6('โภชนาการ 1', 'J3'), 'วันจันทร์ที่ 18 พฤษภาคม 2569');
  // ความชุก 1: ชั่งแล้ว 4 คน (ช 3 ญ 1) ไม่ครบ 1 คน (ญ)
  assert.equal(v6('ความชุก 1', 'C7'), 2); assert.equal(v6('ความชุก 1', 'E7'), 2); assert.equal(v6('ความชุก 1', 'F7'), 50);
  assert.equal(v6('ความชุก 1', 'E11'), 1);                 // น้ำหนักน้อยกว่าเกณฑ์
  assert.equal(v6('ความชุก 1', 'C12'), 3); assert.equal(v6('ความชุก 1', 'D12'), 1); assert.equal(v6('ความชุก 1', 'E12'), 4); assert.equal(v6('ความชุก 1', 'G12'), 80);
  assert.equal(v6('ความชุก 1', 'E13'), 1); assert.equal(v6('ความชุก 1', 'G13'), 20); assert.equal(v6('ความชุก 1', 'E14'), 5); assert.equal(v6('ความชุก 1', 'G14'), 100);
  assert.equal(v6('ความชุก 1', 'E27'), 1); assert.equal(v6('ความชุก 1', 'E30'), 1); assert.equal(v6('ความชุก 1', 'E32'), 1);   // อ้วน · สมส่วน · ผอม
  assert.equal(v6('ความชุก 1', 'E33'), 1);                 // ส่วนสูงเกินฐานข้อมูล
  assert.equal(v6('ความชุก 1', 'E34'), 4);
  { const sh = F6.wb.sheet('ความชุก 1'); const st = F6.wb.styles;
    assert.ok([...sh.cells.values()].every((c) => !c.s || (st.fonts[st.cellXfs[c.s].fontId]?.color?.hex || '000000') === '000000'), 'ความชุก: ตัวอักษรต้องเป็นสีดำ'); }
  assert.equal(v6('ความชุก 2', 'E12'), 0);                 // ครั้งที่ 2 ไม่มีข้อมูลเลย
  // สรุปรายชื่อนักเรียนที่มีปัญหา
  assert.equal(v6('สรุปโภชนาการ 1', 'A8'), 'เด็กชายผอมจัง ข'); assert.equal(v6('สรุปโภชนาการ 1', 'C8'), 'เด็กชายอ้วนจัง ข'); assert.equal(v6('สรุปโภชนาการ 1', 'E8'), 'เด็กชายผอมจัง ข');
  assert.equal(v6('สรุปโภชนาการ 1', 'B8'), null);          // ค่อนข้างเตี้ย ไม่ใช่ "เตี้ย"
  assert.equal(v6('สรุปโภชนาการ 2', 'A8'), null);
}

// ---------- ปพ.5 ในตัว เฟส 3: แผ่นรายวิชา ----------
{
  const { pp5Set, SUBJECT_COMPACT_FROM } = await import('../js/pp-forms.js');
  assert.deepEqual(pp5Set(1, 3).slice(-3), ['วิชาที่ 1', 'วิชาที่ 2', 'วิชาที่ 3']); assert.ok(!pp5Set(1, 0).includes('วิชาที่ 1'));
  assert.equal(SUBJECT_COMPACT_FROM, 11);
  const stu3 = (n) => ({ no: n, s: { id: 's' + n, prefix: 'เด็กชาย', first_name: 'ก' + n, last_name: 'ข', student_code: String(n), gender: 'ช' }, citizen: null, birth: null, occ: [], fam: {}, trait8: [], rtw: [], values12: [], comp5: [], acts: [], att: {}, nut: [] });
  const row = (ind, scores, final, mid, tot, grade, special = null) => ({ ind, scores, final, special, calc: { mid, final: final ?? 0, total: tot, grade, indPass: ind.filter((x) => x === 'ผ').length, indFail: ind.filter((x) => x === 'มผ').length, indicator: ind.includes('มผ') ? 'มผ' : ind.length ? 'ผ' : null } });
  const subj = { code: 'ท21101', name: 'ภาษาไทย', credits: 1.5, mid: 70, fin: 30, indicators: ['ท 1.1 ม.1/1', 'ท 1.1 ม.1/2'], items: [{ title: 'ชิ้นที่ 1', max: 10 }, { title: 'ชิ้นที่ 2', max: 20 }],
    rows: [row(['ผ', 'ผ'], [8, 10], 20, 42, 62, 2), row(['ผ', 'มผ'], [6, null], null, 21, 21, 0), row([], [null, null], null, 0, 0, 0)] };
  const compact = { ...subj, code: 'ส21231', name: 'การป้องกันการทุจริต', indicators: [] };
  const d7 = { ...d, subjects: [subj, ...Array.from({ length: 9 }, () => subj), compact], room: 1, students: [stu3(1), stu3(2), stu3(3)], counts: {} };
  const m7 = classModel(d7);
  const F7 = await Forms.open(new Uint8Array(fs.readFileSync(new URL('../pp/forms.xlsx', import.meta.url))));
  const v7 = (sh, ref) => { const mm = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...mm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); return F7.eng.value(sh, +mm[2], c); };
  assert.ok(F7.fill('วิชาที่ 1', m7)); assert.ok(F7.fill('วิชาที่ 11', m7));
  const S1 = 'วิชาที่ 1';
  assert.equal(v7(S1, 'C2'), 'รายวิชา ท21101 ภาษาไทย'); assert.equal(v7(S1, 'C1'), 'ผลการประเมินมาตรฐาน/ตัวชี้วัด ชั้นมัธยมศึกษาปีที่ 1 ปีการศึกษา 2569');
  assert.equal(v7(S1, 'BZ1'), 'ผลสัมฤทธิ์ทางการเรียน ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569');
  assert.equal(v7(S1, 'CI3'), 70); assert.equal(v7(S1, 'CK3'), 30); assert.equal(v7(S1, 'AZ3'), 70); assert.equal(v7(S1, 'BT3'), 30);
  assert.equal(v7(S1, 'C5'), 'ท 1.1 ม.1/1'); assert.equal(v7(S1, 'D7'), 'ผ'); assert.equal(v7(S1, 'D8'), 'มผ');
  assert.equal(v7(S1, 'AM7'), 2); assert.equal(v7(S1, 'AN8'), 1); assert.equal(v7(S1, 'AO8'), 'มผ');
  assert.equal(v7(S1, 'BZ5'), 'ชิ้นที่ 1'); assert.equal(v7(S1, 'CA6'), 20); assert.equal(v7(S1, 'BZ7'), 8); assert.equal(v7(S1, 'AP7'), null);   // คะแนนอยู่ที่ BZ
  assert.equal(v7(S1, 'CL7'), 42); assert.equal(v7(S1, 'CM7'), 20); assert.equal(v7(S1, 'CN7'), 62); assert.equal(v7(S1, 'CO7'), 2);
  assert.equal(v7(S1, 'CM8'), null);                         // ไม่มีคะแนนสอบปลายภาค → ว่าง
  assert.equal(v7(S1, 'CL6'), 70); assert.equal(v7(S1, 'CM6'), 30); assert.equal(v7(S1, 'CN6'), 100);
  assert.equal(v7(S1, 'BZ52'), 14); assert.equal(v7(S1, 'BZ53'), 7); assert.equal(v7(S1, 'BZ54'), 70);   // รวม · เฉลี่ย · ร้อยละ ของคะแนนเต็ม 10
  assert.equal(v7(S1, 'CL52'), 63); assert.equal(v7(S1, 'CL53'), 21); assert.equal(v7(S1, 'CL54'), 30);  // เฉลี่ยรวมทุกคน (0 นับด้วย)
  assert.equal(v7(S1, 'CM53'), 20); assert.equal(v7(S1, 'CC52'), null);
  assert.equal(v7(S1, 'C52'), 2); assert.equal(v7(S1, 'D52'), 1); assert.equal(v7(S1, 'D53'), 1); assert.equal(v7(S1, 'D54'), 50);
  assert.equal(v7(S1, 'A52'), 'รวม/ผ่านตัวชี้วัด');
  const C11 = 'วิชาที่ 11';
  assert.equal(v7(C11, 'BZ2'), 'รายวิชา ส21231 การป้องกันการทุจริต'); assert.equal(v7(C11, 'BZ7'), 8); assert.equal(v7(C11, 'C5'), null); assert.equal(v7(C11, 'AM7'), null);
  // แบบเต็มพิมพ์ 5 หน้าตามตัวแบ่งหน้าเดิม · แบบย่อ 1 หน้า
  const { Renderer } = await import('../js/xl-render.js');
  const RR = new Renderer(F7.wb, F7.eng, { dpi: 100 });
  assert.equal(RR.paginate('วิชาที่ 1', { adj: { scale: 104 } }).pages.length, 5);
  assert.equal(RR.paginate('วิชาที่ 11').pages.length, 1);
}
