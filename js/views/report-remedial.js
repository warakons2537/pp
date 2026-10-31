// รายงานสรุปติดตามการแก้ 0 ร มส รายห้อง (เฉพาะ ม.1–ม.3) — ผลหลังแก้แสดงเมื่อผู้ดูแลระบบยืนยันแล้วเท่านั้น
import { esc, fullName, levelName, thaiDate } from '../util.js?v=2569.10.31-4';
import { CAUSES, PLANS, STATUS, isSecondary, loadRemedial, statusOf, originalOf } from '../remedial.js?v=2569.10.31-4';
import { head, signs, termText } from './report-common.js?v=2569.10.31-4';

export async function remedialReport(ctx, room) {
  if (!isSecondary(room)) return '<div class="empty">รายงานนี้ใช้กับนักเรียนมัธยม (ม.1–ม.3) เท่านั้น</div>';
  const courses = ctx.courses.filter((k) => k.classroom_id === room.id);
  if (!courses.length) return '<div class="empty">ห้องนี้ยังไม่มีรายวิชาในภาคเรียนนี้</div>';
  const items = (await loadRemedial(ctx, courses))
    .sort((a, b) => (a.student.number ?? 0) - (b.student.number ?? 0) || String(a.course.subject?.code).localeCompare(String(b.course.subject?.code)));
  if (!items.length) return '<div class="empty">ห้องนี้ไม่มีนักเรียนที่ได้ 0 ร หรือ มส</div>';
  const n = (st) => items.filter((it) => statusOf(it) === st).length;
  return `<div class="a4 land">
    ${head(ctx, `สรุปการแก้ 0 ร มส ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <table style="font-size:12.5px"><thead><tr><th>ที่</th><th class="l">ชื่อ-สกุล</th><th class="l">รายวิชา</th><th>ผลเดิม</th><th class="l">สาเหตุ</th>
      <th class="l">วิธีแก้</th><th>กำหนด</th><th>สถานะ</th><th>ผลหลังแก้</th></tr></thead>
      <tbody>${items.map((it) => { const c = it.case;
        return `<tr><td>${it.student.number ?? ''}</td><td class="l">${esc(fullName(it.student))}</td>
          <td class="l">${esc(it.course.subject?.code ?? '')} ${esc(it.course.subject?.name ?? '')}</td><td>${esc(originalOf(it))}</td>
          <td class="l">${esc(CAUSES[c?.cause] ?? '')}</td><td class="l">${esc(PLANS[c?.plan] ?? '')}</td>
          <td>${c?.due_date ? esc(thaiDate(c.due_date, true)) : ''}</td><td>${STATUS[statusOf(it)].label}</td>
          <td>${c?.status === 'approved' ? esc(c.new_grade) : ''}</td></tr>`; }).join('')}</tbody></table>
    <div class="legend">รวม ${items.length} รายการ · ยังไม่เปิดรายการ ${n('none')} · กำลังดำเนินการ ${n('planned') + n('in_progress')} · รอยืนยัน ${n('submitted')} · ยืนยันแล้ว ${n('approved')} · ค้าง/เรียนซ้ำ ${n('unresolved')}<br>ผลหลังแก้แสดงเมื่อผู้ดูแลระบบยืนยันแล้วเท่านั้น และไม่เปลี่ยนเกรดใน ปพ.5</div>
    ${signs(ctx, room, [{ name: ctx.settings.academic_head_name, role: 'หัวหน้างานวิชาการ' }, { name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' }])}
  </div>`;
}
