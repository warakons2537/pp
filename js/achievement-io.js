// =====================================================================
//  ส่งออก / นำเข้า แบบบันทึกผลสัมฤทธิ์ (ไฟล์ Excel แบบที่โรงเรียนใช้อยู่)
// =====================================================================
import { levelName, roomName } from './util.js?v=2569.10.27-16';
import { getRoster } from './data.js?v=2569.10.27-16';
import { loadCourse, computeCourse } from './grading.js?v=2569.10.27-16';
import { achievementSheet, sheetName as stuName } from './achievement.js?v=2569.10.27-16';
import { buildXlsx, safeSheetName, downloadBytes } from './xlsx-write.js?v=2569.10.27-16';
import { sheetMatrix, findAchievementSheet, parseAchievement, matchStudents } from './achievement-import.js?v=2569.10.27-16';

const fileSafe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

// ข้อมูล 1 วิชา → spec ของแผ่นงาน
export async function courseSpec(ctx, course, { roster, data } = {}) {
  roster ??= await getRoster(ctx.db, course.classroom_id);
  data ??= await loadCourse(ctx.db, course);
  const rounding = ctx.settings.score_rounding || 'floor';
  const calc = computeCourse(course, data, roster, rounding);
  const scoreItems = data.items.filter((i) => i.kind === 'score');
  const finalItems = data.items.filter((i) => i.kind === 'final');
  const room = course.classroom;
  const sameLevel = ctx.classrooms.filter((c) => c.level === room.level && c.academic_year === room.academic_year).length;
  const term = ctx.term;
  const line1 = `ชั้น${levelName(room.level)}${sameLevel > 1 ? ` ห้อง ${room.room}` : ''} ภาคเรียนที่ ${term?.term ?? ''} ปีการศึกษา ${term?.academic_year ?? ''}`;
  const students = roster.map((s, i) => {
    const x = calc[s.id] || {};
    const res = data.results[s.id] || {};
    const special = res.special || (x.grade === 'มส' ? 'มส' : x.grade === 'ร' ? 'ร' : null);
    return {
      no: s.number ?? i + 1,
      name: stuName(s),
      scores: scoreItems.map((it) => { const v = data.scoreMap.get(`${it.id}|${s.id}`)?.score; return v === null || v === undefined ? null : Number(v); }),
      // ปลายภาค: ถ้ามีหลายช่องหรือคะแนนเต็มไม่เท่าสัดส่วน ใช้ค่าที่ระบบแปลงแล้ว
      final: finalItems.length && finalItems.some((it) => data.scoreMap.get(`${it.id}|${s.id}`)?.score != null) ? x.final : null,
      special,
    };
  });
  const teachers = course.teachers.map((t) => t.full_name).filter(Boolean).join(', ');
  return {
    sheetName: 'ผลสัมฤทธิ์',
    line1,
    line2: `วิชา ${course.subject?.name ?? ''}${course.subject?.code ? ` (${course.subject.code})` : ''}`,
    midRatio: course.midterm_ratio, finalRatio: course.final_ratio, rounding,
    items: scoreItems.map((it) => ({ title: it.title || it.code || '', max: Number(it.max_score) })),
    students,
    signs: [
      { line: 'ลงชื่อ.............................ครูผู้สอน', name: teachers },
      { line: `ลงชื่อ.......................${ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน'}`, name: ctx.settings.director_name || '' },
    ],
  };
}

// ส่งออก: 1 วิชา = 1 ไฟล์ (แผ่นงาน "ผลสัมฤทธิ์") · หลายวิชา = 1 ไฟล์ หลายแผ่นงาน
export async function exportAchievement(ctx, courses) {
  const used = new Set();
  const sheets = [];
  for (const k of courses) {
    const spec = await courseSpec(ctx, k);
    if (courses.length > 1) spec.sheetName = safeSheetName(k.subject?.code || k.subject?.name || 'วิชา', used);
    sheets.push(achievementSheet(spec));
  }
  const k = courses[0];
  const term = ctx.term ? `ภาค${ctx.term.term}-${ctx.term.academic_year}` : '';
  const name = courses.length > 1
    ? `ผลสัมฤทธิ์ ${roomName(k.classroom)} ทุกวิชา ${term}.xlsx`
    : `ผลสัมฤทธิ์ ${roomName(k.classroom)} ${k.subject?.code ?? ''} ${k.subject?.name ?? ''} ${term}.xlsx`;
  downloadBytes(buildXlsx(sheets, { title: name.replace(/\.xlsx$/, '') }), fileSafe(name));
  return name;
}

// ---------------------------------------------------------------------
//  นำเข้า: อ่านไฟล์ → แผนการนำเข้า (ยังไม่เขียนฐานข้อมูล)
// ---------------------------------------------------------------------
export async function readAchievementFile(file) {
  if (!window.XLSX) throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const name = findAchievementSheet(wb);
  if (!name) throw new Error(`ไม่พบแผ่นงาน "ผลสัมฤทธิ์" ในไฟล์ (มี: ${wb.SheetNames.join(', ')})`);
  return parseAchievement(sheetMatrix(window.XLSX, wb.Sheets[name]));
}

export function planImport(parsed, roster, nameOf) {
  const rows = matchStudents(parsed, roster, nameOf);
  // คะแนนที่เกินคะแนนเต็ม (ระบบจะลดลงเหลือเท่าคะแนนเต็ม)
  const overs = [];
  for (const { p, s } of rows) {
    if (!s) continue;
    p.scores.forEach((v, i) => { if (v !== null && v > parsed.items[i].max) overs.push(`${p.name}: ${parsed.items[i].title} ${v}/${parsed.items[i].max}`); });
    if (p.final !== null && p.final > parsed.finalRatio) overs.push(`${p.name}: ปลายภาค ${p.final}/${parsed.finalRatio}`);
  }
  return { parsed, rows, overs, matched: rows.filter((r) => r.s), unmatched: rows.filter((r) => !r.s),
    missing: roster.filter((s) => !rows.some((r) => r.s?.id === s.id)) };
}

// เขียนลงฐานข้อมูล: แทนที่ช่องคะแนนเก็บ/ปลายภาคของวิชาเดิม (ตัวชี้วัดไม่แตะ)
export async function applyImport(ctx, course, plan, existingItems) {
  const { parsed } = plan;
  const db = ctx.db;
  if (course.midterm_ratio !== parsed.midRatio || course.final_ratio !== parsed.finalRatio) {
    if (parsed.midRatio + parsed.finalRatio === 100) await db.update('courses', { id: course.id }, { midterm_ratio: parsed.midRatio, final_ratio: parsed.finalRatio });
  }
  for (const it of existingItems.filter((i) => i.kind === 'score' || i.kind === 'final')) await db.remove('assessment_items', { id: it.id });
  const base = existingItems.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
  const newItems = await db.insert('assessment_items', [
    ...parsed.items.map((it, i) => ({ course_id: course.id, kind: 'score', title: it.title, max_score: it.max, sort_order: base + i + 1 })),
    { course_id: course.id, kind: 'final', title: 'สอบปลายภาค', max_score: parsed.finalRatio, sort_order: base + parsed.items.length + 1 },
  ]);
  const scoreIds = newItems.filter((i) => i.kind === 'score').sort((a, b) => a.sort_order - b.sort_order).map((i) => i.id);
  const finalId = newItems.find((i) => i.kind === 'final').id;
  const scores = []; const results = [];
  for (const { p, s } of plan.matched) {
    p.scores.forEach((v, i) => { if (v !== null) scores.push({ item_id: scoreIds[i], student_id: s.id, score: Math.min(v, parsed.items[i].max) }); });
    if (p.final !== null) scores.push({ item_id: finalId, student_id: s.id, score: Math.min(p.final, parsed.finalRatio) });
    results.push({ course_id: course.id, student_id: s.id, special: p.special, ms_waived: false });
  }
  for (let i = 0; i < scores.length; i += 500) await db.upsert('item_scores', scores.slice(i, i + 500), 'item_id,student_id');
  if (results.length) await db.upsert('course_results', results, 'course_id,student_id');
  return { items: parsed.items.length, scores: scores.length, students: plan.matched.length };
}
