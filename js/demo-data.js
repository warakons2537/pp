// ข้อมูลตัวอย่างสำหรับโหมดทดลอง (ชื่อทั้งหมดสมมติ)
import { EXCEL_AGE, EXCEL_HT } from './data/growth-excel.js?v=2569.10.27-5';
import { excelRefToRows } from './assess.js?v=2569.10.27-5';
export function seedDemo() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const id = (p, n) => `${p}-${String(n).padStart(4, '0')}`;

  const profiles = [
    { id: 'u-admin', full_name: 'ครูวิชาการ ตัวอย่าง', email: 'admin@demo', role: 'admin' },
    { id: 'u-home1', full_name: 'ครูประจำชั้น ม.1/1', email: 'home1@demo', role: 'teacher' },
    { id: 'u-eng', full_name: 'ครูภาษาอังกฤษ', email: 'eng@demo', role: 'teacher' },
    { id: 'u-math', full_name: 'ครูคณิตศาสตร์', email: 'math@demo', role: 'teacher' },
    { id: 'u-new', full_name: 'ครูใหม่ (รออนุมัติ)', email: 'new@demo', role: 'pending' },
  ];
  const terms = [
    { id: 'term-1', academic_year: 2569, term: 1, start_date: '2026-05-16', end_date: '2026-10-09', is_current: true },
    { id: 'term-2', academic_year: 2569, term: 2, start_date: '2026-11-01', end_date: '2027-03-31', is_current: false },
  ];
  const classrooms = [
    { id: 'c-m11', academic_year: 2569, level: 'ม.1', room: 1 },
    { id: 'c-m21', academic_year: 2569, level: 'ม.2', room: 1 },
    { id: 'c-p61', academic_year: 2569, level: 'ป.6', room: 1 },
  ];
  const classroom_teachers = [{ classroom_id: 'c-m11', teacher_id: 'u-home1' }];

  const boys = ['กิตติพัฒน์', 'ธนกร', 'ภูริภัทร', 'ณัฐวุฒิ', 'ปกรณ์', 'วรเมธ', 'ศุภกร', 'อชิตะ', 'ชยพล', 'ธีรเดช'];
  const girls = ['กมลชนก', 'ชนิดา', 'ณัฐธิดา', 'ปภาวรินทร์', 'พิมพ์ชนก', 'วรรณิดา', 'ศิริกานต์', 'อรุณี', 'ขวัญข้าว', 'ธัญชนก'];
  const lasts = ['ใจดี', 'มีสุข', 'รักเรียน', 'ทองคำ', 'แสงทอง', 'บุญมา', 'ศรีสุข', 'พูลผล', 'สายบัว', 'นาคสวัสดิ์'];

  const students = []; const enrollments = []; const student_private = [];
  let n = 0;
  const addRoom = (cid, nb, ng, codeBase) => {
    let num = 0;
    const mk = (first, g) => {
      n++; num++;
      const sid = id('s', n);
      students.push({ id: sid, student_code: String(codeBase + num), prefix: g === 'ช' ? 'เด็กชาย' : 'เด็กหญิง',
        first_name: first, last_name: lasts[(n * 3) % lasts.length], gender: g, status: 'active' });
      enrollments.push({ id: id('e', n), student_id: sid, classroom_id: cid, number: num, status: 'active' });
      student_private.push({ student_id: sid, birth_date: `2013-0${1 + (n % 9)}-1${n % 9}`, religion: 'พุทธ', nationality: 'ไทย', ethnicity: 'ไทย' });
    };
    boys.slice(0, nb).forEach((b) => mk(b, 'ช'));
    girls.slice(0, ng).forEach((g) => mk(g, 'ญ'));
  };
  addRoom('c-m11', 6, 6, 6800);
  addRoom('c-m21', 4, 4, 6700);

  const subjects = [
    { id: 'sub-th', code: 'ท21101', name: 'ภาษาไทย', subject_group: 'ภาษาไทย', subject_type: 'พื้นฐาน', credits: 1.5, level: 'ม.1' },
    { id: 'sub-ma', code: 'ค21101', name: 'คณิตศาสตร์', subject_group: 'คณิตศาสตร์', subject_type: 'พื้นฐาน', credits: 1.5, level: 'ม.1' },
    { id: 'sub-en', code: 'อ21101', name: 'ภาษาอังกฤษ', subject_group: 'ภาษาต่างประเทศ', subject_type: 'พื้นฐาน', credits: 1.5, level: 'ม.1' },
  ];
  const courses = [
    { id: 'k-th', subject_id: 'sub-th', classroom_id: 'c-m11', term_id: 'term-1', midterm_ratio: 70, final_ratio: 30, sort_order: 1 },
    { id: 'k-ma', subject_id: 'sub-ma', classroom_id: 'c-m11', term_id: 'term-1', midterm_ratio: 70, final_ratio: 30, sort_order: 2 },
    { id: 'k-en', subject_id: 'sub-en', classroom_id: 'c-m11', term_id: 'term-1', midterm_ratio: 70, final_ratio: 30, sort_order: 3 },
  ];
  const course_teachers = [
    { course_id: 'k-th', teacher_id: 'u-home1' },
    { course_id: 'k-ma', teacher_id: 'u-math' },
    { course_id: 'k-en', teacher_id: 'u-eng' },
  ];

  // เช็กชื่อรายวัน: ก.ย. – 9 ต.ค. 2569 (วันจันทร์–ศุกร์)
  const daily_attendance = []; const period_attendance = [];
  let a = 0;
  const pick = (weak) => {
    const r = rnd();
    if (weak) return r < 0.62 ? 'present' : r < 0.7 ? 'late' : r < 0.8 ? 'sick' : r < 0.86 ? 'leave' : 'absent';
    return r < 0.9 ? 'present' : r < 0.94 ? 'late' : r < 0.97 ? 'sick' : r < 0.99 ? 'leave' : 'absent';
  };
  const m11 = enrollments.filter((e) => e.classroom_id === 'c-m11');
  for (let d = new Date(2026, 8, 1); d <= new Date(2026, 9, 9); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const e of m11) {
      daily_attendance.push({ id: id('da', ++a), student_id: e.student_id, classroom_id: 'c-m11', date: ds,
        status: pick(e.number === 4), recorded_by: 'u-home1', updated_at: new Date().toISOString() });
    }
    if ([1, 3].includes(d.getDay())) {              // ภาษาอังกฤษ จันทร์/พุธ คาบ 2
      for (const e of m11) {
        period_attendance.push({ id: id('pa', ++a), course_id: 'k-en', student_id: e.student_id, date: ds, period: 2,
          status: pick(e.number === 4 || e.number === 9), recorded_by: 'u-eng', updated_at: new Date().toISOString() });
      }
    }
  }

  // คะแนนตัวอย่าง (ภาษาอังกฤษ ภาษาไทย ครบ · คณิตศาสตร์ยังกรอกไม่ครบ)
  const assessment_items = []; const item_scores = []; const course_results = [];
  const addItems = (cid, list) => list.map(([kind, title, max, code], i) => {
    const it = { id: `it-${cid}-${i}`, course_id: cid, kind, title, code: code ?? null, max_score: max, sort_order: i + 1 };
    assessment_items.push(it); return it;
  });
  const plans = {
    'k-en': [['score', 'งาน 1', 10], ['score', 'งาน 2', 10], ['score', 'สอบย่อย', 10], ['score', 'กลางภาค', 20], ['score', 'โครงงาน', 20], ['final', 'สอบปลายภาค', 30],
      ['indicator', 'ฟัง-พูด', null, 'ต 1.1 ม.1/1'], ['indicator', 'อ่าน', null, 'ต 1.1 ม.1/2'], ['indicator', 'เขียน', null, 'ต 1.2 ม.1/1'], ['indicator', 'วัฒนธรรม', null, 'ต 2.1 ม.1/1']],
    'k-th': [['score', 'การอ่านคำ', 5], ['score', 'อ่านออกเสียง', 5], ['score', 'เรียงความ', 10], ['score', 'กลางภาค', 20], ['score', 'ย่อความ', 10], ['final', 'สอบปลายภาค', 30]],
    'k-ma': [['score', 'แบบฝึก 1', 10], ['score', 'แบบฝึก 2', 10], ['score', 'กลางภาค', 20], ['final', 'สอบปลายภาค', 30]],
  };
  for (const [cid, plan] of Object.entries(plans)) {
    const its = addItems(cid, plan);
    for (const e of m11) {
      const skill = e.number === 4 ? 0.35 : e.number === 9 ? 0.5 : 0.55 + rnd() * 0.42;
      for (const it of its) {
        if (it.kind === 'indicator') { item_scores.push({ item_id: it.id, student_id: e.student_id, passed: skill > 0.4 }); continue; }
        if (cid === 'k-ma' && (it.kind === 'final' || (it.title === 'กลางภาค' && e.number > 8))) continue;   // ยังไม่ครบ
        const v = Math.min(it.max_score, Math.max(0, Math.round(it.max_score * (skill + (rnd() - 0.5) * 0.25))));
        item_scores.push({ item_id: it.id, student_id: e.student_id, score: v });
      }
    }
  }
  course_results.push({ course_id: 'k-th', student_id: m11.find((e) => e.number === 6).student_id, special: 'ร', ms_waived: false });

  // น้ำหนัก-ส่วนสูง 2 ครั้ง · คุณลักษณะฯ · กิจกรรม
  const health_measurements = []; const trait_scores = []; const activity_results = []; const homeroom_comments = [];
  const body = { 1: [44, 152], 2: [38, 149], 3: [62, 156], 4: [31, 141], 5: [47, 160], 6: [58, 172], 7: [41, 150], 8: [36, 155], 9: [49, 147], 10: [43, 153], 11: [57, 171], 12: [33, 150] };
  m11.forEach((e) => {
    const [w, h] = body[e.number];
    health_measurements.push({ id: `hm-${e.number}-1`, student_id: e.student_id, academic_year: 2569, round: 1, measured_on: '2026-05-18', weight_kg: w, height_cm: h });
    health_measurements.push({ id: `hm-${e.number}-2`, student_id: e.student_id, academic_year: 2569, round: 2, measured_on: '2026-08-17', weight_kg: Math.round((w + 0.5 + rnd() * 1.5) * 10) / 10, height_cm: h + 1 + Math.round(rnd() * 2) });
    for (let i = 1; i <= 8; i++) trait_scores.push({ term_id: 'term-1', student_id: e.student_id, kind: 'trait8', item_no: i, score: e.number === 4 ? (i % 3 === 0 ? 2 : 1) : rnd() < 0.6 ? 3 : 2 });
    for (let i = 1; i <= 5; i++) trait_scores.push({ term_id: 'term-1', student_id: e.student_id, kind: 'rtw', item_no: i, score: e.number === 4 ? 1 : rnd() < 0.45 ? 3 : 2 });
    ['guidance', 'scout', 'social'].forEach((a) => activity_results.push({ term_id: 'term-1', student_id: e.student_id, activity: a, passed: true, club_name: null }));
    activity_results.push({ term_id: 'term-1', student_id: e.student_id, activity: 'club', passed: true, club_name: e.number % 2 ? 'ชุมนุมคอมพิวเตอร์' : 'ชุมนุมดนตรีไทย' });
  });
  homeroom_comments.push({ term_id: 'term-1', student_id: m11[0].student_id, comment: 'ตั้งใจเรียน มีความรับผิดชอบ ช่วยเหลือเพื่อนในห้อง' });

  // นักเรียนเข้า/ออกระหว่างภาค (สำหรับปก ปพ.5) และชื่อบิดามารดา (สำหรับใบรับรอง)
  students.push({ id: 's-join', student_code: '6813', prefix: 'เด็กชาย', first_name: 'ภัทรพล', last_name: 'มาใหม่', gender: 'ช', status: 'active' });
  enrollments.push({ id: 'e-join', student_id: 's-join', classroom_id: 'c-m11', number: 13, status: 'active', entered_on: '2026-06-15' });
  student_private.push({ student_id: 's-join', birth_date: '2013-04-02', religion: 'พุทธ', nationality: 'ไทย' });
  students.push({ id: 's-left', student_code: '6814', prefix: 'เด็กหญิง', first_name: 'สุดารัตน์', last_name: 'ย้ายไป', gender: 'ญ', status: 'moved' });
  enrollments.push({ id: 'e-left', student_id: 's-left', classroom_id: 'c-m11', number: 14, status: 'left', left_on: '2026-07-01' });
  student_private.forEach((p, i) => {
    p.citizen_id = `1${String(1000000000000 + i * 7919).slice(1)}`;
    p.father = { prefix: 'นาย', first_name: ['สมศักดิ์', 'ประเสริฐ', 'วิชัย', 'สมชาย'][i % 4], last_name: students.find((x) => x.id === p.student_id)?.last_name };
    p.mother = { prefix: 'นาง', first_name: ['สมใจ', 'มาลี', 'บุษบา', 'วันดี'][i % 4], last_name: students.find((x) => x.id === p.student_id)?.last_name };
  });

  return {
    health_measurements, trait_scores, activity_results, homeroom_comments, growth_reference: excelRefToRows(EXCEL_AGE, EXCEL_HT),
    assessment_items, item_scores, course_results,
    profiles, terms, classrooms, classroom_teachers, students, student_private, enrollments,
    subjects, courses, course_teachers, daily_attendance, period_attendance, behavior_notes: [],
    school_settings: [{ id: 1, school_name: 'ตัวอย่างวิทยา', score_rounding: 'floor', growth_ref_set: 'excel', school_code: '00000000',
      affiliation: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', area_office: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาตัวอย่าง เขต 1',
      subdistrict: 'ตัวอย่าง', district: 'ตัวอย่าง', province: 'ตัวอย่าง', director_name: 'นายผู้อำนวยการ ตัวอย่าง',
      director_title: 'ผู้อำนวยการโรงเรียน', registrar_name: 'นางสาวนายทะเบียน ตัวอย่าง', academic_head_name: 'นางหัวหน้าวิชาการ ตัวอย่าง' }],
  };
}
