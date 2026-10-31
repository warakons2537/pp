// ติดตามการแก้ 0 ร มส (เฉพาะ ม.1–ม.3): ค่าคงที่ + รวมรายการจากเกรดที่คำนวณได้กับรายการที่ครูบันทึกไว้
// ไม่แก้เกรดใน ปพ.5: ผลหลังแก้เก็บในตาราง remedial_cases เท่านั้น
import { getRoster } from './data.js?v=2569.10.31-2';
import { loadCourse, computeCourse, fmtGrade } from './grading.js?v=2569.10.31-2';

export const CAUSES = { absent: 'ขาดเรียน / เวลาเรียนไม่ถึง', low_score: 'คะแนนไม่ถึงเกณฑ์', missing_work: 'ไม่ส่งงาน',
  missed_exam: 'ขาดสอบ', other: 'อื่น ๆ' };
export const PLANS = { retest: 'สอบแก้ตัว', tutoring: 'เรียนซ่อมเสริม', extra_work: 'ทำงานเพิ่ม', repeat: 'เรียนซ้ำ' };
export const STATUS = {
  none: { label: 'ยังไม่เปิดรายการ', chip: 'chip-bad' },
  planned: { label: 'รับเรื่องแล้ว', chip: '' },
  in_progress: { label: 'กำลังแก้', chip: 'chip-warn' },
  submitted: { label: 'รอยืนยัน', chip: 'chip-warn' },
  approved: { label: 'ยืนยันแล้ว', chip: 'chip-ok' },
  unresolved: { label: 'ค้าง / เรียนซ้ำ', chip: 'chip-bad' },
};
export const NEW_GRADES = ['0', '1', '1.5', '2', '2.5', '3', '3.5', '4'];

export const isSecondary = (room) => !!room && String(room.level).startsWith('ม.');
export const hasSecondary = (ctx) => (ctx.classrooms || []).some(isSecondary);

// วิชาที่ผู้ใช้เห็นในหน้านี้: ผู้ดูแลเห็นทุกวิชา · ครูเห็นวิชาที่สอนกับวิชาในห้องที่เป็นครูประจำชั้น (เฉพาะ ม.)
export function visibleCourses(ctx) {
  const list = ctx.isAdmin ? ctx.courses
    : [...new Set([...ctx.myCourses, ...ctx.courses.filter((k) => ctx.myClassrooms.some((c) => c.id === k.classroom_id))])];
  return list.filter((k) => isSecondary(k.classroom));
}
export const canEditCase = (ctx, course, row) =>
  ctx.isAdmin || (ctx.myCourses.some((k) => k.id === course.id) && row?.status !== 'approved');

/**
 * รายการติดตามของวิชาที่ระบุ: นักเรียนที่เกรดที่คำนวณได้เป็น 0 / ร / มส (ไม่นับ 0 ที่เกิดจากคะแนนยังไม่ครบ)
 * รวมกับรายการที่ครูบันทึกไว้แล้ว แม้เกรดปัจจุบันจะไม่ใช่ 0 ร มส แล้ว (เช่น ครูตัดเกรดใหม่)
 * @returns [{ key, course, student, grade, case }]
 */
export async function loadRemedial(ctx, courses) {
  const rounding = ctx.settings.score_rounding || 'floor';
  const ids = courses.map((k) => k.id);
  const saved = ids.length ? await ctx.db.select('remedial_cases', { in: { course_id: ids } }) : [];
  const savedBy = new Map(saved.map((r) => [`${r.course_id}|${r.student_id}`, r]));
  const rosters = new Map();
  const out = [];
  for (const course of courses) {
    if (!rosters.has(course.classroom_id)) rosters.set(course.classroom_id, await getRoster(ctx.db, course.classroom_id));
    const roster = rosters.get(course.classroom_id);
    const res = computeCourse(course, await loadCourse(ctx.db, course), roster, rounding);
    for (const s of roster) {
      const r = res[s.id];
      const bad = [0, 'ร', 'มส'].includes(r.grade) && !(r.grade === 0 && r.incomplete);
      const row = savedBy.get(`${course.id}|${s.id}`) || null;
      if (!bad && !row) continue;
      out.push({ key: `${course.id}|${s.id}`, course, student: s, grade: bad ? fmtGrade(r.grade) : null, case: row });
    }
  }
  return out;
}

export const statusOf = (it) => it.case?.status || 'none';
export const originalOf = (it) => it.case?.original_grade || it.grade;
