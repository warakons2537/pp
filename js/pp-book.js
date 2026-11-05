// =====================================================================
//  เล่ม ปพ. จากไฟล์ต้นฉบับของโรงเรียน (โปรแกรม ปพ.5-6 ที่โรงเรียนใช้อยู่)
//  นำข้อมูลในระบบไปใส่ "ช่องกรอก" ของไฟล์ต้นฉบับ แล้วให้สูตรเดิมของไฟล์คำนวณทุกหน้าเอง
//  → หน้าตา สูตร และการแบ่งหน้าเหมือนต้นฉบับทุกหน้า
//  ไม่แตะเซลล์ที่ไฟล์ต้นฉบับล็อกไว้ (เช่น ชื่อโรงเรียนที่ผู้พัฒนาโปรแกรมล็อก)
// =====================================================================
import { Template, colNum, colName, excelSerialBE } from './xlsx-template.js?v=2569.11.1-23';
import { levelName } from './util.js?v=2569.11.1-23';
import { getRoster, loadGrowthRef, termRange, inTermList } from './data.js?v=2569.11.1-23';
import { ageMonths, classify } from './assess.js?v=2569.11.1-23';
import { scoreColIndex } from './score-columns.js?v=2569.11.1-23';
import { occupationOf, personName, addressShort } from './student-family.js?v=2569.11.1-23';
import { loadCourse, computeCourse } from './grading.js?v=2569.11.1-23';
import { enrollmentCounts } from './yeardata.js?v=2569.11.1-23';

export const MONTHS = [['พ.ค.', 5], ['มิ.ย.', 6], ['ก.ค.', 7], ['ส.ค.', 8], ['ก.ย.', 9], ['ต.ค.', 10], ['พ.ย.', 11], ['ธ.ค.', 12], ['ม.ค.', 1], ['ก.พ.', 2], ['มี.ค.', 3], ['เม.ย.', 4]];
export const SUBJECT_ROWS = [6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];   // แถวในแผ่น "รายวิชา" ของวิชาที่ 1–20
export const BOOK_FIRST = 'ปก ปพ.5 รายชั้น';
export const BOOK_LAST = 'เกรดร้อยละ';
const MAX_STUDENTS = 45;
const ATT = { present: 1, late: 1, sick: 'ป', leave: 'ล', absent: 'ข' };
const NUMERIC_HEADERS = new Set(['ห้อง', 'รหัสนักเรียน', 'อายุ(ปี)', 'จำนวนพี่ชาย', 'จำนวนน้องชาย', 'จำนวนพี่สาว', 'จำนวนน้องสาว', 'เป็นบุตรคนที่', 'รหัสไปรษณีย์ (ทะเบียนบ้าน)']);

// แผ่นงานเริ่มต้นของ "1 เล่ม" = ชุดที่โรงเรียนพิมพ์เป็นหลัก: ตั้งแต่ปก ปพ.5 รายชั้น ถึงเกรดร้อยละ ตามลำดับแท็บ
// (ไม่รวมแผ่นที่ซ่อน วิชาที่ไม่ได้ใช้ ปก ปพ.5 รายวิชา เวลาเรียนเดือน/เวลารวมของอีกภาคเรียน) · term = 1 | 2 (ไม่ระบุ = ทุกภาค)
export function defaultBook(sheets, subjectCount = 20, { term = null } = {}) {
  const names = sheets.map((s) => s.name);
  const a = names.indexOf(BOOK_FIRST); const b = names.indexOf(BOOK_LAST);
  const slice = a >= 0 && b >= a ? sheets.slice(a, b + 1) : sheets;
  const monthTerm = new Map(MONTHS.map(([n], i) => [n, i < 6 ? 1 : 2]));
  return slice.filter((s) => s.state === 'visible').filter((s) => {
    const m = /^วิชาที่ (\d+)$/.exec(s.name); if (m) return Number(m[1]) <= subjectCount;
    if (s.name === 'ปก ปพ.5 รายวิชา') return false;
    if (term && monthTerm.has(s.name)) return monthTerm.get(s.name) === term;
    const w = /^เวลา รวม (\d)$/.exec(s.name); if (term && w) return Number(w[1]) === term;
    return true;
  }).map((s) => s.name);
}

// ---------------------------------------------------------------------
//  ตรวจก่อนพิมพ์: หน้าที่หายจากชุดมาตรฐาน และหน้าที่ยังไม่ได้ลงข้อมูล
//  d = ผลของ buildBookData · selected = แผ่นที่จะพิมพ์ · expected = ชุดมาตรฐานของห้อง/ภาคนี้
//  → [{ level: 'err' | 'warn', text }]
// ---------------------------------------------------------------------
export function bookChecks(d, selected, expected = [], term = null) {
  const out = []; const sel = new Set(selected);
  const add = (level, text) => out.push({ level, text });
  const list = (a, n = 6) => (a.length > n ? `${a.slice(0, n).join(', ')} และอีก ${a.length - n} รายการ` : a.join(', '));
  if (!d.students.length) add('err', 'ห้องนี้ยังไม่มีนักเรียน หน้าที่พิมพ์จะว่างทั้งหมด');
  const missing = expected.filter((n) => !sel.has(n));
  if (missing.length) add('warn', `หน้าที่อยู่ในชุดมาตรฐานแต่ยังไม่ได้เลือกพิมพ์ (${missing.length} แผ่น): ${list(missing)}`);
  const gy = d.year - 543;
  const monthsEmpty = []; const roundsEmpty = new Set(); const extraSubj = [];
  for (const n of selected) {
    const mi = MONTHS.findIndex(([m]) => m === n);
    if (mi >= 0 && (!term || (mi < 6 ? 1 : 2) === term)) {
      const mo = MONTHS[mi][1]; const y = mo >= 5 ? gy : gy + 1; const pre = `${y}-${String(mo).padStart(2, '0')}-`;
      if (!d.students.some((st) => Object.keys(st.att).some((k) => k.startsWith(pre)))) monthsEmpty.push(n);
    }
    const r = /^(?:โภชนาการ|ความชุก|สรุปโภชนาการ) (\d)$/.exec(n);
    if (r && !d.rounds[Number(r[1]) - 1]) roundsEmpty.add(Number(r[1]));
    const sm = /^วิชาที่ (\d+)$/.exec(n);
    if (sm && Number(sm[1]) > d.subjects.length) extraSubj.push(n);
  }
  if (monthsEmpty.length) add('warn', `ยังไม่ได้ลงเวลาเรียนเดือน ${list(monthsEmpty)} (หน้าจะว่าง)`);
  if (selected.includes('น้ำหนัก-ส่วนสูง') && !d.rounds.some(Boolean)) add('warn', 'ยังไม่ได้ลงน้ำหนัก-ส่วนสูงเลย (หน้าจะว่าง)');
  if (roundsEmpty.size) add('warn', `ยังไม่ได้ชั่งน้ำหนัก-วัดส่วนสูงครั้งที่ ${[...roundsEmpty].sort().join(', ')} (หน้าโภชนาการ/ความชุกของครั้งนั้นจะว่าง)`);
  if (extraSubj.length) add('warn', `เลือกแผ่นที่ห้องนี้ไม่มีรายวิชา (${list(extraSubj)}) หน้าจะว่าง · ห้องนี้มี ${d.subjects.length} วิชา`);
  d.subjects.forEach((sub, i) => {
    if (!sel.has(`วิชาที่ ${i + 1}`)) return;
    const none = sub.rows.filter((r) => r.scores.every((x) => x === null) && r.ind.every((x) => !x) && (r.final === null || r.final === undefined)).length;
    if (!sub.rows.length) return;
    if (none === sub.rows.length) add('warn', `วิชา ${sub.name || i + 1} ยังไม่ได้ลงคะแนน/ตัวชี้วัดเลย`);
    else if (none) add('warn', `วิชา ${sub.name || i + 1}: ${none} คนยังไม่ได้ลงคะแนน/ตัวชี้วัด`);
  });
  const lack = (name, field, label) => {
    if (!sel.has(name) || !d.students.length) return;
    const n = d.students.filter((st) => field(st).every((x) => x === null || x === undefined)).length;
    if (n === d.students.length) add('warn', `ยังไม่ได้ลง${label}เลย (หน้าจะว่าง)`);
    else if (n) add('warn', `${label}: ${n} คนยังไม่ได้ลง`);
  };
  lack('คุณลักษณะอันพึงประสงค์', (st) => [...st.trait8, ...st.rtw], 'คุณลักษณะอันพึงประสงค์/การอ่านคิดวิเคราะห์');
  lack('สมรรถนะ', (st) => [...st.values12, ...st.comp5], 'ค่านิยม/สมรรถนะ');
  lack('กิจกรรมพัฒนาผู้เรียน', (st) => st.acts, 'กิจกรรมพัฒนาผู้เรียน');
  if (!d.subjects.length && ['คะแนนรายชั้น', 'เกรดรายชั้น', 'เกรดร้อยละ'].some((n) => sel.has(n))) add('warn', 'ห้องนี้ยังไม่มีรายวิชาในภาคเรียนนี้ หน้าสรุปคะแนน/เกรดจะว่าง');
  // ข้อมูลที่ต้องกรอกเพิ่ม (บอกด้วยว่าไปแก้ที่ไหน)
  const some = (a, f) => a.filter(f).length;
  const nameless = (label, n) => n && add('warn', `${label}: ${n} คนยังไม่ได้กรอก (เมนู "นักเรียน" → แก้ไข)`);
  if (sel.has('ชื่อนักเรียน')) { nameless('เลขประจำตัวประชาชน', some(d.students, (st) => !st.citizen)); nameless('วันเกิด', some(d.students, (st) => !st.birth)); nameless('เลขประจำตัวนักเรียน', some(d.students, (st) => !st.s.student_code)); }
  if (sel.has('บิดามารดา')) nameless('ชื่อบิดา/มารดา', some(d.students, (st) => !st.fam?.father && !st.fam?.mother));
  if (sel.has('ผู้ปกครอง')) { nameless('ผู้ปกครอง', some(d.students, (st) => !st.fam?.guardian)); nameless('ที่อยู่ปัจจุบัน', some(d.students, (st) => !st.addrShort)); }
  if (sel.has(BOOK_FIRST)) {
    const miss = [['director_name', 'ชื่อผู้อำนวยการ'], ['academic_head_name', 'หัวหน้างานวิชาการ'], ['area_office', 'เขตพื้นที่การศึกษา']].filter(([k]) => !d.school?.[k]).map(([, l]) => l);
    if (miss.length) add('warn', `ปก ปพ.5: ยังไม่ได้กรอก ${miss.join(' · ')} (ตั้งค่าระบบ → โรงเรียน)`);
    if (!d.homeroom?.length) add('warn', 'ปก ปพ.5: ห้องนี้ยังไม่มีครูประจำชั้น (ตั้งค่าระบบ → ห้องเรียน)');
    if (!d.approveDate) add('warn', 'ปก ปพ.5: ยังไม่ได้กำหนดวันที่อนุมัติผลการเรียน (ตั้งค่าระบบ → ภาคเรียน)');
  }
  if (sel.has(BOOK_FIRST) && !d.school?.school_name) add('warn', 'ยังไม่ได้ตั้งชื่อโรงเรียนในตั้งค่าระบบ');
  for (const w of d.warnings || []) add('warn', w);
  return out;
}

// ---------------------------------------------------------------------
//  รวบรวมข้อมูลห้อง 1 ห้อง 1 ภาคเรียน
// ---------------------------------------------------------------------
export async function buildBookData(ctx, room) {
  const { db } = ctx; const term = ctx.term;
  const everyone = await getRoster(db, room.id, { includeLeft: true });     // รวมคนที่ย้ายออก (ใช้นับจำนวนในปก ปพ.5)
  // รายชื่อในเล่มของภาคเรียนนี้ = นักเรียนที่อยู่ถึงสิ้นภาค (ย้ายเข้ากลางปีไม่อยู่ในภาคก่อนหน้า · ย้ายออกหลังสิ้นภาคยังอยู่ในภาคนั้น)
  const live = everyone.filter((s) => inTermList(s, term));
  const roster = live.slice(0, MAX_STUDENTS);
  const ids = roster.map((s) => s.id);
  const warnings = [];
  if (live.length > MAX_STUDENTS) warnings.push(`ไฟล์ต้นฉบับรองรับ ${MAX_STUDENTS} คน นักเรียนเกินจากนี้จะไม่อยู่ในเล่ม`);
  let priv = {};
  try { priv = Object.fromEntries((ids.length ? await db.select('student_private', { in: { student_id: ids } }) : []).map((p) => [p.student_id, p])); } catch { warnings.push('ไม่มีสิทธิ์อ่านข้อมูลส่วนบุคคลของนักเรียน (ข้อมูล DMC จะว่าง)'); }

  // เวลาเรียนทั้งปีการศึกษา (พ.ค.–เม.ย.)
  const gy = term.academic_year - 543;
  const att = ids.length ? await db.select('daily_attendance', { eq: { classroom_id: room.id }, gte: { date: `${gy}-05-01` }, lte: { date: `${gy + 1}-04-30` } }) : [];

  const [hm, traits, acts, comments] = await Promise.all([
    ids.length ? db.select('health_measurements', { in: { student_id: ids }, eq: { academic_year: term.academic_year } }).catch(() => []) : [],
    ids.length ? db.select('trait_scores', { eq: { term_id: term.id }, in: { student_id: ids } }) : [],
    ids.length ? db.select('activity_results', { eq: { term_id: term.id }, in: { student_id: ids } }) : [],
    ids.length ? db.select('homeroom_comments', { eq: { term_id: term.id }, in: { student_id: ids } }) : [],
  ]);

  const courses = ctx.courses.filter((k) => k.classroom_id === room.id && k.term_id === term.id).slice(0, 20);
  if (ctx.courses.filter((k) => k.classroom_id === room.id && k.term_id === term.id).length > 20) warnings.push('ไฟล์ต้นฉบับมีวิชาได้ 20 วิชา วิชาที่เกินจะไม่อยู่ในเล่ม');
  const rounding = ctx.settings.score_rounding || 'floor';
  const subjects = [];
  for (const k of courses) {
    const data = await loadCourse(db, k);
    const calc = computeCourse(k, data, roster, rounding);
    const inds = data.items.filter((i) => i.kind === 'indicator');
    const sc = data.items.filter((i) => i.kind === 'score');
    const fin = data.items.filter((i) => i.kind === 'final');
    if (inds.length > 36) warnings.push(`${k.subject?.name}: ตัวชี้วัดเกิน 36 ช่อง ใส่ได้เฉพาะ 36 ช่องแรก`);
    if (sc.length > 48) warnings.push(`${k.subject?.name}: ช่องคะแนนเกิน 48 ช่อง ใส่ได้เฉพาะ 48 ช่องแรก`);
    else if (sc.length > 12 && subjects.length >= 10) warnings.push(`${k.subject?.name}: วิชาลำดับที่ 11 ขึ้นไปในใบ ปพ.5 แสดงช่องคะแนนได้ 12 ช่อง (มี ${sc.length} ช่อง) ช่องที่เกินจะไม่ขึ้นในใบ`);
    subjects.push({
      code: k.subject?.code ?? '', name: k.subject?.name ?? '', credits: k.subject?.credits ?? (k.subject?.hours_per_year ? k.subject.hours_per_year / 40 : null),
      group: k.subject?.subject_group ?? '', teachers: k.teachers.map((t) => t.full_name).filter(Boolean),
      mid: k.midterm_ratio, fin: k.final_ratio,
      indicators: inds.slice(0, 36).map((i) => i.code || i.title || ''),
      items: sc.slice(0, 48).map((i) => ({ title: i.title || '', max: Number(i.max_score) })),
      rows: roster.map((s) => {
        const x = calc[s.id] || {}; const res = data.results[s.id] || {};
        return {
          ind: inds.slice(0, 36).map((i) => { const p = data.scoreMap.get(`${i.id}|${s.id}`)?.passed; return p === true ? 'ผ' : p === false ? 'มผ' : null; }),
          scores: sc.slice(0, 48).map((i) => { const v = data.scoreMap.get(`${i.id}|${s.id}`)?.score; return v === null || v === undefined ? null : Number(v); }),
          final: fin.some((i) => data.scoreMap.get(`${i.id}|${s.id}`)?.score != null) ? x.final : null,
          special: res.special || (x.grade === 'มส' ? 'มส' : null),
          calc: { mid: x.mid ?? null, final: x.final ?? null, total: x.total ?? null, grade: x.grade ?? null, indPass: x.indPass ?? 0, indFail: x.indFail ?? 0, indicator: x.indicator ?? null },   // ผลที่แอปคำนวณ (แบบฟอร์มในตัว)
        };
      }),
    });
  }

  // น้ำหนัก-ส่วนสูง 4 ครั้ง
  const rounds = [1, 2, 3, 4].map((n) => {
    const rows = hm.filter((h) => Number(h.round) === n);
    const cnt = {}; rows.forEach((h) => { cnt[h.measured_on] = (cnt[h.measured_on] || 0) + 1; });
    const date = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return { date, by: Object.fromEntries(rows.map((h) => [h.student_id, h])) };
  });

  // ตารางอ้างอิงโภชนาการ (กรมอนามัย) สำหรับแปลผลในแบบพิมพ์ ปพ.5 ในตัว
  let growthRef = null;
  try { growthRef = await loadGrowthRef(db, ctx.settings.growth_ref_set || 'excel'); } catch { /* ไม่มีสิทธิ์/ยังไม่ได้โหลด */ }
  if ((!growthRef || !growthRef.size) && hm.length) warnings.push('ยังไม่ได้โหลดตารางโภชนาการ (ตั้งค่าระบบ → ตารางโภชนาการ) หน้าภาวะโภชนาการ/ความชุกจะไม่มีผลแปล');

  const tv = (sid, kind, n) => traits.find((t) => t.student_id === sid && t.kind === kind && t.item_no === n)?.score ?? null;
  const act = (sid, a) => acts.find((x) => x.student_id === sid && x.activity === a);
  const students = roster.map((s, i) => {
    const p = priv[s.id] || {};
    const ad = p.address || {};
    const addr = [ad.house_no && `บ้านเลขที่ ${ad.house_no}`, ad.moo && `หมู่ที่ ${ad.moo}`, ad.road && ad.road !== '-' && `ถนน${ad.road}`, ad.subdistrict && `ตำบล${ad.subdistrict}`,
      ad.district && `อำเภอ${ad.district}`, ad.province && `จังหวัด${ad.province}`, ad.postcode].filter(Boolean).join(' ');
    return {
      no: s.number ?? i + 1, s, raw: p.dmc_raw || {}, birth: p.birth_date || null, citizen: p.citizen_id || null,
      occ: ['father', 'mother', 'guardian'].map((who) => occupationOf(p, who)),      // อาชีพ: ที่กรอกในระบบ หรือจากข้อมูลดิบ DMC
      // ข้อมูลครอบครัวสำหรับแบบพิมพ์ ปพ.5 ในตัว (บิดามารดา / ผู้ปกครอง)
      fam: { father: personName(p.father), mother: personName(p.mother), guardian: personName(p.guardian), relation: p.guardian?.relation || null },
      addrShort: addressShort(ad),
      address: addr || null,
      comment: comments.find((c) => c.student_id === s.id)?.comment || null,
      trait8: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => tv(s.id, 'trait8', n)),
      rtw: [1, 2, 3, 4, 5].map((n) => tv(s.id, 'rtw', n)),
      values12: Array.from({ length: 12 }, (_, k) => tv(s.id, 'values12', k + 1)),
      comp5: [1, 2, 3, 4, 5].map((n) => tv(s.id, 'competency5', n)),
      acts: ['guidance', 'scout', 'club', 'social'].map((a) => act(s.id, a)?.passed ?? null),
      club: act(s.id, 'club')?.club_name || null,
      health: rounds.map((r) => r.by[s.id] || null),
      // อายุ + ผลแปลภาวะโภชนาการแต่ละครั้ง (วันที่ชั่งของครั้งนั้น)
      nut: rounds.map((r) => {
        const h = r.by[s.id]; const weight = h?.weight_kg == null ? null : Number(h.weight_kg); const height = h?.height_cm == null ? null : Number(h.height_cm);
        const months = ageMonths(p.birth_date, r.date);
        return { date: r.date, months, weight, height, ...classify(growthRef, { sex: s.gender, months, weight, height }) };
      }),
      att: Object.fromEntries(att.filter((a) => a.student_id === s.id).map((a) => [a.date, ATT[a.status] ?? null])),
    };
  });

  return {
    level: levelName(room.level), levelShort: room.level, room: room.room, term: term.term, year: term.academic_year,
    counts: enrollmentCounts(everyone, term), termFrom: termRange(term).from, termTo: termRange(term).to,
    school: ctx.settings, students, subjects, rounds: rounds.map((r) => r.date), warnings, approveDate: term.approve_date || null,
    homeroom: (ctx.homeroomTeachers?.(room.id) || []).map((x) => x.full_name).filter(Boolean),
  };
}

// ---------------------------------------------------------------------
//  ใส่ข้อมูลลงไฟล์ต้นฉบับ
// ---------------------------------------------------------------------
export function fillBook(t, d) {
  const report = { written: 0, skipped: [], missing: [], warnings: [...(d.warnings || [])] };
  const N = MAX_STUDENTS;
  const put = (name, edits) => {
    if (!t.sheet(name)) { report.missing.push(name); return; }
    const r = t.write(name, edits); report.written += r.written;
    if (r.skipped.length) report.skipped.push(`${name}: ${r.skipped.length} ช่อง`);
  };
  // ล้างค่าเดิมในช่วง แล้วเขียนค่าใหม่ทับ
  const plan = (name, ranges) => {
    const m = new Map();
    for (const [c1, r1, c2, r2] of ranges) for (const ref of t.existing(name, colNum(c1), r1, colNum(c2), r2)) m.set(ref, { clear: true });
    return m;
  };
  const v = (x) => ({ v: x === undefined ? null : x });

  // ---------- รายวิชา ----------
  {
    const m = plan('รายวิชา', [['B', 6, 'F', 26]]);
    m.set('B2', v(d.level)); m.set('B3', v(d.term)); m.set('B4', v(d.year));
    d.subjects.forEach((s, i) => {
      const r = SUBJECT_ROWS[i];
      m.set(`B${r}`, v(s.code)); m.set(`C${r}`, v(s.name)); m.set(`D${r}`, v(s.credits)); m.set(`E${r}`, v(s.group)); m.set(`F${r}`, v(s.teachers.join(', ')));
    });
    put('รายวิชา', m);
  }

  // ---------- ข้อมูลนักเรียน (แบบไฟล์ DMC) ----------
  if (t.sheet('ข้อมูลนักเรียน')) {
    const name = 'ข้อมูลนักเรียน';
    const headers = [];
    for (let c = 1; c <= 80; c++) { const h = t.readText(name, `${colName(c)}2`); if (h) headers.push([c, h.trim()]); }
    const m = new Map();
    for (const ref of t.existing(name, 1, 3, 200, 1000)) m.set(ref, { clear: true });
    const be = (iso) => { if (!iso) return null; const [y, mo, dd] = iso.split('-'); return `${dd}/${mo}/${Number(y) + 543}`; };
    d.students.forEach((st, i) => {
      const r = 3 + i; const s = st.s; const raw = st.raw;
      const derived = {
        'รหัสโรงเรียน': d.school.school_code, 'ชื่อโรงเรียน': d.school.school_name, 'เลขประจำตัวประชาชน': st.citizen, 'ชั้น': d.levelShort, 'ห้อง': d.room,
        'รหัสนักเรียน': s.student_code,
        // ไฟล์ต้นฉบับแปลงเพศด้วย IF(เพศ="ช","ชาย","หญิง") ถ้าใส่ "ชาย" ตามไฟล์ DMC ทุกคนจะกลายเป็นหญิง (และแปลผลโภชนาการผิดเกณฑ์) จึงใส่ ช/ญ
        'เพศ': s.gender || null, 'คำนำหน้าชื่อ': s.prefix, 'ชื่อ': s.first_name, 'นามสกุล': s.last_name,
        'ชื่อ (อังกฤษ)': s.first_name_en, 'นามสกุล (อังกฤษ)': s.last_name_en, 'วันเกิด': be(st.birth),
      };
      for (const [c, h] of headers) {
        let val = h in derived && (derived[h] || h === 'เพศ') ? derived[h] : raw[h] ?? null;
        if (val !== null && NUMERIC_HEADERS.has(h) && /^\d{1,9}$/.test(String(val)) && !/^0/.test(String(val))) val = Number(val);
        if (val !== null && val !== '') m.set(`${colName(c)}${r}`, v(val));
      }
    });
    put(name, m);
  }

  // ---------- ข้อมูลเพิ่มเติม (อาชีพ ที่อยู่ ความเห็น) ----------
  {
    const m = plan('ข้อมูลเพิ่มเติม', [['F', 2, 'H', N + 1], ['W', 2, 'AE', N + 1], ['AK', 2, 'AT', N + 1]]);
    d.students.forEach((st, i) => {
      const r = 2 + i;
      ['W', 'X', 'Y'].forEach((c, k) => { if (st.occ[k]) m.set(`${c}${r}`, v(st.occ[k])); });
      if (st.address) m.set(`Z${r}`, v(st.address));
      if (st.comment) m.set(`AA${r}`, v(st.comment));
    });
    put('ข้อมูลเพิ่มเติม', m);
  }

  // ---------- เวลาเรียนรายเดือน ----------
  const gy = d.year - 543;
  for (const [sheet, mo] of MONTHS) {
    if (!t.sheet(sheet)) continue;
    const y = mo >= 5 ? gy : gy + 1;
    const days = new Date(y, mo, 0).getDate();
    const m = plan(sheet, [['C', 4, colName(2 + days), 3 + N]]);
    d.students.forEach((st, i) => {
      for (let day = 1; day <= days; day++) {
        const key = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const mark = st.att[key];
        if (mark !== undefined && mark !== null) m.set(`${colName(2 + day)}${4 + i}`, v(mark));
      }
    });
    put(sheet, m);
  }

  // ---------- น้ำหนัก-ส่วนสูง ----------
  {
    const m = plan('น้ำหนัก-ส่วนสูง', [['C', 7, 'J', 6 + N]]);
    ['C', 'E', 'G', 'I'].forEach((c, k) => m.set(`${c}6`, v(d.rounds[k] ? excelSerialBE(d.rounds[k]) : null)));
    d.students.forEach((st, i) => st.health.forEach((h, k) => {
      if (!h) return; const c = 3 + k * 2;
      if (h.weight_kg != null) m.set(`${colName(c)}${7 + i}`, v(Number(h.weight_kg)));
      if (h.height_cm != null) m.set(`${colName(c + 1)}${7 + i}`, v(Number(h.height_cm)));
    }));
    put('น้ำหนัก-ส่วนสูง', m);
  }

  // ---------- วิชาที่ 1–20 ----------
  for (let n = 1; n <= 20; n++) {
    const name = `วิชาที่ ${n}`; if (!t.sheet(name)) continue;
    const s = d.subjects[n - 1];
    const m = plan(name, [['C', 5, 'AL', 5], ['C', 7, 'AL', 6 + N], ['AP', 5, 'CK', 6], ['AP', 7, 'CK', 6 + N], ['CM', 7, 'CM', 6 + N]]);
    // ระดับผลการเรียน: คืนสูตรเดิม (ไฟล์ที่ใช้แล้วอาจมี ร/มส พิมพ์ทับสูตรไว้)
    for (let i = 0; i < N; i++) {
      const r = 7 + i;
      m.set(`CO${r}`, { f: `IF('ข้อมูลนักเรียน-กรอง'!A${r - 5}="","",IF(CN${r}<50,0,IF(CN${r}<55,1,IF(CN${r}<60,1.5,IF(CN${r}<65,2,IF(CN${r}<70,2.5,IF(CN${r}<75,3,IF(CN${r}<80,3.5,4))))))))` });
    }
    if (s) {
      m.set('CI3', v(s.mid)); m.set('CK3', v(s.fin));
      s.indicators.forEach((code, k) => m.set(`${colName(3 + k)}5`, v(code)));
      s.items.forEach((it, k) => { m.set(`${colName(scoreColIndex(k))}5`, v(it.title)); m.set(`${colName(scoreColIndex(k))}6`, v(it.max)); });
      s.rows.forEach((row, i) => {
        const r = 7 + i;
        row.ind.forEach((x, k) => { if (x) m.set(`${colName(3 + k)}${r}`, v(x)); });
        row.scores.forEach((x, k) => { if (x !== null) m.set(`${colName(scoreColIndex(k))}${r}`, v(x)); });
        if (row.final !== null && row.final !== undefined) m.set(`CM${r}`, v(row.final));
        if (row.special) m.set(`CO${r}`, v(row.special));
      });
    }
    put(name, m);
  }

  // ---------- คุณลักษณะ / อ่านคิดวิเคราะห์ ----------
  {
    const m = plan('คุณลักษณะอันพึงประสงค์', [['C', 5, 'L', 4 + N], ['Q', 5, 'U', 4 + N]]);
    d.students.forEach((st, i) => {
      st.trait8.forEach((x, k) => { if (x !== null) m.set(`${colName(3 + k)}${5 + i}`, v(x)); });
      st.rtw.forEach((x, k) => { if (x !== null) m.set(`${colName(colNum('Q') + k)}${5 + i}`, v(x)); });
    });
    put('คุณลักษณะอันพึงประสงค์', m);
  }
  // ---------- ค่านิยม 12 / สมรรถนะ ----------
  {
    const m = plan('สมรรถนะ', [['C', 5, 'N', 4 + N], ['S', 5, 'W', 4 + N]]);
    d.students.forEach((st, i) => {
      st.values12.forEach((x, k) => { if (x !== null) m.set(`${colName(3 + k)}${5 + i}`, v(x)); });
      st.comp5.forEach((x, k) => { if (x !== null) m.set(`${colName(colNum('S') + k)}${5 + i}`, v(x)); });
    });
    put('สมรรถนะ', m);
  }
  // ---------- กิจกรรมพัฒนาผู้เรียน ----------
  {
    const m = plan('กิจกรรมพัฒนาผู้เรียน', [['C', 5, 'K', 4 + N]]);
    const cols = [['C', 'D'], ['E', 'F'], ['H', 'I'], ['J', 'K']];   // [ไม่ผ่าน, ผ่าน] ของ แนะแนว ลูกเสือ ชุมนุม สังคม
    d.students.forEach((st, i) => {
      st.acts.forEach((p, k) => { if (p === true) m.set(`${cols[k][1]}${5 + i}`, v('/')); else if (p === false) m.set(`${cols[k][0]}${5 + i}`, v('/')); });
      if (st.club) m.set(`G${5 + i}`, v(st.club));
    });
    put('กิจกรรมพัฒนาผู้เรียน', m);
  }
  // ---------- ข้อมูลพื้นฐาน (เฉพาะช่องที่ไฟล์ไม่ได้ล็อก) ----------
  {
    const sch = d.school; const m = new Map();
    const set = (ref, x) => { if (x) m.set(ref, v(x)); };
    set('B9', sch.director_name); set('B10', sch.director_title); set('B11', sch.registrar_name); set('B12', sch.academic_head_name);
    if (d.homeroom?.length) set('B13', d.homeroom.join(' / '));
    if (t.sheet('ข้อมูลพื้นฐาน') && m.size) { const r = t.write('ข้อมูลพื้นฐาน', m); report.written += r.written; }
  }
  return report;
}

// ---------------------------------------------------------------------
//  ทั้งขั้นตอน: เปิดไฟล์ต้นฉบับ → ใส่ข้อมูล → จัดหน้า → ไฟล์ใหม่
// ---------------------------------------------------------------------
// เติมข้อมูลลงแม่แบบ (ยังไม่บันทึก) — ใช้ทั้งสร้างไฟล์ Excel และแสดงตัวอย่าง/พิมพ์ในแอป
export async function prepareBook(templateBytes, data, zipOpts) {
  const t = await Template.open(templateBytes, zipOpts);
  const report = fillBook(t, data);
  return { t, report };
}

export async function makeBook(templateBytes, data, { sheets, orientation = {}, fit = {}, adj = {} } = {}, zipOpts) {
  const { t, report } = await prepareBook(templateBytes, data, zipOpts);
  for (const [name, o] of Object.entries(orientation)) if (o && t.sheet(name)) t.setOrientation(name, o);
  for (const [name, f] of Object.entries(fit)) if (f && t.sheet(name)) t.setFit(name, f);
  // ปรับหน้า: ขอบ (นิ้ว) และ % ย่อ/ขยาย (ขนาดตัวอักษร/ระยะบรรทัด/คอลัมน์ใช้เฉพาะตัวอย่างในแอป)
  for (const [name, a] of Object.entries(adj)) {
    if (!a || !t.sheet(name)) continue;
    t.setMargins(name, { top: a.mt, bottom: a.mb, left: a.ml, right: a.mr });
    if (a.scale) t.setScale(name, a.scale);
  }
  if (sheets?.length) t.arrange(sheets);
  const bytes = await t.save();
  return { bytes, report, macro: t.isMacro };
}
