import { esc, $, toast, options, roomName, fullName, todayIso, thaiDate } from '../util.js?v=2569.11.1-43';
import { getRoster, enrolledOn, loadGrowthRef, getBirthDates, termRange, roundsOfTerm, termOfRound, roundInTerm, roundLabel } from '../data.js?v=2569.11.1-43';
import { attachSheet } from '../sheet.js?v=2569.11.1-43';
import { attachGrid } from '../grid.js?v=2569.11.1-43';
import { classify, ageMonths, ageText, severity, WH, HA, OUT_OF_TABLE } from '../assess.js?v=2569.11.1-43';

// round = ลำดับในปีการศึกษา 1–8 (ภาคเรียนที่ 1 = 1–4 · ภาคเรียนที่ 2 = 5–8)
const pref = { room: null, round: null, date: null };
const chip = (label) => {
  if (!label) return '<span class="muted">–</span>';
  const s = label === OUT_OF_TABLE ? 1 : severity(label);
  return `<span class="chip ${s === 0 ? 'chip-ok' : s === 1 ? 'chip-warn' : 'chip-bad'}">${esc(label)}</span>`;
};

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms : [...ctx.myClassrooms, ...ctx.classrooms.filter((c) => !ctx.myClassrooms.includes(c))];
  if (!rooms.length) { el.innerHTML = '<h1>น้ำหนัก-ส่วนสูง</h1><div class="empty">ยังไม่มีห้องเรียน</div>'; return; }
  if (!rooms.some((r) => r.id === pref.room)) pref.room = (ctx.myClassrooms[0] || rooms[0]).id;
  const room = ctx.classroomById[pref.room];
  const year = room.academic_year;
  const canEdit = ctx.isAdmin || ctx.classroomTeacherRows.some((x) => x.classroom_id === room.id && x.teacher_id === ctx.me.id);
  const refSet = ctx.settings.growth_ref_set || 'excel';
  // ค่าเริ่มต้น: ครั้งที่ 1 ของภาคเรียนปัจจุบัน
  if (!pref.round) pref.round = roundsOfTerm(ctx.term?.academic_year === year ? ctx.term.term : 1)[0];
  const termNo = termOfRound(pref.round);
  const termRow = ctx.terms?.find((t) => t.academic_year === year && t.term === termNo) || { academic_year: year, term: termNo };
  const range = termRange(termRow);
  const inTerm = (d) => d >= range.from && d <= range.to;
  const [everyone, ref] = await Promise.all([getRoster(ctx.db, room.id, { includeLeft: true }), loadGrowthRef(ctx.db, refSet)]);
  const ids = everyone.map((s) => s.id);
  const [births, rows] = await Promise.all([
    getBirthDates(ctx.db, ids),
    ids.length ? ctx.db.select('health_measurements', { in: { student_id: ids }, eq: { academic_year: year } }) : [],
  ]);
  const byKey = new Map(rows.map((r) => [`${r.student_id}|${r.round}`, r]));
  const cur = (sid) => byKey.get(`${sid}|${pref.round}`);
  const prev = (sid) => { for (let k = pref.round - 1; k >= 1; k--) { const r = byKey.get(`${sid}|${k}`); if (r) return r; } return null; };
  const dates = rows.filter((r) => r.round === pref.round).map((r) => r.measured_on);
  pref.date = dates.sort().at(-1) || pref.date || (inTerm(todayIso()) ? todayIso() : range.from);
  // รายชื่อ = นักเรียนที่อยู่ในห้องวันที่ชั่ง/วัดครั้งนี้ (คนย้ายเข้าทีหลังไม่อยู่ในครั้งก่อนหน้า · คนที่ออกแล้วไม่อยู่ในครั้งหลัง)
  const roster = everyone.filter((s) => enrolledOn(s, pref.date));

  const calc = (s) => {
    const m = cur(s.id);
    const months = ageMonths(births[s.id], m?.measured_on || pref.date);
    return { months, ...classify(ref, { sex: s.gender, months, weight: m?.weight_kg, height: m?.height_cm }) };
  };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>น้ำหนัก-ส่วนสูง</h1>
        <p>บันทึกน้ำหนัก-ส่วนสูงภาคเรียนละ 4 ครั้ง แปลผลตามเกณฑ์กรมอนามัย · ปีการศึกษา ${year} · ${canEdit ? '<span class="live">อัปเดตทันที</span>' : 'ดูอย่างเดียว'}</p></div>
      <div class="row">
        <label class="field">ห้อง<select id="room">${options(rooms, room.id, (r) => `ห้อง ${roomName(r)}`)}</select></label>
        <label class="field">ภาคเรียน<select id="term">${options([1, 2].map((n) => ({ id: n, label: `ภาคเรียนที่ ${n}` })), termNo)}</select></label>
        <label class="field">ครั้งที่<select id="round">${options(roundsOfTerm(termNo).map((n) => ({ id: n, label: `ครั้งที่ ${roundInTerm(n)}` })), pref.round)}</select></label>
        <label class="field">วันที่ชั่ง/วัด<input type="date" id="date" value="${pref.date}" ${canEdit ? '' : 'disabled'}></label>
      </div>
    </div>
    <p class="small" id="dwarn" style="color:var(--amber)"></p>
    ${!ref.size ? `<div class="card" style="border-color:var(--amber)"><b>ยังไม่มีตารางอ้างอิงการเจริญเติบโต</b>
      <p class="small">ระบบจึงยังแปลผลภาวะโภชนาการไม่ได้ ${ctx.isAdmin ? 'โหลดตารางได้ที่ ตั้งค่าระบบ → ตารางโภชนาการ' : 'กรุณาแจ้งผู้ดูแลระบบให้โหลดตารางที่หน้าตั้งค่าระบบ'}</p></div>` : ''}
    ${roster.some((s) => !births[s.id]) ? `<p class="small muted">นักเรียน ${roster.filter((s) => !births[s.id]).length} คนไม่มีวันเกิดในระบบ (หรือคุณไม่มีสิทธิ์ดู) จึงแปลผลน้ำหนัก/ส่วนสูงตามอายุไม่ได้ · แก้วันเกิดได้ที่หน้า "นักเรียน"</p>` : ''}
    <div class="grid" style="grid-template-columns:minmax(0,1fr) 280px;align-items:start" id="cols">
      <div style="min-width:0;display:flex;flex-direction:column;gap:8px">
        <div class="small muted hide-sm">กรอกแล้วบันทึกอัตโนมัติ · ลูกศร/Enter เลื่อนช่อง · วางน้ำหนักและส่วนสูงจาก Excel ได้ทั้ง 2 คอลัมน์ · เกณฑ์: ${esc(refSet === 'excel' ? 'ตารางจากไฟล์ Excel เดิม' : refSet)}</div>
        ${roster.length ? `<div class="tbl-wrap"><table class="reg sheet hgrid" id="hgrid">
          <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th><th>เพศ</th><th>อายุ</th><th>น้ำหนัก<br>(กก.)</th><th>ส่วนสูง<br>(ซม.)</th>
            <th>น้ำหนัก<br>ตามอายุ</th><th>ส่วนสูง<br>ตามอายุ</th><th>น้ำหนัก<br>ตามส่วนสูง</th><th>ครั้งก่อน</th></tr></thead>
          <tbody>${roster.map((s, r) => { const m = cur(s.id); const x = calc(s); const p = prev(s.id);
            return `<tr data-sid="${s.id}"><td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td><td class="c-sex">${esc(s.gender ?? '')}</td>
              <td class="small c-age" style="padding:0 6px;white-space:nowrap">${esc(ageText(x.months))}</td>
              <td class="c-in" data-label="น้ำหนัก (กก.)"><input class="gc sc" data-r="${r}" data-c="0" enterkeyhint="next" data-f="weight_kg" data-sid="${s.id}" inputmode="decimal" value="${m?.weight_kg ?? ''}" ${canEdit ? '' : 'readonly'} aria-label="น้ำหนัก ${esc(s.first_name)}"></td>
              <td class="c-in" data-label="ส่วนสูง (ซม.)"><input class="gc sc" data-r="${r}" data-c="1" enterkeyhint="next" data-f="height_cm" data-sid="${s.id}" inputmode="decimal" value="${m?.height_cm ?? ''}" ${canEdit ? '' : 'readonly'} aria-label="ส่วนสูง ${esc(s.first_name)}"></td>
              <td class="c-wa" style="padding:0 4px">${chip(x.wa)}</td><td class="c-ha" style="padding:0 4px">${chip(x.ha)}</td><td class="c-wh" style="padding:0 4px">${chip(x.wh)}</td>
              <td class="small muted c-prev" style="padding:0 6px;white-space:nowrap">${p ? '<span class="m-only">ครั้งก่อน </span>' : ''}${p ? `${p.weight_kg ?? '-'} / ${p.height_cm ?? '-'} (${termOfRound(p.round) === termNo ? '' : `ภ.${termOfRound(p.round)} `}ค.${roundInTerm(p.round)})` : ''}</td></tr>`; }).join('')}</tbody>
        </table></div>` : '<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'}
      </div>
      <div class="card" id="summary"></div>
    </div>`;
  if (window.matchMedia('(max-width: 980px)').matches) $('#cols', el).style.gridTemplateColumns = 'minmax(0,1fr)';

  const drawSummary = () => {
    const xs = roster.map((s) => ({ s, x: calc(s), m: cur(s.id) })).filter((o) => o.m && (o.m.weight_kg != null || o.m.height_cm != null));
    const cnt = (k, label) => xs.filter((o) => o.x[k] === label).length;
    const good = xs.filter((o) => o.x.goodShape).length;
    const judged = xs.filter((o) => o.x.goodShape !== null).length;
    $('#summary', el).innerHTML = `<h3>สรุป${roundLabel(pref.round)}</h3>
      <div class="small">ชั่ง/วัดแล้ว ${xs.length}/${roster.length} คน · ${esc(thaiDate(pref.date))}</div>
      <div class="stat"><b>${judged ? Math.round(100 * good / judged) : '–'}${judged ? '%' : ''}</b><span>สูงดีสมส่วน (${good}/${judged} คน)</span></div>
      <div class="small"><b>น้ำหนักตามส่วนสูง</b>${[...WH, OUT_OF_TABLE].map((l) => cnt('wh', l) ? `<div>${chip(l)} ${cnt('wh', l)} คน</div>` : '').join('')}</div>
      <div class="small"><b>ส่วนสูงตามอายุ</b>${[...HA, OUT_OF_TABLE].map((l) => cnt('ha', l) ? `<div>${chip(l)} ${cnt('ha', l)} คน</div>` : '').join('')}</div>
      ${xs.some((o) => o.x.wh === OUT_OF_TABLE || o.x.ha === OUT_OF_TABLE || o.x.wa === OUT_OF_TABLE) ? `<p class="small muted">"${OUT_OF_TABLE}" = ส่วนสูงหรืออายุเกินช่วงของตารางอ้างอิงที่ใช้อยู่ (ตาราง Excel เดิมมีส่วนสูงชายถึง 180 ซม. หญิงถึง 170 ซม. และอายุถึง 18 ปี 11 เดือน)</p>` : ''}`;
  };
  if (roster.length) drawSummary();
  const drawDateWarn = () => { const w = $('#dwarn', el); w.hidden = inTerm(pref.date);
    w.textContent = w.hidden ? '' : `วันที่ชั่ง/วัด ${thaiDate(pref.date)} ไม่อยู่ในช่วงภาคเรียนที่ ${termNo} (${thaiDate(range.from)} – ${thaiDate(range.to)}) ตรวจสอบว่าเลือกภาคเรียน/ครั้งที่ถูกต้อง`; };
  drawDateWarn();

  const refreshRow = (sid, flash) => {
    const tr = el.querySelector(`tr[data-sid="${sid}"]`); if (!tr) return;
    const s = roster.find((x) => x.id === sid); const x = calc(s);
    tr.querySelector('.c-age').textContent = ageText(x.months);
    tr.querySelector('.c-wa').innerHTML = chip(x.wa); tr.querySelector('.c-ha').innerHTML = chip(x.ha); tr.querySelector('.c-wh').innerHTML = chip(x.wh);
    if (flash) { tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1300); }
    drawSummary();
  };

  const LIMIT = { weight_kg: [5, 200, 'น้ำหนัก'], height_cm: [50, 220, 'ส่วนสูง'] };
  const commit = (inp, raw) => {
    const f = inp.dataset.f; const sid = inp.dataset.sid; const t = String(raw).trim().replace(',', '.');
    const v = t === '' ? null : Number(t);
    const [lo, hi, name] = LIMIT[f];
    if (v !== null && (!Number.isFinite(v) || v < lo || v > hi)) { inp.classList.add('bad'); toast(`${name} "${t}" ไม่สมเหตุสมผล (ควรอยู่ระหว่าง ${lo}–${hi})`, 'err'); return false; }
    inp.classList.remove('bad'); inp.value = v ?? '';
    const key = `${sid}|${pref.round}`;
    const row = { ...(byKey.get(key) || {}), student_id: sid, academic_year: year, round: pref.round, measured_on: byKey.get(key)?.measured_on || pref.date, [f]: v };
    byKey.set(key, row); refreshRow(sid);
    (async () => {
      try {
        if (row.weight_kg == null && row.height_cm == null) { if (row.id) await ctx.db.remove('health_measurements', { id: row.id }); byKey.delete(key); }
        else {
          const { id, ...data } = row;
          const [saved] = await ctx.db.upsert('health_measurements', [{ ...data, weight_kg: row.weight_kg ?? null, height_cm: row.height_cm ?? null }], 'student_id,academic_year,round');
          if (saved) byKey.set(key, { ...row, ...saved });
        }
      } catch (err) { toast(err.message, 'err'); }
    })();
    return true;
  };
  const grid = $('#hgrid', el);
  if (grid && canEdit) attachGrid(grid, commit);
  if (grid) attachSheet(grid, { cell: 'input.gc', canEdit, get: (el) => el.value, set: (el, v) => commit(el, v) });

  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; render(el, ctx); });
  $('#term', el).addEventListener('change', (e) => { pref.round = roundsOfTerm(e.target.value)[0]; pref.date = null; render(el, ctx); });
  $('#round', el).addEventListener('change', (e) => { pref.round = Number(e.target.value); pref.date = null; render(el, ctx); });
  $('#date', el).addEventListener('change', async (e) => {
    if (!e.target.value) return;
    pref.date = e.target.value;
    const mine = roster.map((s) => cur(s.id)).filter((m) => m?.id && m.measured_on !== pref.date);
    try {
      for (const m of mine) { await ctx.db.update('health_measurements', { id: m.id }, { measured_on: pref.date }); m.measured_on = pref.date; }
      if (mine.length) toast(`เปลี่ยนวันที่ชั่ง/วัด${roundLabel(pref.round)} แล้ว ${mine.length} คน`);
    } catch (err) { toast(err.message, 'err'); }
    roster.forEach((s) => refreshRow(s.id));
    drawDateWarn();
  });

  return ctx.db.subscribe('health_measurements', null, (ev) => {
    const r = ev.type === 'DELETE' ? ev.old : ev.new;
    if (!ids.includes(r.student_id) && ev.type !== 'DELETE') return;
    if (ev.type === 'DELETE') { for (const [k, v] of byKey) if (v.id === r.id) { byKey.delete(k); refreshRow(v.student_id, true); } return; }
    if (r.academic_year !== year) return;
    const key = `${r.student_id}|${r.round}`; const old = byKey.get(key);
    if (old && Number(old.weight_kg) === Number(r.weight_kg) && Number(old.height_cm) === Number(r.height_cm) && old.measured_on === r.measured_on) return;
    byKey.set(key, r);
    if (r.round !== pref.round) return;
    const tr = el.querySelector(`tr[data-sid="${r.student_id}"]`);
    tr?.querySelectorAll('input.gc').forEach((inp) => { if (document.activeElement !== inp) inp.value = r[inp.dataset.f] ?? ''; });
    refreshRow(r.student_id, true);
  });
}
