import { esc, roomName, thaiDate, todayIso, fullName, iso, fromIso, THAI_DOW, levelName } from '../util.js?v=2569.10.27-14';
import { getRoster, termRange } from '../data.js?v=2569.10.27-14';
import { icon } from '../icons.js?v=2569.10.27-14';

export async function render(el, ctx) {
  const { db } = ctx;
  if (!ctx.term || !ctx.classrooms.length) {
    el.innerHTML = `
      <div class="page-head"><div><h1>เริ่มต้นใช้งาน</h1><p>ระบบยังไม่มีภาคเรียนหรือห้องเรียน ทำตามลำดับนี้ครั้งเดียว</p></div></div>
      <div class="card"><ol class="small" style="margin:0;padding-left:20px;line-height:2">
        <li>ฝ่ายวิชาการเปิด "ตั้งค่าระบบ" กรอกข้อมูลโรงเรียน และเพิ่มภาคเรียนปัจจุบัน</li>
        <li>นำเข้ารายชื่อนักเรียนจากไฟล์ DMC ที่หน้า "นักเรียน" ระบบจะสร้างห้องให้เอง</li>
        <li>อนุมัติบัญชีครู แล้วกำหนดครูประจำชั้นของแต่ละห้อง</li>
        <li>เพิ่มรายวิชา เปิดสอน และกำหนดครูผู้สอน</li>
      </ol>${ctx.isAdmin ? '<div><a class="btn btn-primary" href="#setup">ไปที่ตั้งค่าระบบ</a></div>' : '<p class="muted">กรุณาแจ้งฝ่ายวิชาการ</p>'}</div>`;
    return;
  }

  const today = todayIso();
  const range = termRange(ctx.term);
  const since = iso(new Date(fromIso(today).getTime() - 40 * 86400000));
  const rooms = ctx.myClassrooms;
  const cards = await Promise.all(rooms.map(async (c) => {
    const [roster, recent, summary] = await Promise.all([
      getRoster(db, c.id),
      db.select('daily_attendance', { eq: { classroom_id: c.id }, gte: { date: since }, lte: { date: today } }),
      db.rpc('daily_attendance_summary', { cid: c.id, d_from: range.from, d_to: range.to }),
    ]);
    const todayRows = recent.filter((r) => r.date === today);
    const days = [...new Set(recent.map((r) => r.date))].sort().slice(-10);
    const series = days.map((d) => { const rs = recent.filter((r) => r.date === d);
      return { d, pct: rs.length ? Math.round(100 * rs.filter((r) => r.status === 'present' || r.status === 'late').length / rs.length) : 0 }; });
    const risk = summary.filter((s) => s.pct !== null && s.pct < 80).map((s) => ({ ...s, st: roster.find((r) => r.id === s.student_id) })).filter((s) => s.st);
    return { c, roster, todayRows, series, risk, absent: todayRows.filter((r) => r.status === 'absent').length };
  }));

  const notChecked = cards.filter((x) => x.roster.length && x.todayRows.length < x.roster.length);
  const riskAll = cards.flatMap((x) => x.risk.map((r) => ({ ...r, room: x.c })));
  const d = fromIso(today);
  const greet = ctx.me.full_name ? `สวัสดี ${esc(ctx.me.full_name)}` : 'สวัสดี';

  const todo = [
    ...notChecked.map((x) => `<a href="#daily"><span class="dot" style="background:var(--amber)"></span>
      <span>ยังเช็กชื่อห้อง ${esc(roomName(x.c))} ไม่ครบ (${x.todayRows.length}/${x.roster.length} คน)</span></a>`),
    ...(riskAll.length ? [`<a href="#reports"><span class="dot" style="background:var(--red)"></span>
      <span>นักเรียน ${riskAll.length} คน มาเรียนต่ำกว่าร้อยละ 80 ในภาคนี้</span></a>`] : []),
  ];

  const initial = esc(((ctx.me.full_name || '').replace(/^(ครู|นาย|นางสาว|นาง)\s*/, '').replace(/^[เแโใไ]/, '')[0]) || '?');
  const APPS = [['daily', 'เช็กชื่อประจำวัน'], ['period', 'เช็กชื่อรายคาบ'], ['students', 'นักเรียน'], ['scores', 'คะแนนรายวิชา'],
    ['health', 'น้ำหนัก-ส่วนสูง'], ['traits', 'คุณลักษณะ/กิจกรรม'], ['print', 'พิมพ์ ปพ.6 / ปพ.5'], ['reports', 'รายงาน A4'],
    ...(ctx.isAdmin ? [['setup', 'ตั้งค่าระบบ']] : [])];

  el.innerHTML = `
    <section class="welcome">
      <div class="av" aria-hidden="true">${initial}</div>
      <div><h1>${greet}</h1>
        <p>${['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'][d.getDay()]}ที่ ${esc(thaiDate(today))} · ภาคเรียนที่ ${ctx.term.term} ปีการศึกษา ${ctx.term.academic_year}</p></div>
      ${rooms.length ? '<a class="btn" href="#daily">เช็กชื่อวันนี้</a>' : ''}
    </section>
    <div class="card"><div class="card-title">${icon('home')}เมนูลัด</div>
      <nav class="apps">${APPS.map(([v, label]) => `<a href="#${v}" data-v="${v}"><span class="tile">${icon(v)}</span><span>${label}</span></a>`).join('')}</nav></div>
    ${rooms.length ? `<div class="todo">${todo.length ? todo.join('') : `<a href="#daily"><span class="dot" style="background:var(--green)"></span><span>เช็กชื่อวันนี้ครบทุกห้องแล้ว</span></a>`}</div>` : ''}

    ${rooms.length ? `<h2>ห้องที่ดูแล</h2>
    <div class="grid">${cards.map(({ c, roster, todayRows, series, risk, absent }) => `
      <div class="card room-card">
        <div class="top">
          <div><div class="roomno">${esc(roomName(c))}</div><div class="small muted">${esc(levelName(c.level))} · ${roster.length} คน</div></div>
          ${!roster.length ? '<span class="chip">ยังไม่มีนักเรียน</span>'
            : todayRows.length >= roster.length ? '<span class="chip chip-ok">เช็กชื่อแล้ว</span>'
            : todayRows.length ? `<span class="chip chip-warn">เช็กแล้ว ${todayRows.length}/${roster.length}</span>`
            : '<span class="chip chip-bad">ยังไม่เช็กชื่อ</span>'}
        </div>
        ${series.length ? `<div class="spark" title="ร้อยละการมาเรียน 10 วันเรียนล่าสุด">
          <div class="bars">${series.map((x) => `<i class="${x.d === today ? 'today' : x.pct < 80 ? 'low' : ''}" style="height:${Math.max(4, x.pct)}%" title="${esc(thaiDate(x.d, true))}: ${x.pct}%"></i>`).join('')}</div>
          <div class="axis"><span>${esc(THAI_DOW[fromIso(series[0].d).getDay()])} ${fromIso(series[0].d).getDate()}</span><span>มาเรียน 10 วันเรียนล่าสุด</span><span>${esc(THAI_DOW[fromIso(series.at(-1).d).getDay()])} ${fromIso(series.at(-1).d).getDate()}</span></div></div>` : '<p class="small muted" style="margin:0">ยังไม่มีข้อมูลเวลาเรียน</p>'}
        <div class="stats">
          <div class="stat"><b>${todayRows.length ? roster.length - absent : '–'}</b><span>มาวันนี้</span></div>
          <div class="stat"><b style="${absent ? 'color:var(--red)' : ''}">${todayRows.length ? absent : '–'}</b><span>ขาดวันนี้</span></div>
          <div class="stat"><b style="${risk.length ? 'color:var(--red)' : ''}">${risk.length}</b><span>ต่ำกว่า 80%</span></div>
        </div>
        ${risk.length ? `<div class="small">${risk.slice(0, 3).map((r) => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(fullName(r.st))}</span><span class="chip chip-bad">${r.pct}%</span></div>`).join('')}${risk.length > 3 ? `<div class="muted">และอีก ${risk.length - 3} คน</div>` : ''}</div>` : ''}
        <div class="row"><a class="btn btn-sm" href="#students">${icon('students')}รายชื่อ</a><a class="btn btn-sm" href="#reports">${icon('reports')}รายงาน</a></div>
      </div>`).join('')}</div>` : ''}

    <h2>วิชาที่สอน</h2>
    ${ctx.myCourses.length ? `<div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>รายวิชา</th><th>ห้อง</th><th class="hide-sm">ครูผู้สอน</th><th></th></tr></thead><tbody>
      ${ctx.myCourses.map((k) => `<tr><td class="tc-ttl"><b>${esc(k.subject?.code)}</b> ${esc(k.subject?.name)}</td><td data-l="ห้อง">${esc(roomName(k.classroom))}</td>
        <td class="small muted hide-sm">${esc(k.teachers.map((t) => t.full_name).join(', '))}</td>
        <td class="n tc-act" style="white-space:nowrap"><a class="btn btn-sm" href="#period" data-k="${esc(k.id)}" data-v="period">${icon('period')}เช็กชื่อ</a>
          <a class="btn btn-sm" href="#scores" data-k="${esc(k.id)}" data-v="scores">${icon('scores')}คะแนน</a></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">ยังไม่มีวิชาที่ได้รับมอบหมายในภาคเรียนนี้</div>'}`;
  el.querySelectorAll('[data-k]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ctx.go(a.dataset.v, { course: a.dataset.k }); }));
}
