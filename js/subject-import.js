// =====================================================================
//  นำเข้าไฟล์คะแนนเก็บหลายไฟล์ → สร้างรายวิชา + การเปิดสอน (ส่วนคำนวณ ไม่แตะหน้าจอ/ฐานข้อมูล)
//  หัวกระดาษไฟล์เดิม: C1 = ชั้น/ภาค/ปี · C2 = "วิชา ชื่อ (รหัส)" · D2 = ชื่อวิชาจริง (บางไฟล์ลอกหัวกระดาษมาแล้วพิมพ์ชื่อใหม่ไว้ข้าง ๆ)
// =====================================================================

const norm = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50)).replace(/\s+/g, ' ').trim();
const flat = (s) => norm(s).replace(/\s+/g, '');

// บรรทัด 1: "ชั้นมัธยมศึกษาปีที่ 2 ภาคเรียนที่ 1 ปีการศึกษา 2569" · "ม.2 เทอม 1" · "ป.4/2" · "... ห้อง 2"
export function parseLine1(t) {
  const s = norm(t);
  let level = null; let room = null;
  const long = s.match(/(อนุบาล|ประถมศึกษา|มัธยมศึกษา)\s*ปี\s*ที่\s*(\d)/);
  if (long) level = `${{ อนุบาล: 'อ', ประถมศึกษา: 'ป', มัธยมศึกษา: 'ม' }[long[1]]}.${long[2]}`;
  else {
    const short = s.match(/(?:^|[^ก-๙])(อ|ป|ม)\s*\.?\s*(\d)(?:\s*\/\s*(\d+))?/);
    if (short) { level = `${short[1]}.${short[2]}`; if (short[3]) room = Number(short[3]); }
  }
  const rm = s.match(/ห้อง\s*(?:ที่)?\s*(\d+)/); if (rm) room = Number(rm[1]);
  const tm = s.match(/(?:ภาคเรียนที่|ภาคเรียน|ภาคที่|ภาค|เทอม)\s*(\d)/);
  const ym = s.match(/(?:ปีการศึกษา|ปี)\s*(25\d\d)/);
  return { level, room, term: tm ? Number(tm[1]) : null, year: ym ? Number(ym[1]) : null };
}

const CODE = /([ก-ฮ]{1,2})\s?(\d{5})/;
const stripSubj = (s) => norm(s).replace(/^ว\s*ิ\s*[ชฃ]\s*า\s*/, '').replace(/\(\s*[ก-ฮ]{1,2}\s?\d{5}\s*\)/, '').replace(/\s+/g, ' ').trim();

// บรรทัด 2 → { code, name, alt } · alt = ชื่อในหัวกระดาษที่ไม่ได้ใช้ (กรณีมีชื่อจริงอยู่ช่องถัดไป)
export function parseLine2(c2, d2) {
  const a = norm(c2); const b = norm(d2);
  const cm = a.match(CODE) || b.match(CODE);
  const code = cm ? cm[1] + cm[2] : '';
  let name = stripSubj(a); let alt = '';
  if (b && flat(b) !== flat(a) && stripSubj(b)) { alt = name; name = stripSubj(b); }
  return { code, name, alt };
}

export const subjectKey = (name) => flat(stripSubj(name));

// ระดับชั้นจากรหัสวิชาตามหลักสูตรแกนกลาง: ตัวเลขหลักแรก 1 = ประถม 2 = ม.ต้น · หลักที่สอง = ปีที่ (ท22101 → ม.2)
export function codeLevel(code) {
  const m = flat(code).match(/^[ก-ฮ]{1,2}(\d)(\d)/);
  if (!m) return null;
  return m[1] === '1' && m[2] >= '1' && m[2] <= '6' ? `ป.${m[2]}` : m[1] === '2' && m[2] >= '1' && m[2] <= '3' ? `ม.${m[2]}` : null;
}

// วิชาเดิมในระบบ: ไฟล์มีรหัส → จับด้วยรหัสเท่านั้น (ไม่พบ = วิชาใหม่) · ไม่มีรหัส → ชื่อตรงและระดับชั้นตรง (หลายรหัส = ไม่จับคู่)
export function matchSubject(subjects, { code, name }, level) {
  if (code) { const s = subjects.find((x) => flat(x.code) === flat(code)); return s ? { subject: s, how: 'code' } : { subject: null, how: null, many: 0 }; }
  const k = subjectKey(name); if (!k || !level) return { subject: null, how: null, many: 0 };
  const c = subjects.filter((x) => subjectKey(x.name) === k && (x.level ? x.level === level : codeLevel(x.code) === level));
  return c.length === 1 ? { subject: c[0], how: 'name' } : { subject: null, how: null, many: c.length };
}

// ห้องปลายทาง: ชั้นตรง + ห้องตรง · ไม่ระบุห้องและชั้นนั้นมีห้องเดียว → ห้องนั้น
export function pickClassroom(classrooms, { level, room }) {
  if (!level) return null;
  const same = classrooms.filter((c) => c.level === level);
  if (room) return same.find((c) => Number(c.room) === room) || null;
  return same.length === 1 ? same[0] : null;
}

// ลายมือชื่อไฟล์: เนื้อหาเหมือนกันทุกช่อง = ไฟล์ซ้ำ
export const signature = (p) => JSON.stringify([flat(p.line2), p.midRatio, p.finalRatio, p.items.map((i) => [i.title, i.max]),
  p.students.map((s) => [flat(s.name), s.scores, s.final, s.special])]);

/**
 * แถวเริ่มต้นของตารางตรวจ
 * @param files [{ fileName, parsed, d2 }]  (parsed จาก parseAchievement)
 * @param ctx { subjects, classrooms, term }
 */
export function buildRows(files, { subjects, classrooms, term }) {
  const rows = [];
  for (const f of files) {
    const h1 = parseLine1(f.parsed.line1);
    const h2 = parseLine2(f.parsed.line2, f.d2);
    const room = pickClassroom(classrooms, h1);
    const m = matchSubject(subjects, h2, h1.level || room?.level);
    const warnings = [...f.parsed.warnings];
    if (h2.alt) warnings.push(`หัวกระดาษมี 2 ชื่อ: "${h2.alt}" และ "${h2.name}" (ใช้ "${h2.name}")`);
    if (!h1.level) warnings.push('อ่านระดับชั้นจากหัวกระดาษไม่ได้ — เลือกห้องเอง');
    else if (!room) warnings.push(`ไม่พบห้อง ${h1.level}${h1.room ? `/${h1.room}` : ''} ในปีการศึกษานี้${classrooms.some((c) => c.level === h1.level) ? ' — เลือกห้องเอง' : ' — สร้างห้องที่แท็บห้องเรียนก่อน'}`);
    if (term && ((h1.year && h1.year !== term.academic_year) || (h1.term && h1.term !== term.term))) {
      warnings.push(`ไฟล์ระบุภาคเรียนที่ ${h1.term ?? '-'}/${h1.year ?? '-'} แต่จะนำเข้าภาคเรียนปัจจุบัน ${term.term}/${term.academic_year}`);
    }
    if (!m.subject && m.many > 1) warnings.push(`มีวิชาชื่อ "${h2.name}" หลายรหัสในระบบ — ใส่รหัสเอง`);
    rows.push({
      fileName: f.fileName, parsed: f.parsed, sig: signature(f.parsed), level: h1.level,
      code: m.subject ? m.subject.code : h2.code, name: m.subject ? m.subject.name : h2.name,
      fileCode: h2.code, matchedBy: m.how, classroomId: room?.id ?? '', warnings, action: null,
    });
  }
  return rows;
}

// สถานะแถว (คำนวณใหม่ทุกครั้งที่แก้รหัส/ห้อง): ใหม่ · มีในระบบแล้ว · ซ้ำกับไฟล์อื่นในชุด
export function rowStatus(rows, i, { subjects, courses }) {
  const r = rows[i];
  const code = flat(r.code);
  const subject = code ? subjects.find((s) => flat(s.code) === code) || null : null;
  const course = subject && r.classroomId ? courses.find((k) => k.subject_id === subject.id && k.classroom_id === r.classroomId) || null : null;
  let dupOf = -1;
  for (let j = 0; j < i; j++) {
    const o = rows[j];
    if (o.sig === r.sig || (code && flat(o.code) === code && o.classroomId && o.classroomId === r.classroomId)) { dupOf = j; break; }
  }
  const missing = [!code && 'รหัสวิชา', !norm(r.name) && 'ชื่อวิชา', !r.classroomId && 'ห้อง'].filter(Boolean);
  return { subject, course, dupOf, missing, kind: dupOf >= 0 ? 'dup' : course ? 'exists' : 'new' };
}

// ค่าเริ่มต้นของการทำงาน: ใหม่ = นำเข้า · ซ้ำ/มีแล้ว = ข้าม (ให้ผู้ใช้เลือกแทนคะแนนเองทีละไฟล์)
export const defaultAction = (st) => (st.kind === 'new' ? 'import' : 'skip');

// สัดส่วนที่ใช้สร้างการเปิดสอน: ตามไฟล์ถ้ารวมได้ 100 ไม่เช่นนั้นใช้ค่ากลาง 70:30
export const courseRatio = (p) => (p.midRatio + p.finalRatio === 100 ? [p.midRatio, p.finalRatio] : [70, 30]);
