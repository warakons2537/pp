import { esc } from '../util.js?v=2569.10.27-8';

// ---------- ส่วนหัว / ลายเซ็น ----------
export const head = (ctx, title, sub) => `
  <h2>${esc(title)}</h2>
  <div class="sub">${esc(sub)}<br>โรงเรียน${esc(ctx.settings.school_name || '')} ${esc(ctx.settings.area_office || '')}</div>`;

export const signs = (ctx, room, extra = []) => {
  const homeroom = room ? ctx.homeroomTeachers(room.id) : [];
  const people = [
    ...(!room ? [] : homeroom.length ? homeroom : [{ full_name: '' }]).map((t) => ({ name: t.full_name, role: 'ครูประจำชั้น' })),
    ...extra,
  ];
  return `<div class="sign">${people.map((p) => `<div>ลงชื่อ.......................................<br>(${esc(p.name || '.......................................')})<br>${esc(p.role)}</div>`).join('')}</div>`;
};

export const termText = (ctx) => `ภาคเรียนที่ ${ctx.term.term} ปีการศึกษา ${ctx.term.academic_year}`;

