// =====================================================================
//  เครื่องคำนวณผลการเรียน (ปพ.5) — ถอดกติกาจากไฟล์ Excel เดิม (ดู docs/DESIGN.md ข้อ 3)
//  ไฟล์นี้ไม่แตะฐานข้อมูล จึงทดสอบเทียบกับผลใน Excel ได้ตรง ๆ
// =====================================================================

export const ROUNDING = {
  floor: { label: 'ปัดทิ้ง (เหมือน Excel เดิม)', fn: (x) => Math.floor(x + 1e-9) },
  round: { label: 'ปัดครึ่งขึ้น (.5 ขึ้นไปปัดขึ้น)', fn: (x) => Math.floor(x + 0.5 + 1e-9) },
  none: { label: 'ไม่ปัด (ทศนิยม 2 ตำแหน่ง)', fn: (x) => Math.round(x * 100) / 100 },
};

// เกณฑ์ระดับผลการเรียน 8 ระดับ
export const GRADE_STEPS = [[80, 4], [75, 3.5], [70, 3], [65, 2.5], [60, 2], [55, 1.5], [50, 1], [0, 0]];
export const toGrade = (total) => GRADE_STEPS.find(([min]) => total >= min)[1];
export const GRADE_LABELS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0', 'ร', 'มส'];
export const fmtGrade = (g) => (g === null || g === undefined ? '' : typeof g === 'number' ? (Number.isInteger(g) ? String(g) : g.toFixed(1)) : g);

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * คำนวณผลรายวิชาของนักเรียน 1 คน
 * @param items   assessment_items ของวิชา (kind: indicator | score | final)
 * @param scoreOf (itemId) => { score, passed } | undefined
 * @param opts    { midRatio, finalRatio, rounding, special ('ร'|'มส'|null), below80, msWaived }
 */
export function computeStudent(items, scoreOf, opts) {
  const { midRatio = 70, finalRatio = 30, rounding = 'floor', special = null, below80 = false, msWaived = false } = opts;
  const R = (ROUNDING[rounding] || ROUNDING.floor).fn;
  const scoreItems = items.filter((i) => i.kind === 'score');
  const finalItems = items.filter((i) => i.kind === 'final');
  const indItems = items.filter((i) => i.kind === 'indicator');

  let rawSum = 0; let rawMax = 0; let anyScore = false; let missing = 0;
  for (const it of scoreItems) {
    rawMax += num(it.max_score) || 0;
    const v = num(scoreOf(it.id)?.score);
    if (v !== null) { rawSum += v; anyScore = true; } else missing++;
  }
  // Excel: ROUNDDOWN( SUM(คะแนน) / (SUM(คะแนนเต็ม) / 70), 0 )
  const mid = rawMax > 0 ? R(rawSum / (rawMax / midRatio)) : null;

  let finSum = 0; let finMax = 0; let anyFinal = false;
  for (const it of finalItems) {
    finMax += num(it.max_score) || 0;
    const v = num(scoreOf(it.id)?.score);
    if (v !== null) { finSum += v; anyFinal = true; } else missing++;
  }
  // ถ้าคะแนนเต็มสอบปลายภาค = สัดส่วนปลายภาค ใช้ตามจริง (เหมือน Excel) ไม่เช่นนั้นแปลงสัดส่วน
  const final = !finalItems.length ? null
    : Math.abs(finMax - finalRatio) < 1e-9 ? finSum : (finMax > 0 ? R(finSum * finalRatio / finMax) : null);

  const hasData = anyScore || anyFinal;
  const total = hasData ? Math.round(((mid ?? 0) + (final ?? 0)) * 100) / 100 : null;
  const scoreGrade = total === null ? null : toGrade(total);

  let grade = scoreGrade;
  let reason = null;
  if (special === 'ร') { grade = 'ร'; reason = 'ครูกำหนด ร'; }
  else if (special === 'มส') { grade = 'มส'; reason = 'ครูกำหนด มส'; }
  else if (below80 && !msWaived) { grade = 'มส'; reason = 'เวลาเรียนต่ำกว่าร้อยละ 80'; }

  // ตัวชี้วัด: มี มผ อย่างน้อย 1 ตัว = มผ, ผ่านอย่างน้อย 1 ตัวและไม่มี มผ = ผ
  let indPass = 0; let indFail = 0;
  for (const it of indItems) {
    const p = scoreOf(it.id)?.passed;
    if (p === true) indPass++; else if (p === false) indFail++;
  }
  const indicator = !indItems.length || indPass + indFail === 0 ? null : indFail > 0 ? 'มผ' : 'ผ';

  // ช่องว่างนับเป็น 0 เหมือน Excel แต่แจ้งว่ายังไม่ครบ เพื่อไม่ให้เกรดที่ยังไม่สมบูรณ์ถูกส่งโดยไม่ตั้งใจ
  const incomplete = hasData && missing > 0 && typeof grade === 'number';
  return { rawSum, rawMax, mid, final, total, scoreGrade, grade, reason, indPass, indFail, indicator, hasData, missing, incomplete };
}

// น้ำหนักวิชา: หน่วยกิต (มัธยม) หรือ ชั่วโมง/ปี ÷ 40 (ประถม)
export const weightOf = (subject) =>
  num(subject?.credits) ?? (num(subject?.hours_per_year) ? num(subject.hours_per_year) / 40 : 1);

/**
 * ผลการเรียนเฉลี่ย: Σ(เกรด × น้ำหนัก) ÷ Σน้ำหนัก ไม่นับ ร / มส / วิชาที่ยังไม่มีเกรด
 * ปัดทิ้งเหลือทศนิยม 2 ตำแหน่ง (เหมือน Excel: ROUNDDOWN(x, 2))
 */
export function gpa(entries) {
  let s = 0; let w = 0;
  for (const { grade, weight } of entries) {
    if (typeof grade !== 'number') continue;
    s += grade * weight; w += weight;
  }
  if (!w) return null;
  return Math.floor((s / w) * 100 + 1e-7) / 100;
}

// อันดับแบบ RANK ของ Excel (คะแนนเท่ากันได้อันดับเดียวกัน)
export function rank(values) {
  return values.map((v) => (v === null || v === undefined ? null : 1 + values.filter((x) => x !== null && x !== undefined && x > v).length));
}

// นับการกระจายเกรด
export function distribution(grades) {
  const d = Object.fromEntries(GRADE_LABELS.map((g) => [g, 0]));
  for (const g of grades) { const k = fmtGrade(g); if (k in d) d[k]++; }
  return d;
}

// ---------------------------------------------------------------------
//  โหลดข้อมูลของวิชาจากฐานข้อมูล แล้วคำนวณทั้งห้อง
// ---------------------------------------------------------------------
export async function loadCourse(db, course) {
  const items = (await db.select('assessment_items', { eq: { course_id: course.id } }))
    .sort((a, b) => a.sort_order - b.sort_order || String(a.title).localeCompare(String(b.title), 'th'));
  const [scores, results, att] = await Promise.all([
    items.length ? db.select('item_scores', { in: { item_id: items.map((i) => i.id) } }) : [],
    db.select('course_results', { eq: { course_id: course.id } }),
    db.rpc('course_attendance_summary', { crs: course.id }),
  ]);
  const scoreMap = new Map(scores.map((s) => [`${s.item_id}|${s.student_id}`, s]));
  return { items, scoreMap, results: Object.fromEntries(results.map((r) => [r.student_id, r])),
    att: Object.fromEntries(att.map((a) => [a.student_id, a])) };
}

export function computeCourse(course, data, roster, rounding) {
  const out = {};
  for (const s of roster) {
    const res = data.results[s.id] || {};
    out[s.id] = computeStudent(data.items, (itemId) => data.scoreMap.get(`${itemId}|${s.id}`), {
      midRatio: course.midterm_ratio, finalRatio: course.final_ratio, rounding,
      special: res.special || null, msWaived: !!res.ms_waived, below80: !!data.att[s.id]?.below_80,
    });
    out[s.id].attPct = data.att[s.id]?.pct ?? null;
    out[s.id].attTotal = data.att[s.id]?.total_periods ?? 0;
  }
  return out;
}
