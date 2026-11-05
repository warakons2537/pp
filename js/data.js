import { sortByNumber, iso, fromIso } from './util.js?v=2569.11.1-35';

// ---------------------------------------------------------------------
//  นักเรียนอยู่ในห้องตามวันที่/ภาคเรียน — รองรับนักเรียนย้ายเข้า/ออกกลางปี
//  e = แถวทะเบียนห้อง (enrollments: status, entered_on, left_on) หรือนักเรียนจาก getRoster (enroll_status, entered_on, left_on)
//  entered_on ว่าง = อยู่ตั้งแต่ต้น · left_on = วันที่ออก (ยังนับว่าอยู่ในวันนั้น) · ย้ายออกแต่ไม่มีวันที่ = ไม่นับในมุมมองตามวัน/ภาค
// ---------------------------------------------------------------------
const statusOf = (e) => e.status ?? e.enroll_status;
const leftNoDate = (e) => statusOf(e) === 'left' && !e.left_on;
// อยู่ในห้องในวันที่ d (YYYY-MM-DD)
export const enrolledOn = (e, d) => !leftNoDate(e) && (!e.entered_on || e.entered_on <= d) && (!e.left_on || e.left_on >= d);
// อยู่ในห้องช่วงใดช่วงหนึ่งของ [from, to] (เช่น ทั้งเดือน)
export const enrolledDuring = (e, from, to) => !leftNoDate(e) && (!e.entered_on || e.entered_on <= to) && (!e.left_on || e.left_on >= from);
// อยู่ในรายชื่อ "สิ้นภาคเรียน" ของภาคนั้น (เข้าก่อนหรือในภาค และไม่ได้ออกก่อนสิ้นภาค) — ใช้กับรายชื่อใน ปพ.5
export function inTermList(e, term) {
  const { to } = termRange(term);
  return !leftNoDate(e) && (!e.entered_on || e.entered_on <= to) && (!e.left_on || e.left_on > to);
}
// เข้าระหว่างภาคเรียน (หลังวันเปิดภาค) / ออกระหว่างภาคเรียน — ใช้ติดป้ายในรายชื่อรายภาค
export const joinedDuringTerm = (e, term) => { const { from, to } = termRange(term); return !!e.entered_on && e.entered_on > from && e.entered_on <= to; };
export const leftDuringTerm = (e, term) => { const { from, to } = termRange(term); return !!e.left_on && e.left_on >= from && e.left_on <= to; };

// รายชื่อนักเรียนในห้อง (เรียงตามเลขที่)
//  ไม่ระบุตัวเลือก = คนที่ยังเรียนอยู่ (เหมือนเดิม) · includeLeft = รวมคนที่ย้ายออก
//  asOf = ผู้ที่อยู่ในวันที่นั้น · from+to = ผู้ที่อยู่ช่วงใดช่วงหนึ่งของช่วงนั้น · term = รายชื่อสิ้นภาคเรียนของภาคนั้น
export async function getRoster(db, classroomId, { includeLeft = false, asOf = null, from = null, to = null, term = null } = {}) {
  const ens = await db.select('enrollments', { eq: { classroom_id: classroomId } });
  const live = asOf ? ens.filter((e) => enrolledOn(e, asOf))
    : from && to ? ens.filter((e) => enrolledDuring(e, from, to))
      : term ? ens.filter((e) => inTermList(e, term))
        : includeLeft ? ens : ens.filter((e) => e.status !== 'left');
  if (!live.length) return [];
  const sts = await db.select('students', { in: { id: live.map((e) => e.student_id) } });
  const byId = Object.fromEntries(sts.map((s) => [s.id, s]));
  return live.filter((e) => byId[e.student_id])
    .map((e) => ({ ...byId[e.student_id], enrollment_id: e.id, number: e.number, enroll_status: e.status,
      entered_on: e.entered_on, left_on: e.left_on }))
    .sort(sortByNumber);
}

// รายชื่อตามภาคเรียน: ภาคเรียนของรายวิชา (course.term_id) / ภาคเรียนที่ระบุ (ไม่ระบุ = ภาคปัจจุบัน)
// นักเรียนที่ย้ายเข้ากลางปีไม่อยู่ในภาคก่อนหน้า · ใช้กับทุกหน้าที่ผูกกับภาคเรียน (คะแนน เวลาเรียนรายวิชา รายงาน)
export const termOfCourse = (ctx, course) => ctx.terms?.find((t) => t.id === course?.term_id) || ctx.term || null;
export const courseRoster = (ctx, course) => getRoster(ctx.db, course.classroom_id, { term: termOfCourse(ctx, course) });
export const termRoster = (ctx, room, term = ctx.term) => getRoster(ctx.db, room.id, { term: term || null });

// ช่วงวันที่ของภาคเรียน (ถ้าไม่ได้ตั้งไว้ ใช้ทั้งปีการศึกษาโดยประมาณ)
export function termRange(term) {
  if (!term) return { from: iso(new Date(new Date().getFullYear(), 0, 1)), to: iso(new Date()) };
  const y = term.academic_year - 543;
  return {
    from: term.start_date || (term.term === 1 ? `${y}-05-01` : `${y}-11-01`),
    to: term.end_date || (term.term === 1 ? `${y}-10-31` : `${y + 1}-04-30`),
  };
}

// เดือนของปีการศึกษา (พ.ค.–เม.ย.) ตั้งแต่เปิดภาคเรียนแรกจนถึงเดือนปัจจุบัน — ใช้เช็กชื่อย้อนหลัง · ไม่รวมเดือนในอนาคต
export function academicYearMonths(academicYear, today = new Date()) {
  const y0 = academicYear - 543; const out = [];
  for (let k = 0; k < 12; k++) { const m0 = (4 + k) % 12; const y = y0 + (4 + k >= 12 ? 1 : 0); if (y < today.getFullYear() || (y === today.getFullYear() && m0 <= today.getMonth())) out.push({ y, m0 }); }
  return out;
}

// รายการเดือนในภาคเรียน [{y, m0}]
export function termMonths(term) {
  const { from, to } = termRange(term);
  const out = []; const d = fromIso(from); d.setDate(1);
  const end = fromIso(to);
  while (d <= end) { out.push({ y: d.getFullYear(), m0: d.getMonth() }); d.setMonth(d.getMonth() + 1); }
  return out;
}

// ตารางอ้างอิงการเจริญเติบโตชุดที่โรงเรียนเลือก (เก็บไว้ในหน่วยความจำ ไม่ต้องโหลดซ้ำ)
const refCache = {};
export async function loadGrowthRef(db, set) {
  if (refCache[set]) return refCache[set];
  const { makeRef } = await import('./assess.js?v=2569.11.1-35');
  const ref = makeRef(await db.select('growth_reference', { eq: { ref_set: set } }));
  if (ref.size) refCache[set] = ref;            // ตารางว่างไม่เก็บ เผื่อผู้ดูแลระบบเพิ่งโหลดตาราง
  return ref;
}
export const clearGrowthRef = () => { for (const k of Object.keys(refCache)) delete refCache[k]; };

// วันเกิดของนักเรียน (อ่านได้เฉพาะครูประจำชั้น/ผู้ดูแลระบบ — คนอื่นได้ค่าว่าง)
export async function getBirthDates(db, ids) {
  if (!ids.length) return {};
  try {
    const rows = await db.select('student_private', { in: { student_id: ids } });
    return Object.fromEntries(rows.map((r) => [r.student_id, r.birth_date]));
  } catch { return {}; }
}
