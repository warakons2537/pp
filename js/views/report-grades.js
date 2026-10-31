// รายงาน ปพ.5: ผลสัมฤทธิ์รายวิชา · ผลการเรียนรายชั้น (GPA/อันดับ) · สรุปผลสัมฤทธิ์
import { esc, fullName, levelName } from '../util.js?v=2569.10.31-11';
import { getRoster } from '../data.js?v=2569.10.31-11';
import { loadCourse, computeCourse, fmtGrade, gpa, rank, distribution, weightOf, GRADE_LABELS } from '../grading.js?v=2569.10.31-11';
import { head, signs, termText } from './report-common.js?v=2569.10.31-11';

const rounding = (ctx) => ctx.settings.score_rounding || 'floor';
const unit = (s) => (s?.credits ? `${Number(s.credits)} หน่วยกิต` : s?.hours_per_year ? `${s.hours_per_year} ชั่วโมง/ปี` : '');
const director = (ctx) => ({ name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' });
const academic = (ctx) => ({ name: ctx.settings.academic_head_name, role: 'หัวหน้างานวิชาการ' });

function distTable(grades) {
  const d = distribution(grades);
  const n = grades.filter((g) => g !== null && g !== undefined).length;
  const pct = (k) => (n ? (100 * d[k] / n).toFixed(1) : '-');
  const good = ['4', '3.5', '3'].reduce((s, k) => s + d[k], 0);
  return `<table style="margin-top:6px"><thead><tr><th class="l">ระดับผลการเรียน</th>${GRADE_LABELS.map((g) => `<th>${g}</th>`).join('')}<th>รวม</th></tr></thead>
    <tbody><tr><td class="l">จำนวน (คน)</td>${GRADE_LABELS.map((g) => `<td>${d[g]}</td>`).join('')}<td>${n}</td></tr>
      <tr><td class="l">ร้อยละ</td>${GRADE_LABELS.map((g) => `<td>${pct(g)}</td>`).join('')}<td>${n ? '100' : '-'}</td></tr></tbody></table>
    <div class="legend">ได้ระดับ 3 ขึ้นไป ${good} คน (ร้อยละ ${n ? (100 * good / n).toFixed(1) : '-'})</div>`;
}

// ---------- ปพ.5 รายวิชา ----------
export async function p5Report(ctx, course) {
  const [roster, data] = await Promise.all([getRoster(ctx.db, course.classroom_id), loadCourse(ctx.db, course)]);
  const res = computeCourse(course, data, roster, rounding(ctx));
  const sc = data.items.filter((i) => i.kind === 'score');
  const fi = data.items.filter((i) => i.kind === 'final');
  const hasInd = data.items.some((i) => i.kind === 'indicator');
  const room = course.classroom;
  const land = sc.length + fi.length > 9;
  const rawMax = sc.reduce((s, i) => s + Number(i.max_score || 0), 0);
  if (!data.items.length) return '<div class="empty">วิชานี้ยังไม่ได้ตั้งช่องคะแนน</div>';
  return `<div class="a4 ${land ? 'land' : ''}">
    ${head(ctx, 'ผลสัมฤทธิ์ทางการเรียน', `รายวิชา ${course.subject?.code} ${course.subject?.name} · ${unit(course.subject)} · ชั้น${levelName(room.level)}/${room.room} · ${termText(ctx)}`)}
    <table style="font-size:12.5px"><thead>
      <tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th>${sc.length ? `<th colspan="${sc.length + 1}">คะแนนระหว่างภาค</th>` : ''}
        <th rowspan="2">ระหว่าง<br>ภาค</th><th rowspan="2">ปลาย<br>ภาค</th><th rowspan="2">รวม</th><th rowspan="2">ระดับ<br>ผลการเรียน</th>${hasInd ? '<th rowspan="2">ตัว<br>ชี้วัด</th>' : ''}</tr>
      <tr>${sc.map((i) => `<th style="font-weight:400;font-size:11px">${esc(i.title)}<br>(${Number(i.max_score)})</th>`).join('')}${sc.length ? `<th style="font-size:11px">รวม<br>(${rawMax})</th>` : ''}</tr>
      <tr><td></td><td class="l">คะแนนเต็ม</td>${sc.map(() => '<td></td>').join('')}${sc.length ? '<td></td>' : ''}<td>${course.midterm_ratio}</td><td>${course.final_ratio}</td><td>100</td><td></td>${hasInd ? '<td></td>' : ''}</tr></thead>
      <tbody>${roster.map((s) => { const x = res[s.id];
        return `<tr><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>
          ${sc.map((i) => { const v = data.scoreMap.get(`${i.id}|${s.id}`)?.score; return `<td>${v === null || v === undefined ? '' : Number(v)}</td>`; }).join('')}
          ${sc.length ? `<td>${x.hasData ? x.rawSum : ''}</td>` : ''}<td>${x.mid ?? ''}</td><td>${x.final ?? ''}</td><td>${x.total ?? ''}</td>
          <td><b>${fmtGrade(x.grade)}</b>${x.incomplete ? '*' : ''}</td>${hasInd ? `<td>${x.indicator ?? ''}</td>` : ''}</tr>`; }).join('')}</tbody></table>
    ${distTable(roster.map((s) => res[s.id].grade))}
    ${roster.some((s) => res[s.id].grade === null || res[s.id].incomplete) ? `<div class="legend">${[
      roster.filter((s) => res[s.id].grade === null).length ? `ยังไม่มีคะแนน ${roster.filter((s) => res[s.id].grade === null).length} คน` : '',
      roster.filter((s) => res[s.id].incomplete).length ? `* คะแนนยังไม่ครบ ${roster.filter((s) => res[s.id].incomplete).length} คน (ช่องว่างนับเป็น 0)` : '',
    ].filter(Boolean).join(' · ')}</div>` : ''}
    ${signs(ctx, null, [...(course.teachers.length ? course.teachers : [{ full_name: '' }]).map((t) => ({ name: t.full_name, role: 'ครูผู้สอน' })), academic(ctx), director(ctx)])}
  </div>`;
}

// ข้อมูลทุกวิชาของห้อง
async function roomResults(ctx, room) {
  const courses = ctx.courses.filter((k) => k.classroom_id === room.id);
  const roster = await getRoster(ctx.db, room.id);
  const per = await Promise.all(courses.map(async (k) => computeCourse(k, await loadCourse(ctx.db, k), roster, rounding(ctx))));
  return { courses, roster, per };
}

// ---------- ผลการเรียนรายชั้น ----------
export async function gradesReport(ctx, room) {
  const { courses, roster, per } = await roomResults(ctx, room);
  if (!courses.length) return '<div class="empty">ห้องนี้ยังไม่มีรายวิชาในภาคเรียนนี้</div>';
  const gpas = roster.map((s) => gpa(courses.map((k, j) => ({ grade: per[j][s.id].grade, weight: weightOf(k.subject) }))));
  const ranks = rank(gpas);
  const totalW = courses.reduce((t, k) => t + weightOf(k.subject), 0);
  return `<div class="a4 land">
    ${head(ctx, `ผลการเรียน ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <table style="font-size:12px"><thead>
      <tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th>${courses.map((k) => `<th style="font-size:10.5px;font-weight:400;line-height:1.15">${esc(k.subject?.code)}<br>${esc(k.subject?.name)}</th>`).join('')}
        <th rowspan="2">ผลการเรียน<br>เฉลี่ย</th><th rowspan="2">อันดับ</th></tr>
      <tr>${courses.map((k) => `<th style="font-weight:400;font-size:11px">${weightOf(k.subject)}</th>`).join('')}</tr></thead>
      <tbody>${roster.map((s, i) => `<tr><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>
        ${courses.map((k, j) => `<td>${fmtGrade(per[j][s.id].grade)}${per[j][s.id].incomplete ? '*' : ''}</td>`).join('')}
        <td><b>${gpas[i] === null ? '' : gpas[i].toFixed(2)}</b></td><td>${ranks[i] ?? ''}</td></tr>`).join('')}
      <tr><td></td><td class="l">ไม่ผ่าน (0 / ร / มส)</td>${courses.map((k, j) => `<td>${roster.filter((s) => [0, 'ร', 'มส'].includes(per[j][s.id].grade)).length || ''}</td>`).join('')}<td></td><td></td></tr>
      </tbody></table>
    <div class="legend">น้ำหนักวิชา = หน่วยกิต (ประถมใช้ ชั่วโมง/ปี ÷ 40) · รวม ${totalW} · ผลการเรียนเฉลี่ยไม่นับวิชาที่ได้ ร หรือ มส และปัดทิ้งเหลือทศนิยม 2 ตำแหน่ง · * = คะแนนวิชานั้นยังไม่ครบ</div>
    ${signs(ctx, room, [academic(ctx), director(ctx)])}
  </div>`;
}

// ---------- สรุปผลสัมฤทธิ์ (การกระจายเกรดรายวิชา) ----------
export async function achieveReport(ctx, room) {
  const { courses, roster, per } = await roomResults(ctx, room);
  if (!courses.length) return '<div class="empty">ห้องนี้ยังไม่มีรายวิชาในภาคเรียนนี้</div>';
  const rows = courses.map((k, j) => ({ k, d: distribution(roster.map((s) => per[j][s.id].grade)), n: roster.filter((s) => per[j][s.id].grade !== null).length }));
  const sumD = Object.fromEntries(GRADE_LABELS.map((g) => [g, rows.reduce((t, r) => t + r.d[g], 0)]));
  const sumN = rows.reduce((t, r) => t + r.n, 0);
  const good = (d) => ['4', '3.5', '3'].reduce((t, g) => t + d[g], 0);
  const boys = roster.filter((s) => s.gender === 'ช').length;
  return `<div class="a4">
    ${head(ctx, `สรุปผลสัมฤทธิ์ทางการเรียน ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <div class="sub">นักเรียน ชาย ${boys} คน · หญิง ${roster.length - boys} คน · รวม ${roster.length} คน</div>
    <table style="font-size:12.5px"><thead><tr><th>รหัส</th><th class="l">รายวิชา</th><th>นก.</th>${GRADE_LABELS.map((g) => `<th>${g}</th>`).join('')}<th>รวม</th><th>3 ขึ้นไป<br>ร้อยละ</th></tr></thead>
      <tbody>${rows.map(({ k, d, n }) => `<tr><td>${esc(k.subject?.code)}</td><td class="l">${esc(k.subject?.name)}</td><td>${weightOf(k.subject)}</td>
        ${GRADE_LABELS.map((g) => `<td>${d[g] || ''}</td>`).join('')}<td>${n}</td><td>${n ? (100 * good(d) / n).toFixed(1) : '-'}</td></tr>`).join('')}
      <tr><td></td><td class="l"><b>รวม</b></td><td>${courses.reduce((t, k) => t + weightOf(k.subject), 0)}</td>${GRADE_LABELS.map((g) => `<td><b>${sumD[g]}</b></td>`).join('')}<td><b>${sumN}</b></td>
        <td><b>${sumN ? (100 * good(sumD) / sumN).toFixed(1) : '-'}</b></td></tr>
      <tr><td></td><td class="l">ร้อยละ</td><td></td>${GRADE_LABELS.map((g) => `<td>${sumN ? (100 * sumD[g] / sumN).toFixed(1) : '-'}</td>`).join('')}<td>100</td><td></td></tr></tbody></table>
    ${signs(ctx, room, [academic(ctx), director(ctx)])}
  </div>`;
}
