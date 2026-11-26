// รายงานระยะที่ 3: ภาวะโภชนาการ (รายชื่อ + ความชุก + รายชื่อที่ต้องดูแล) และสรุปคุณลักษณะ/กิจกรรม
import { esc, fullName, levelName, thaiDate } from '../util.js?v=2569.11.1-45';
import { getRoster, termRoster, enrolledOn, inTermList, loadGrowthRef, getBirthDates, termOfRound, roundLabel, roundsOfTerm, roundInTerm } from '../data.js?v=2569.11.1-45';
import { classify, ageMonths, WA, HA, WH, OUT_OF_TABLE, TRAIT_KINDS, ACTIVITIES, modeSummary } from '../assess.js?v=2569.11.1-45';
import { head, signs, termText } from './report-common.js?v=2569.11.1-45';

const academic = (ctx) => ({ name: ctx.settings.academic_head_name, role: 'หัวหน้างานวิชาการ' });
const director = (ctx) => ({ name: ctx.settings.director_name, role: ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน' });

export async function nutritionReport(ctx, room, round) {
  const everyone = await getRoster(ctx.db, room.id, { includeLeft: true });
  const ids = everyone.map((s) => s.id);
  const [ref, births, rows] = await Promise.all([
    loadGrowthRef(ctx.db, ctx.settings.growth_ref_set || 'excel'),
    getBirthDates(ctx.db, ids),
    ids.length ? ctx.db.select('health_measurements', { in: { student_id: ids }, eq: { academic_year: room.academic_year, round } }) : [],
  ]);
  if (!ref.size) return '<div class="empty">ยังไม่มีตารางอ้างอิงการเจริญเติบโต (ตั้งค่าระบบ → ตารางโภชนาการ)</div>';
  const by = Object.fromEntries(rows.map((r) => [r.student_id, r]));
  const date = rows.map((r) => r.measured_on).sort().at(-1);
  // รายชื่อ = นักเรียนที่อยู่ในห้องวันที่ชั่ง/วัดครั้งนี้ (ถ้ายังไม่ได้ชั่ง ใช้รายชื่อสิ้นภาคเรียนของครั้งนี้)
  const term = ctx.terms?.find((t) => t.academic_year === room.academic_year && t.term === termOfRound(round)) || ctx.term;
  const roster = date ? everyone.filter((s) => enrolledOn(s, date)) : everyone.filter((s) => inTermList(s, term));
  const list = roster.map((s) => { const m = by[s.id]; const months = m ? ageMonths(births[s.id], m.measured_on) : null;
    return { s, m, months, ...(m ? classify(ref, { sex: s.gender, months, weight: m.weight_kg, height: m.height_cm }) : {}) }; });
  const measured = list.filter((x) => x.m);
  const age = (mo) => (mo === null || mo === undefined ? '' : `${Math.floor(mo / 12)}`);
  const ageM = (mo) => (mo === null || mo === undefined ? '' : `${mo % 12}`);
  const page1 = `<div class="a4 land" style="font-size:13px">
    ${head(ctx, `ผลการประเมินภาวะโภชนาการ ชั้น${levelName(room.level)}/${room.room}`, `${roundLabel(round)} · วันที่ชั่งน้ำหนัก/วัดส่วนสูง ${date ? thaiDate(date) : '-'} · ปีการศึกษา ${room.academic_year}`)}
    <table style="font-size:12.5px"><thead><tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th><th rowspan="2">เพศ</th><th colspan="2">อายุ</th>
      <th rowspan="2">น้ำหนัก<br>(กก.)</th><th rowspan="2">ส่วนสูง<br>(ซม.)</th><th colspan="3">ผลการประเมินตามเกณฑ์อ้างอิงของกรมอนามัย</th></tr>
      <tr><th>ปี</th><th>เดือน</th><th>น้ำหนักตามเกณฑ์อายุ</th><th>ส่วนสูงตามเกณฑ์อายุ</th><th>น้ำหนักตามเกณฑ์ส่วนสูง</th></tr></thead>
      <tbody>${list.map((x) => `<tr><td>${x.s.number ?? ''}</td><td class="l">${esc(fullName(x.s))}</td><td>${esc(x.s.gender === 'ช' ? 'ชาย' : x.s.gender === 'ญ' ? 'หญิง' : '')}</td>
        <td>${age(x.months)}</td><td>${ageM(x.months)}</td><td>${x.m?.weight_kg ?? ''}</td><td>${x.m?.height_cm ?? ''}</td>
        <td>${esc(x.wa ?? '')}</td><td>${esc(x.ha ?? '')}</td><td>${esc(x.wh ?? '')}</td></tr>`).join('')}</tbody></table>
    <div class="legend">ชั่ง/วัดแล้ว ${measured.length} จาก ${roster.length} คน · ตารางอ้างอิง: ${esc((ctx.settings.growth_ref_set || 'excel') === 'excel' ? 'ตารางจากไฟล์ Excel เดิม' : ctx.settings.growth_ref_set)}</div>
    ${signs(ctx, room, [academic(ctx)])}
  </div>`;

  const block = (title, key, labels) => {
    const row = (l) => { const c = (g) => measured.filter((x) => x[key] === l && (!g || x.s.gender === g)).length; const all = c();
      return `<tr><td class="l">${esc(l)}</td><td>${c('ช')}</td><td>${c('ญ')}</td><td>${all}</td><td>${measured.length ? (100 * all / measured.length).toFixed(1) : '-'}</td></tr>`; };
    return `<tr><th class="l" colspan="5" style="background:#eee">${esc(title)}</th></tr>${labels.filter((l) => l !== OUT_OF_TABLE || measured.some((x) => x[key] === l)).map(row).join('')}`;
  };
  const good = measured.filter((x) => x.goodShape).length; const judged = measured.filter((x) => x.goodShape !== null).length;
  const names = (pred) => list.filter(pred).map((x) => `${x.s.number ?? ''}. ${esc(fullName(x.s))}`).join('<br>') || '-';
  const page2 = `<div class="a4">
    ${head(ctx, `สรุปภาวะโภชนาการ ชั้น${levelName(room.level)}/${room.room}`, `${roundLabel(round)} · ปีการศึกษา ${room.academic_year}`)}
    <table><thead><tr><th class="l">ภาวะโภชนาการ</th><th>ชาย</th><th>หญิง</th><th>รวม</th><th>ร้อยละ</th></tr></thead>
      <tbody>${block('น้ำหนักตามเกณฑ์ส่วนสูง', 'wh', [...WH, OUT_OF_TABLE])}${block('ส่วนสูงตามเกณฑ์อายุ', 'ha', [...HA, OUT_OF_TABLE])}${block('น้ำหนักตามเกณฑ์อายุ', 'wa', [...WA, OUT_OF_TABLE])}
      <tr><th class="l">สูงดีสมส่วน</th><td>${measured.filter((x) => x.goodShape && x.s.gender === 'ช').length}</td><td>${measured.filter((x) => x.goodShape && x.s.gender === 'ญ').length}</td>
        <td>${good}</td><td>${judged ? (100 * good / judged).toFixed(1) : '-'}</td></tr></tbody></table>
    <h2 style="margin-top:8mm;font-size:16px;text-align:left">นักเรียนที่ควรได้รับการดูแล</h2>
    <table style="font-size:12.5px"><thead><tr><th>เตี้ย / ค่อนข้างเตี้ย</th><th>ผอม / ค่อนข้างผอม</th><th>อ้วน / เริ่มอ้วน</th><th>น้ำหนักน้อยกว่าเกณฑ์</th></tr></thead>
      <tbody><tr style="vertical-align:top">
        <td class="l">${names((x) => ['เตี้ย', 'ค่อนข้างเตี้ย'].includes(x.ha))}</td><td class="l">${names((x) => ['ผอม', 'ค่อนข้างผอม'].includes(x.wh))}</td>
        <td class="l">${names((x) => ['อ้วน', 'เริ่มอ้วน'].includes(x.wh))}</td><td class="l">${names((x) => x.wa === 'น้ำหนักน้อยกว่าเกณฑ์')}</td></tr></tbody></table>
    <div class="legend">สูงดีสมส่วน = ส่วนสูงตามเกณฑ์อายุตั้งแต่ -1.5 SD ขึ้นไป และน้ำหนักตามเกณฑ์ส่วนสูงอยู่ระหว่าง ±1.5 SD (สมส่วน)</div>
    ${signs(ctx, room, [academic(ctx), director(ctx)])}
  </div>`;
  return page1 + page2;
}

// ---------- น้ำหนัก-ส่วนสูงรายภาคเรียน: 4 ครั้งของภาค + การเปลี่ยนแปลง + ภาวะโภชนาการครั้งล่าสุด ----------
export async function growthReport(ctx, room, termNo) {
  const rounds = roundsOfTerm(termNo);
  const term = ctx.terms?.find((t) => t.academic_year === room.academic_year && t.term === Number(termNo)) || { ...ctx.term, term: Number(termNo) };
  const everyone = await getRoster(ctx.db, room.id, { includeLeft: true });
  const ids = everyone.map((s) => s.id);
  const [ref, births, rows] = await Promise.all([
    loadGrowthRef(ctx.db, ctx.settings.growth_ref_set || 'excel'),
    getBirthDates(ctx.db, ids),
    ids.length ? ctx.db.select('health_measurements', { in: { student_id: ids }, eq: { academic_year: room.academic_year } }) : [],
  ]);
  const mine = rows.filter((r) => rounds.includes(Number(r.round)));
  const by = new Map(mine.map((r) => [`${r.student_id}|${r.round}`, r]));
  // วันที่ของแต่ละครั้ง = วันที่ที่ชั่งมากที่สุดในครั้งนั้น
  const dates = rounds.map((n) => { const cnt = {}; mine.filter((r) => Number(r.round) === n).forEach((r) => { cnt[r.measured_on] = (cnt[r.measured_on] || 0) + 1; });
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null; });
  const roster = everyone.filter((s) => inTermList(s, term) || rounds.some((n) => by.has(`${s.id}|${n}`)));
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const f1 = (v) => (v === null ? '' : String(Math.round(v * 10) / 10));
  const sign = (v) => (v === null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${f1(Math.abs(v))}`);
  const list = roster.map((s) => {
    const ms = rounds.map((n) => by.get(`${s.id}|${n}`) || null);
    const w = ms.map((m) => num(m?.weight_kg)); const h = ms.map((m) => num(m?.height_cm));
    const diff = (xs) => { const v = xs.filter((x) => x !== null); return v.length >= 2 ? v.at(-1) - v[0] : null; };
    const k = ms.map((m, i) => (w[i] !== null && h[i] !== null ? i : -1)).filter((i) => i >= 0).at(-1);
    const last = k === undefined ? null : classify(ref, { sex: s.gender, months: ageMonths(births[s.id], ms[k].measured_on), weight: w[k], height: h[k] });
    return { s, w, h, dw: diff(w), dh: diff(h), last };
  });
  const mean = (xs) => { const v = xs.filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const cnt = (i) => list.filter((x) => x.w[i] !== null || x.h[i] !== null).length;
  const lost = list.filter((x) => x.dw !== null && x.dw < 0);
  const care = list.filter((x) => x.last && (['ผอม', 'ค่อนข้างผอม', 'อ้วน', 'เริ่มอ้วน'].includes(x.last.wh) || ['เตี้ย', 'ค่อนข้างเตี้ย'].includes(x.last.ha)));
  const who = (xs) => xs.map((x) => `${x.s.number ?? ''}. ${esc(fullName(x.s))}`).join(' · ') || '-';
  return `<div class="a4 land" style="font-size:13px">
    ${head(ctx, `บันทึกน้ำหนัก-ส่วนสูง ชั้น${levelName(room.level)}/${room.room}`, `ภาคเรียนที่ ${termNo} ปีการศึกษา ${room.academic_year} · ชั่งน้ำหนัก/วัดส่วนสูงภาคเรียนละ 4 ครั้ง`)}
    <table style="font-size:12px"><thead>
      <tr><th rowspan="3">ที่</th><th rowspan="3" class="l">ชื่อ-สกุล</th><th rowspan="3">เพศ</th>
        ${rounds.map((n) => `<th colspan="2">ครั้งที่ ${roundInTerm(n)}</th>`).join('')}
        <th colspan="2">เปลี่ยนแปลงในภาค</th><th colspan="2">ภาวะโภชนาการ (ครั้งล่าสุด)</th></tr>
      <tr>${dates.map((d) => `<th colspan="2" style="font-weight:400">${d ? esc(thaiDate(d, true)) : '-'}</th>`).join('')}<th rowspan="2">น้ำหนัก<br>(กก.)</th><th rowspan="2">ส่วนสูง<br>(ซม.)</th>
        <th rowspan="2">น้ำหนักตาม<br>ส่วนสูง</th><th rowspan="2">ส่วนสูงตาม<br>อายุ</th></tr>
      <tr>${rounds.map(() => '<th>น้ำหนัก<br>(กก.)</th><th>ส่วนสูง<br>(ซม.)</th>').join('')}</tr></thead>
      <tbody>${list.map((x) => `<tr><td>${x.s.number ?? ''}</td><td class="l" style="white-space:nowrap">${esc(fullName(x.s))}</td><td>${esc(x.s.gender ?? '')}</td>
        ${rounds.map((_, i) => `<td>${f1(x.w[i])}</td><td>${f1(x.h[i])}</td>`).join('')}
        <td${x.dw !== null && x.dw < 0 ? ' style="font-weight:700"' : ''}>${sign(x.dw)}</td><td>${sign(x.dh)}</td>
        <td>${esc(x.last?.wh ?? '')}</td><td>${esc(x.last?.ha ?? '')}</td></tr>`).join('')}
      <tr><th colspan="3" class="l">เฉลี่ย</th>${rounds.map((_, i) => `<th>${f1(mean(list.map((x) => x.w[i])))}</th><th>${f1(mean(list.map((x) => x.h[i])))}</th>`).join('')}
        <th>${sign(mean(list.map((x) => x.dw)))}</th><th>${sign(mean(list.map((x) => x.dh)))}</th><th colspan="2"></th></tr>
      <tr><th colspan="3" class="l">ชั่ง/วัดแล้ว (คน)</th>${rounds.map((_, i) => `<th colspan="2">${cnt(i)} / ${list.length}</th>`).join('')}<th colspan="4"></th></tr></tbody></table>
    <div class="legend" style="text-align:left">
      <div><b>น้ำหนักลดลงระหว่างภาคเรียน (${lost.length} คน):</b> ${who(lost)}</div>
      <div><b>ควรได้รับการดูแล (ผอม/ค่อนข้างผอม/อ้วน/เริ่มอ้วน/เตี้ย/ค่อนข้างเตี้ย ${care.length} คน):</b> ${who(care)}</div>
      <div>เปลี่ยนแปลงในภาค = ครั้งล่าสุดที่ชั่ง/วัด ลบ ครั้งแรกของภาคเรียน · ภาวะโภชนาการแปลตามเกณฑ์อ้างอิงกรมอนามัย${ref.size ? '' : ' (ยังไม่ได้โหลดตารางอ้างอิง จึงยังไม่มีผลแปล)'}</div></div>
    ${signs(ctx, room, [academic(ctx)])}
  </div>`;
}

export async function traitReport(ctx, room) {
  const roster = await termRoster(ctx, room);
  const ids = roster.map((s) => s.id);
  const term = ctx.term.id;
  const [ts, acts] = await Promise.all([
    ids.length ? ctx.db.select('trait_scores', { eq: { term_id: term }, in: { student_id: ids } }) : [],
    ids.length ? ctx.db.select('activity_results', { eq: { term_id: term }, in: { student_id: ids } }) : [],
  ]);
  const kinds = Object.keys(TRAIT_KINDS);
  const sum = (sid, k) => modeSummary(TRAIT_KINDS[k].items.map((_, i) => ts.find((t) => t.student_id === sid && t.kind === k && t.item_no === i + 1)?.score));
  const act = (sid, a) => acts.find((x) => x.student_id === sid && x.activity === a);
  const pf = (p) => (p === true ? 'ผ' : p === false ? 'มผ' : '');
  const res = roster.map((s) => ({ s, k: Object.fromEntries(kinds.map((k) => [k, sum(s.id, k)])) }));
  const dist = (k) => TRAIT_KINDS[k].levels.map((l, i) => `${l} ${res.filter((r) => r.k[k] === i).length}`).join(' · ');
  return `<div class="a4 land" style="font-size:13px">
    ${head(ctx, `สรุปผลการประเมินคุณลักษณะ และกิจกรรมพัฒนาผู้เรียน ชั้น${levelName(room.level)}/${room.room}`, termText(ctx))}
    <table style="font-size:12.5px"><thead><tr><th rowspan="2">ที่</th><th rowspan="2" class="l">ชื่อ-สกุล</th>
      ${kinds.map((k) => `<th rowspan="2">${esc(TRAIT_KINDS[k].short)}</th>`).join('')}<th colspan="${Object.keys(ACTIVITIES).length + 1}">กิจกรรมพัฒนาผู้เรียน</th></tr>
      <tr><th>แนะแนว</th><th>ลูกเสือ</th><th>ชุมนุม</th><th>สังคมฯ</th><th class="l">ชื่อชุมนุม</th></tr></thead>
      <tbody>${res.map(({ s, k }) => `<tr><td>${s.number ?? ''}</td><td class="l">${esc(fullName(s))}</td>
        ${kinds.map((kk) => `<td>${k[kk] === null ? '' : esc(TRAIT_KINDS[kk].levels[k[kk]])}</td>`).join('')}
        ${Object.keys(ACTIVITIES).map((a) => `<td>${pf(act(s.id, a)?.passed)}</td>`).join('')}<td class="l">${esc(act(s.id, 'club')?.club_name ?? '')}</td></tr>`).join('')}</tbody></table>
    <div class="legend">${kinds.map((k) => `<b>${esc(TRAIT_KINDS[k].short)}</b>: ${dist(k)}`).join('<br>')}<br>ผลสรุปแต่ละด้านใช้ฐานนิยมของคะแนนรายข้อ (0–3) ถ้าซ้ำเท่ากันใช้ค่าสูงกว่า</div>
    ${signs(ctx, room, [academic(ctx)])}
  </div>`;
}
