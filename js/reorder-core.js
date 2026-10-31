// ตรรกะล้วนของการลากเรียงรายชื่อ (ทดสอบได้): ลำดับใหม่ → เลขที่ใหม่ 1..N เปลี่ยนเฉพาะคนที่เลขที่เปลี่ยนจริง
// active = [{ enrollment_id, number }] · ids = enrollment_id เรียงตามลำดับใหม่ (ต้องเป็นชุดเดียวกับ active ทุกคน ไม่ซ้ำ)
export function reorderPlan(active, ids) {
  const byId = new Map(active.map((s) => [s.enrollment_id, s]));
  if (ids.length !== active.length || new Set(ids).size !== ids.length || ids.some((id) => !byId.has(id))) throw new Error('ลำดับที่ได้ไม่ครบหรือซ้ำ');
  return ids.map((id, i) => ({ id, from: byId.get(id).number ?? null, to: i + 1 })).filter((c) => c.from !== c.to);
}

// ย้ายรายการที่ index from ไปไว้ที่ index to (ใช้กับปุ่มลูกศรสำหรับคีย์บอร์ด)
export function moveItem(list, from, to) {
  if (from < 0 || from >= list.length) return list.slice();
  const t = Math.max(0, Math.min(list.length - 1, to));
  const out = list.slice(); const [x] = out.splice(from, 1); out.splice(t, 0, x);
  return out;
}
