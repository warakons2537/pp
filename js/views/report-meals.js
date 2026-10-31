// รายงานการรับประทานอาหารกลางวันประจำเดือน (ตารางเดียวกับเวลาเรียนประจำเดือน)
import { esc, fullName, levelName, iso, fromIso, daysInMonth, THAI_MONTHS } from '../util.js?v=2569.10.31-5';
import { getRoster } from '../data.js?v=2569.10.31-5';
import { head, signs, termText } from './report-common.js?v=2569.10.31-5';

const MARK = { ate: '/', skip: '×', absent: '–' };

export async function mealsReport(ctx, room, ym) {
  const [y, m0] = ym.split('-').map(Number);
  const nd = daysInMonth(y, m0);
  const from = iso(new Date(y, m0, 1)); const to = iso(new Date(y, m0, nd));
  const [roster, rows] = await Promise.all([
    getRoster(ctx.db, room.id),
    ctx.db.select('meal_checks', { eq: { classroom_id: room.id }, gte: { date: from }, lte: { date: to } }),
  ]);
  if (!rows.length) return '<div class="empty">เดือนนี้ยังไม่มีการบันทึกอาหารกลางวันของห้องนี้</div>';
  const mk = new Map(rows.map((r) => [`${r.student_id}|${r.date}`, r.status]));
  const days = Array.from({ length: nd }, (_, i) => iso(new Date(y, m0, i + 1)));
  const wk = (d) => [0, 6].includes(fromIso(d).getDay());
  const openDays = new Set(rows.map((r) => r.date)).size;
  const tot = { ate: 0, skip: 0, absent: 0 };
  const body = roster.map((s) => {
    const c = { ate: 0, skip: 0, absent: 0 };
    const cells = days.map((d) => { const st = mk.get(`${s.id}|${d}`); if (st) c[st]++;
      return `<td style="${wk(d) ? 'background:#eee' : ''}">${st ? MARK[st] : ''}</td>`; }).join('');
    Object.keys(tot).forEach((k) => { tot[k] += c[k]; });
    return `<tr><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>${cells}<td>${c.ate}</td><td>${c.skip}</td><td>${c.absent}</td></tr>`;
  }).join('');
  const dayTotals = days.map((d) => `<td>${roster.filter((s) => mk.get(`${s.id}|${d}`) === 'ate').length || ''}</td>`).join('');
  return `<div class="a4 land" style="font-size:13px">
    ${head(ctx, `บันทึกการรับประทานอาหารกลางวัน ชั้น${levelName(room.level)}/${room.room}`, `ประจำเดือน${THAI_MONTHS[m0]} พ.ศ. ${y + 543} · ${termText(ctx)}`)}
    <table class="month"><colgroup><col style="width:7mm"><col style="width:46mm">${days.map(() => '<col>').join('')}<col style="width:9mm"><col style="width:11mm"><col style="width:9mm"></colgroup><thead><tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th><th colspan="${nd}">วันที่</th>
      <th rowspan="2">ทาน</th><th rowspan="2">ไม่ทาน</th><th rowspan="2">ไม่มา</th></tr>
      <tr>${days.map((d, i) => `<th style="${wk(d) ? 'background:#eee' : ''}">${i + 1}</th>`).join('')}</tr></thead>
      <tbody>${body}<tr><td colspan="2" class="l"><b>ทานอาหาร (คน)</b></td>${dayTotals}<td>${tot.ate}</td><td>${tot.skip}</td><td>${tot.absent}</td></tr></tbody></table>
    <div class="legend">/ = ทาน · × = ไม่ทาน · – = ไม่มาเรียน · วันที่บันทึกอาหารในเดือนนี้ ${openDays} วัน · รวมมื้อที่ทาน ${tot.ate} มื้อ</div>
    ${signs(ctx, room, [{ name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' }])}
  </div>`;
}
