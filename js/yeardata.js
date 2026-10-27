// =====================================================================
//  รวบรวมข้อมูลทั้งปีการศึกษาของห้องหนึ่ง สำหรับพิมพ์ ปพ.6 / ปก ปพ.5 / ใบรับรอง
// =====================================================================
import { indexBy, sortByNumber, fullName } from './util.js?v=2569.10.27-4';
import { termRange, loadGrowthRef } from './data.js?v=2569.10.27-4';
import { loadCourse, computeCourse, gpa, rank, weightOf } from './grading.js?v=2569.10.27-4';
import { classify, ageMonths, TRAIT_KINDS, modeSummary } from './assess.js?v=2569.10.27-4';

// จำนวนนักเรียน ต้นภาค / ออกระหว่างภาค / เข้าระหว่างภาค / สิ้นภาค แยกชาย-หญิง
export function enrollmentCounts(rows, term) {
  const { from, to } = termRange(term);
  const out = { start: { ช: 0, ญ: 0 }, left: { ช: 0, ญ: 0 }, joined: { ช: 0, ญ: 0 }, end: { ช: 0, ญ: 0 } };
  for (const r of rows) {
    const g = r.gender === 'ช' ? 'ช' : 'ญ';
    const joinedDuring = r.entered_on && r.entered_on > from && r.entered_on <= to;
    const leftBefore = r.left_on && r.left_on < from;
    const leftDuring = r.left_on && r.left_on >= from && r.left_on <= to;
    const notYet = r.entered_on && r.entered_on > to;
    if (leftBefore || notYet) continue;
    if (joinedDuring) out.joined[g]++; else out.start[g]++;
    if (leftDuring) out.left[g]++;
  }
  for (const g of ['ช', 'ญ']) out.end[g] = out.start[g] + out.joined[g] - out.left[g];
  return out;
}

export async function loadRoomYear(ctx, room, { withHealth = true } = {}) {
  const { db } = ctx;
  const year = room.academic_year;
  const terms = ctx.terms.filter((t) => t.academic_year === year).sort((a, b) => a.term - b.term);

  // นักเรียน (รวมคนที่ย้ายออก เพื่อนับจำนวน)
  const ens = await db.select('enrollments', { eq: { classroom_id: room.id } });
  const sts = ens.length ? await db.select('students', { in: { id: ens.map((e) => e.student_id) } }) : [];
  const stById = indexBy(sts);
  const all = ens.filter((e) => stById[e.student_id]).map((e) => ({ ...stById[e.student_id], number: e.number,
    enroll_status: e.status, entered_on: e.entered_on, left_on: e.left_on })).sort(sortByNumber);
  const roster = all.filter((s) => s.enroll_status !== 'left');
  const ids = roster.map((s) => s.id);

  let priv = {};
  try { priv = indexBy(ids.length ? await db.select('student_private', { in: { student_id: ids } }) : [], 'student_id'); } catch { priv = {}; }

  // รายวิชาและผลการเรียนแต่ละภาค
  const rounding = ctx.settings.score_rounding || 'floor';
  const perTerm = {};
  for (const t of terms) {
    const courses = (await db.select('courses', { eq: { classroom_id: room.id, term_id: t.id } }))
      .map((k) => ({ ...k, subject: ctx.subjectById[k.subject_id], classroom: room }))
      .sort((a, b) => a.sort_order - b.sort_order || String(a.subject?.code).localeCompare(String(b.subject?.code)));
    const cts = await db.select('course_teachers', { in: { course_id: courses.map((k) => k.id) } });
    courses.forEach((k) => { k.teachers = cts.filter((x) => x.course_id === k.id).map((x) => ctx.profileById[x.teacher_id]).filter(Boolean); });
    const results = [];
    for (const k of courses) {
      const data = await loadCourse(db, k);
      results.push({ course: k, data, res: computeCourse(k, data, roster, rounding) });
    }
    const range = termRange(t);
    const [att, traits, acts, comments] = await Promise.all([
      db.rpc('daily_attendance_summary', { cid: room.id, d_from: range.from, d_to: range.to }),
      ids.length ? db.select('trait_scores', { eq: { term_id: t.id }, in: { student_id: ids } }) : [],
      ids.length ? db.select('activity_results', { eq: { term_id: t.id }, in: { student_id: ids } }) : [],
      ids.length ? db.select('homeroom_comments', { eq: { term_id: t.id }, in: { student_id: ids } }) : [],
    ]);
    // ผลรวมรายคน
    const stu = {};
    for (const s of roster) {
      const entries = results.map((r) => ({ grade: r.res[s.id].grade, weight: weightOf(r.course.subject) }));
      const scored = results.filter((r) => r.res[s.id].total !== null);
      const traitSum = Object.fromEntries(Object.keys(TRAIT_KINDS).map((k) =>
        [k, modeSummary(TRAIT_KINDS[k].items.map((_, i) => traits.find((x) => x.student_id === s.id && x.kind === k && x.item_no === i + 1)?.score))]));
      stu[s.id] = {
        gpa: gpa(entries),
        totalScore: scored.reduce((a, r) => a + r.res[s.id].total, 0),
        totalMax: scored.length * 100,
        att: att.find((a) => a.student_id === s.id) || null,
        traits: traitSum,
        acts: Object.fromEntries(acts.filter((a) => a.student_id === s.id).map((a) => [a.activity, a])),
        comment: comments.find((c) => c.student_id === s.id)?.comment || '',
      };
    }
    const gp = rank(roster.map((s) => stu[s.id].gpa));
    const tot = rank(roster.map((s) => (stu[s.id].totalMax ? stu[s.id].totalScore : null)));
    roster.forEach((s, i) => { stu[s.id].gpaRank = gp[i]; stu[s.id].totalRank = tot[i]; });
    // ค่าเฉลี่ยในชั้นเรียนของแต่ละวิชา
    results.forEach((r) => {
      const t2 = roster.map((s) => r.res[s.id].total).filter((x) => x !== null);
      r.classAvg = t2.length ? Math.round((t2.reduce((a, b) => a + b, 0) / t2.length) * 100) / 100 : null;
    });
    perTerm[t.id] = { term: t, results, stu, counts: enrollmentCounts(all, t) };
  }

  // ผลการเรียนเฉลี่ยทั้งปี (ทุกวิชาทุกภาค)
  const yearGpa = Object.fromEntries(roster.map((s) => [s.id, gpa(terms.flatMap((t) =>
    perTerm[t.id].results.map((r) => ({ grade: r.res[s.id].grade, weight: weightOf(r.course.subject) }))))]));
  const yr = rank(roster.map((s) => yearGpa[s.id]));
  const yearRank = Object.fromEntries(roster.map((s, i) => [s.id, yr[i]]));

  // น้ำหนัก-ส่วนสูงทั้งปี
  let health = {};
  if (withHealth && ids.length) {
    const ref = await loadGrowthRef(db, ctx.settings.growth_ref_set || 'excel');
    const hm = await db.select('health_measurements', { in: { student_id: ids }, eq: { academic_year: year } });
    for (const m of hm) {
      const s = roster.find((x) => x.id === m.student_id);
      const months = ageMonths(priv[m.student_id]?.birth_date, m.measured_on);
      (health[m.student_id] ??= {})[m.round] = { ...m, months, ...classify(ref, { sex: s.gender, months, weight: m.weight_kg, height: m.height_cm }) };
    }
  }
  return { room, year, terms, all, roster, priv, perTerm, yearGpa, yearRank, health, homeroom: ctx.homeroomTeachers(room.id) };
}

export const personName = (p) => (p ? `${p.prefix ?? ''}${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : '');
export { fullName };
