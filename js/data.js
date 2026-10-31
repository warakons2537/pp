import { sortByNumber, iso, fromIso } from './util.js?v=2569.10.31-12';

// รายชื่อนักเรียนในห้อง (เรียงตามเลขที่)
export async function getRoster(db, classroomId, { includeLeft = false } = {}) {
  const ens = await db.select('enrollments', { eq: { classroom_id: classroomId } });
  const live = includeLeft ? ens : ens.filter((e) => e.status !== 'left');
  if (!live.length) return [];
  const sts = await db.select('students', { in: { id: live.map((e) => e.student_id) } });
  const byId = Object.fromEntries(sts.map((s) => [s.id, s]));
  return live.filter((e) => byId[e.student_id])
    .map((e) => ({ ...byId[e.student_id], enrollment_id: e.id, number: e.number, enroll_status: e.status,
      entered_on: e.entered_on, left_on: e.left_on }))
    .sort(sortByNumber);
}

// ช่วงวันที่ของภาคเรียน (ถ้าไม่ได้ตั้งไว้ ใช้ทั้งปีการศึกษาโดยประมาณ)
export function termRange(term) {
  if (!term) return { from: iso(new Date(new Date().getFullYear(), 0, 1)), to: iso(new Date()) };
  const y = term.academic_year - 543;
  return {
    from: term.start_date || (term.term === 1 ? `${y}-05-01` : `${y}-11-01`),
    to: term.end_date || (term.term === 1 ? `${y}-10-31` : `${y + 1}-04-30`),
  };
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
  const { makeRef } = await import('./assess.js?v=2569.10.31-12');
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
