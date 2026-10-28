// ลำดับรายวิชา (courses.sort_order): ใช้ร่วมกันทุกห้องของระดับชั้นเดียวกัน และทุกภาคเรียนของปีการศึกษาเดียวกัน
// ปพ.6 / รายงานเกรด / รายการวิชา เรียงตามค่านี้อยู่แล้ว

const scope = (ctx, room) => ({
  rooms: ctx.classrooms.filter((c) => c.level === room.level && c.academic_year === room.academic_year),
  termIds: new Set(ctx.terms.filter((t) => t.academic_year === room.academic_year).map((t) => t.id)),
});

const yearCourses = async (ctx, room) => {
  const { rooms, termIds } = scope(ctx, room);
  return (await ctx.db.select('courses', { in: { classroom_id: rooms.map((c) => c.id) } })).filter((k) => termIds.has(k.term_id));
};

// subjectIds = ลำดับวิชาใหม่ของห้องนี้ (บนลงล่าง) → เรียงใหม่ทุกห้อง/ทุกภาคที่เกี่ยวข้อง วิชาที่ไม่อยู่ในรายการต่อท้ายตามลำดับเดิม
export async function applyCourseOrder(ctx, room, subjectIds) {
  const pos = new Map(subjectIds.map((id, i) => [id, i]));
  const groups = new Map();
  for (const k of await yearCourses(ctx, room)) {
    const g = `${k.classroom_id}|${k.term_id}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(k);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (pos.get(a.subject_id) ?? 1e6) - (pos.get(b.subject_id) ?? 1e6) || a.sort_order - b.sort_order);
    for (const [i, k] of list.entries()) if (k.sort_order !== i + 1) await ctx.db.update('courses', { id: k.id }, { sort_order: i + 1 });
  }
}

// เปิดวิชาใหม่ (ห้อง/ภาคใหม่): ใช้ลำดับของวิชาเดียวกันที่ตั้งไว้แล้วในระดับชั้นเดียวกัน (ภาคเดียวกันก่อน) ไม่มี = null
export async function inheritedOrder(ctx, room, termId, subjectId) {
  const same = (await yearCourses(ctx, room)).filter((k) => k.subject_id === subjectId && k.sort_order > 0);
  return (same.find((k) => k.term_id === termId) || same[0])?.sort_order ?? null;
}
