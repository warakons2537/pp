// พิมพ์เอกสาร ปพ.: ปพ.6 รายบุคคล · ปก ปพ.5 รายชั้น · ปก ปพ.5 รายวิชา · ใบรับรองผลการศึกษา
import { esc, $, options, roomName, fullName, levelName, thaiDate, todayIso, toast } from '../util.js?v=2569.10.31-3';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.10.31-3';
import { loadRoomYear, personName } from '../yeardata.js?v=2569.10.31-3';
import { fmtGrade, distribution, GRADE_LABELS, weightOf } from '../grading.js?v=2569.10.31-3';
import { icon } from '../icons.js?v=2569.10.31-3';
import { TRAIT_KINDS, ACTIVITIES, ageText } from '../assess.js?v=2569.10.31-3';
import { bookView } from './pp-book-view.js?v=2569.10.31-3';
import { listView, studentView, missingOf, termsOf } from './pp6-hub.js?v=2569.10.31-3';
import { pp6FormsView } from './pp6-forms-view.js?v=2569.10.31-3';

const DOCS = { book: 'เล่ม ปพ. (เหมือนไฟล์ต้นฉบับ)', pp6: 'ปพ.6 รายบุคคล', coverClass: 'ปก ปพ.5 รายชั้น', coverCourse: 'ปก ปพ.5 รายวิชา', cert: 'ใบรับรองผลการศึกษา' };
const pref = { doc: 'book', room: null, from: 1, to: 99, scope: 'term', page2: true, course: null, pp6View: 'list', stu: null,
  certDate: null, certNo: '', certText: '', certGpa: true };
let cache = { key: null, data: null };

const unit = (s) => (s?.credits != null ? Number(s.credits) : s?.hours_per_year ? `${s.hours_per_year} ชม.` : '');
const g2 = (v) => (v === null || v === undefined ? '' : Number(v).toFixed(2));
const sig = (name, role, date) => `<div>ลงชื่อ.......................................<br>(${esc(name || '.......................................')})<br>${esc(role)}${date ? `<br>วันที่ ${esc(date)}` : ''}</div>`;
const LEVEL_MEANING = [['4', '80–100', 'ดีเยี่ยม'], ['3.5', '75–79', 'ดีมาก'], ['3', '70–74', 'ดี'], ['2.5', '65–69', 'ค่อนข้างดี'],
  ['2', '60–64', 'น่าพอใช้'], ['1.5', '55–59', 'พอใช้'], ['1', '50–54', 'ผ่านเกณฑ์ขั้นต่ำ'], ['0', '0–49', 'ต่ำกว่าเกณฑ์']];

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms : (ctx.myClassrooms.length ? ctx.myClassrooms : ctx.classrooms);
  if (!rooms.length || !ctx.term) { el.innerHTML = '<h1>พิมพ์ ปพ.6 / ปพ.5</h1><div class="empty">ยังไม่มีห้องเรียนหรือภาคเรียน</div>'; return; }
  if (!rooms.some((r) => r.id === pref.room)) pref.room = rooms[0].id;
  pref.certDate ??= todayIso();
  const room = ctx.classroomById[pref.room];
  const inFrame = window.self !== window.top;
  // ปพ.6 รายภาคเรียน: ใช้แบบพิมพ์ในตัว (เหมือนไฟล์ ปพ.5-6 เดิม) · ทั้งปีการศึกษา: แบบที่แอปจัดเอง (ไฟล์เดิมไม่มีแบบรายปี)
  const nativePp6 = pref.doc === 'pp6' && pref.scope === 'term';
  if (pref.doc === 'pp6' && pref.pp6View !== 'paper') return hub(el, ctx, rooms, room);

  el.innerHTML = `
    <div class="page-head"><div><h1>พิมพ์ ปพ.6 / ปพ.5</h1><p>ดูตัวอย่างทุกหน้าก่อนพิมพ์ แต่ละคนขึ้นหน้าใหม่ให้อัตโนมัติ</p></div>
    <div class="row no-print">
      ${pref.doc === 'pp6' ? `<button class="btn btn-pill" id="pp6-back">${icon('back')}กลับไปรายชื่อ</button>` : ''}
      <label class="field">ห้อง<select id="room">${options(rooms, room.id, (r) => `ห้อง ${roomName(r)}`)}</select></label>
      ${['pp6', 'cert'].includes(pref.doc) ? `<label class="field">เลขที่<span class="row" style="gap:4px;align-items:center">
        <input type="number" id="from" min="1" value="${pref.from}" style="width:70px"> ถึง <input type="number" id="to" min="1" value="${pref.to}" style="width:70px"></span></label>` : ''}
      ${pref.doc === 'pp6' && !nativePp6 ? `<label class="field">ช่วงข้อมูล<select id="scope"><option value="term" ${pref.scope === 'term' ? 'selected' : ''}>ภาคเรียนที่ ${ctx.term.term} (ภาคปัจจุบัน)</option>
        <option value="year" ${pref.scope === 'year' ? 'selected' : ''}>ทั้งปีการศึกษา ${room.academic_year}</option></select></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" id="page2" ${pref.page2 ? 'checked' : ''}> พิมพ์หน้า 2 (สุขภาพ ความเห็น เกณฑ์)</label>` : ''}
      ${pref.doc === 'coverCourse' ? '<label class="field">วิชา<select id="course"></select></label>' : ''}
      ${pref.doc === 'book' || nativePp6 ? '' : '<button class="btn btn-primary" id="print">พิมพ์ / บันทึก PDF</button>'}
      ${inFrame && pref.doc !== 'book' ? '<span class="print-note muted">หน้าทดลองนี้เปิดหน้าต่างพิมพ์ไม่ได้ เมื่อติดตั้งแอปจริงจะพิมพ์ได้ทันที</span>' : ''}
    </div></div>
    ${tabsHtml()}
    ${pref.doc === 'cert' ? `<div class="card no-print"><div class="row">
      <label class="field">ออกให้ ณ วันที่<input type="date" id="c-date" value="${pref.certDate}"></label>
      <label class="field">เลขที่ใบรับรองเริ่มต้น<input type="text" id="c-no" value="${esc(pref.certNo)}" placeholder="เช่น 1/2569" style="width:130px"></label>
      <label class="field" style="flex:1 1 280px">ข้อความรับรอง (เว้นว่าง = ใช้ข้อความมาตรฐาน)<input type="text" id="c-text" value="${esc(pref.certText)}" placeholder="เป็นนักเรียนของโรงเรียนนี้จริง กำลังศึกษาอยู่ชั้น…"></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:6px;color:var(--ink)"><input type="checkbox" id="c-gpa" ${pref.certGpa ? 'checked' : ''}> แสดงผลการเรียนเฉลี่ย</label>
    </div></div>` : ''}
    <div class="card print-area" style="background:var(--paper)"><div class="a4-scroll" id="paper"><p class="muted">กำลังรวบรวมข้อมูลทั้งปี…</p></div></div>`;

  const again = () => render(el, ctx);
  wireTabs(el, again);
  $('#pp6-back', el)?.addEventListener('click', () => { pref.pp6View = 'list'; again(); });
  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; pref.from = 1; pref.to = 99; pref.pp6View = 'list'; again(); });
  $('#from', el)?.addEventListener('change', (e) => { pref.from = Number(e.target.value) || 1; again(); });
  $('#to', el)?.addEventListener('change', (e) => { pref.to = Number(e.target.value) || 99; again(); });
  $('#scope', el)?.addEventListener('change', (e) => { pref.scope = e.target.value; again(); });
  $('#page2', el)?.addEventListener('change', (e) => { pref.page2 = e.target.checked; again(); });
  $('#c-date', el)?.addEventListener('change', (e) => { pref.certDate = e.target.value || todayIso(); again(); });
  $('#c-no', el)?.addEventListener('change', (e) => { pref.certNo = e.target.value.trim(); again(); });
  $('#c-text', el)?.addEventListener('change', (e) => { pref.certText = e.target.value.trim(); again(); });
  $('#c-gpa', el)?.addEventListener('change', (e) => { pref.certGpa = e.target.checked; again(); });
  $('#print', el)?.addEventListener('click', () => window.print());

  const paper = $('#paper', el);
  if (pref.doc === 'book') { paper.closest('.card').classList.remove('print-area'); paper.classList.remove('a4-scroll'); paper.closest('.card').style.background = ''; return bookView(paper, ctx, room); }
  try {
    const d = await getData(ctx, room);
    const pt = d.perTerm[ctx.term.id];
    if (pref.doc === 'coverCourse') {
      const sel = $('#course', el);
      sel.innerHTML = options(pt.results.map((r) => r.course), pref.course, (k) => `${k.subject?.code} ${k.subject?.name}`);
      if (!pt.results.some((r) => r.course.id === pref.course)) pref.course = pt.results[0]?.course.id ?? null;
      sel.value = pref.course ?? '';
      sel.addEventListener('change', (e) => { pref.course = e.target.value; again(); });
    }
    const pick = d.roster.filter((s) => (s.number ?? 0) >= pref.from && (s.number ?? 0) <= pref.to);
    if (pref.doc === 'pp6') {
      // ล็อกการพิมพ์: ไม่แสดงคนที่ยังมีวิชาไม่มีเกรดหรือคะแนนไม่ครบ
      const ok = pick.filter((s) => !missingOf(d, termsOf(ctx, d, pref.scope), s).length);
      const skip = pick.length - ok.length;
      if (nativePp6) {
        paper.closest('.card').classList.remove('print-area'); paper.classList.remove('a4-scroll'); paper.closest('.card').style.background = '';
        if (skip) toast(`ไม่แสดง ${skip} คนที่ยังมีวิชาไม่มีเกรดหรือคะแนนไม่ครบ`, 'err');
        return pp6FormsView(paper, ctx, room, ok.map((s) => s.id));
      }
      paper.innerHTML = (skip ? `<div class="empty no-print">ไม่แสดง ${skip} คนที่ยังมีวิชาไม่มีเกรดหรือคะแนนไม่ครบ (ดูได้ที่ "กลับไปรายชื่อ")</div>` : '')
        + (ok.length ? ok.map((s) => pp6(ctx, d, s)).join('') : (skip ? '' : '<div class="empty">ไม่มีนักเรียนในช่วงเลขที่ที่เลือก</div>'));
    }
    else if (pref.doc === 'coverClass') paper.innerHTML = coverClass(ctx, d, pt);
    else if (pref.doc === 'coverCourse') paper.innerHTML = pref.course ? coverCourse(ctx, d, pt, pt.results.find((r) => r.course.id === pref.course)) : '<div class="empty">ห้องนี้ยังไม่มีรายวิชาในภาคเรียนนี้</div>';
    else paper.innerHTML = pick.length ? pick.map((s, i) => cert(ctx, d, s, i)).join('') : '<div class="empty">ไม่มีนักเรียนในช่วงเลขที่ที่เลือก</div>';
  } catch (err) { console.error(err); paper.innerHTML = `<div class="empty">จัดหน้าไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); }
  return () => { cache = { key: null, data: null }; };
}

// ---------------------------------------------------------------------
//  ปพ.6: ตารางรายชื่อ / หน้าเกรดรายคน (ดู js/views/pp6-hub.js)
// ---------------------------------------------------------------------
const tabsHtml = () => tabGroups([['เล่ม ปพ.', 'book', ['book']], ['เอกสารรายบุคคล', 'students', ['pp6', 'cert']], ['ปก ปพ.5', 'reports', ['coverClass', 'coverCourse']]]
  .map(([label, ic, keys]) => ({ label, icon: ic, tabs: keys.map((k) => ({ key: k, label: esc(DOCS[k]) })) })), pref.doc, 'doc', 'no-print');
const wireTabs = (el, again) => { el.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.doc === 'pp6' && pref.doc !== 'pp6') pref.pp6View = 'list';
  pref.doc = b.dataset.doc; again(); })); wireTabGroups(el); };
async function getData(ctx, room) {
  const key = `${room.id}|${ctx.term.id}`;
  if (cache.key !== key) cache = { key, data: await loadRoomYear(ctx, room) };
  return cache.data;
}

async function hub(el, ctx, rooms, room) {
  const again = () => render(el, ctx);
  el.innerHTML = `
    <div class="page-head"><div><h1>พิมพ์ ปพ.6 / ปพ.5</h1><p>ตรวจเกรดรายคนก่อนพิมพ์ ปพ.6 · คนที่ยังมีวิชาไม่มีเกรดหรือคะแนนไม่ครบจะพิมพ์ไม่ได้</p></div>
    <div class="row no-print">
      <label class="field">ห้อง<select id="room">${options(rooms, room.id, (r) => `ห้อง ${roomName(r)}`)}</select></label>
      <label class="field">ช่วงข้อมูล<select id="scope"><option value="term" ${pref.scope === 'term' ? 'selected' : ''}>ภาคเรียนที่ ${ctx.term.term} (ภาคปัจจุบัน)</option>
        <option value="year" ${pref.scope === 'year' ? 'selected' : ''}>ทั้งปีการศึกษา ${room.academic_year}</option></select></label>
    </div></div>
    ${tabsHtml()}
    <div id="hub" style="display:flex;flex-direction:column;gap:16px"><p class="muted">กำลังรวบรวมข้อมูลทั้งปี…</p></div>`;
  wireTabs(el, again);
  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; pref.pp6View = 'list'; pref.stu = null; again(); });
  $('#scope', el).addEventListener('change', (e) => { pref.scope = e.target.value; again(); });
  const box = $('#hub', el);
  const toPaper = (from, to) => { pref.from = from; pref.to = to; pref.pp6View = 'paper'; again(); };
  try {
    const d = await getData(ctx, room);
    const common = { scope: pref.scope, onPrint: (s) => toPaper(s.number ?? 0, s.number ?? 0) };
    if (pref.pp6View === 'student' && pref.stu) {
      studentView(box, ctx, d, pref.stu, { ...common, onBack: () => { pref.pp6View = 'list'; again(); } });
    } else {
      pref.pp6View = 'list';
      listView(box, ctx, d, { ...common, onView: (id) => { pref.stu = id; pref.pp6View = 'student'; again(); }, onPrintAll: () => toPaper(1, 999) });
    }
  } catch (err) { console.error(err); box.innerHTML = `<div class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</div>`; toast(err.message, 'err'); }
  return () => { cache = { key: null, data: null }; };
}

// ---------------------------------------------------------------------
const schoolLine = (ctx) => `โรงเรียน${esc(ctx.settings.school_name || '')} ${esc(ctx.settings.area_office || '')}`;
const termTxt = (t) => `ภาคเรียนที่ ${t.term} ปีการศึกษา ${t.academic_year}`;
const traitText = (k, v) => (v === null || v === undefined ? '-' : TRAIT_KINDS[k].levels[v]);
const pf = (a) => (a?.passed === true ? 'ผ่าน' : a?.passed === false ? 'ไม่ผ่าน' : '-');

function gradeRows(pt, s) {
  return pt.results.map((r, i) => { const x = r.res[s.id];
    const note = x.reason || '';
    return `<tr><td>${i + 1}</td><td>${esc(r.course.subject?.code)}</td><td class="l">${esc(r.course.subject?.name)}</td><td>${unit(r.course.subject)}</td>
      <td>100</td><td>${r.classAvg ?? ''}</td><td>${x.total ?? ''}</td><td><b>${fmtGrade(x.grade)}</b></td><td class="l" style="font-size:11px">${esc(note)}</td></tr>`; }).join('');
}

function pp6(ctx, d, s) {
  const terms = pref.scope === 'year' ? d.terms : d.terms.filter((t) => t.id === ctx.term.id);
  const p = d.priv[s.id] || {};
  const room = d.room;
  const homeroom = d.homeroom.map((t) => t.full_name).join(' / ');
  const today = thaiDate(todayIso());
  const termBlocks = terms.map((t) => { const pt = d.perTerm[t.id]; const st = pt.stu[s.id];
    const credits = pt.results.reduce((a, r) => a + weightOf(r.course.subject), 0);
    return `<div class="pp6-sec">${terms.length > 1 ? `<b>${termTxt(t)}</b>` : ''}
      <table style="font-size:12.5px"><thead><tr><th>ที่</th><th>รหัสวิชา</th><th class="l">รายวิชา</th><th>หน่วยกิต</th><th>คะแนนเต็ม</th><th>เฉลี่ยในชั้น</th><th>คะแนนที่ได้</th><th>ผลการเรียน</th><th class="l">หมายเหตุ</th></tr></thead>
        <tbody>${pt.results.length ? gradeRows(pt, s) : '<tr><td colspan="9">ยังไม่มีรายวิชา</td></tr>'}
        <tr><td colspan="3" class="l"><b>รวม</b></td><td>${credits}</td><td>${st.totalMax}</td><td></td><td>${st.totalMax ? Math.round(st.totalScore * 100) / 100 : ''}</td><td></td><td></td></tr></tbody></table>
      <table style="font-size:12.5px;margin-top:2mm"><tbody><tr>
        <td class="l">คะแนนคิดเป็นร้อยละ <b>${st.totalMax ? (100 * st.totalScore / st.totalMax).toFixed(2) : '-'}</b></td>
        <td class="l">คะแนนรวมได้ลำดับที่ <b>${st.totalRank ?? '-'}</b> จาก ${d.roster.length} คน</td>
        <td class="l">ผลการเรียนเฉลี่ย <b>${g2(st.gpa) || '-'}</b></td><td class="l">ลำดับที่ <b>${st.gpaRank ?? '-'}</b></td></tr>
        <tr><td class="l" colspan="4">เวลาเรียน มาเรียน ${(st.att?.present ?? 0) + (st.att?.late ?? 0)} วัน จาก ${st.att?.school_days ?? 0} วัน
          (ร้อยละ ${st.att?.pct == null ? '-' : Number(st.att.pct).toFixed(2)}) · ป่วย ${st.att?.sick ?? 0} · ลา ${st.att?.leave ?? 0} · ขาด ${st.att?.absent ?? 0}</td></tr></tbody></table></div>`; }).join('');

  const assessRows = terms.map((t) => { const st = d.perTerm[t.id].stu[s.id];
    return `<tr>${terms.length > 1 ? `<td>${t.term}</td>` : ''}${Object.keys(TRAIT_KINDS).map((k) => `<td>${esc(traitText(k, st.traits[k]))}</td>`).join('')}
      ${Object.keys(ACTIVITIES).map((a) => `<td>${pf(st.acts[a])}</td>`).join('')}<td class="l" style="font-size:11px">${esc(st.acts.club?.club_name ?? '')}</td></tr>`; }).join('');

  const page1 = `<div class="a4 pp6">
    <h2>แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล (ปพ.6)</h2>
    <div class="sub">${schoolLine(ctx)}<br>ชั้น${levelName(room.level)}/${room.room} · ${pref.scope === 'year' ? `ปีการศึกษา ${room.academic_year}` : termTxt(ctx.term)}</div>
    <table class="info"><tbody>
      <tr><td class="l">ชื่อ-สกุล <b>${esc(fullName(s))}</b></td><td class="l">เลขประจำตัวนักเรียน <b>${esc(s.student_code ?? '')}</b></td><td class="l">เลขที่ <b>${s.number ?? ''}</b></td></tr>
      <tr><td class="l">เลขประจำตัวประชาชน ${esc(p.citizen_id ?? '')}</td><td class="l">วันเกิด ${esc(thaiDate(p.birth_date))}</td><td class="l">ครูประจำชั้น ${esc(homeroom)}</td></tr></tbody></table>
    ${termBlocks}
    ${pref.scope === 'year' && d.terms.length > 1 ? `<div class="pp6-sec"><b>ผลการเรียนเฉลี่ยตลอดปีการศึกษา ${g2(d.yearGpa[s.id]) || '-'} · ลำดับที่ ${d.yearRank[s.id] ?? '-'} จาก ${d.roster.length} คน</b></div>` : ''}
    <div class="pp6-sec"><b>ผลการประเมินอื่น ๆ</b>
      <table style="font-size:12px"><thead><tr>${terms.length > 1 ? '<th>ภาค</th>' : ''}${Object.values(TRAIT_KINDS).map((k) => `<th>${esc(k.short)}</th>`).join('')}
        <th>แนะแนว</th><th>ลูกเสือ/ยุวกาชาด</th><th>ชุมนุม</th><th>เพื่อสังคมฯ</th><th class="l">ชื่อชุมนุม</th></tr></thead><tbody>${assessRows}</tbody></table></div>
    <div class="sign" style="margin-top:8mm">${sig(homeroom, 'ครูประจำชั้น', today)}${sig(ctx.settings.academic_head_name, 'หัวหน้างานวิชาการ')}${sig(ctx.settings.director_name, ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน')}</div>
  </div>`;
  if (!pref.page2) return page1;

  const h = d.health[s.id] || {};
  const comment = terms.map((t) => d.perTerm[t.id].stu[s.id].comment).filter(Boolean);
  const page2 = `<div class="a4 pp6">
    <h2 style="font-size:17px">${esc(fullName(s))} · ชั้น${room.level}/${room.room} เลขที่ ${s.number ?? ''}</h2>
    <div class="pp6-sec"><b>ภาวะการเจริญเติบโต (เกณฑ์อ้างอิงกรมอนามัย)</b>
      <table style="font-size:12px"><thead><tr><th>ครั้งที่</th><th>วันที่</th><th>อายุ</th><th>น้ำหนัก (กก.)</th><th>ส่วนสูง (ซม.)</th><th>น้ำหนักตามอายุ</th><th>ส่วนสูงตามอายุ</th><th>น้ำหนักตามส่วนสูง</th></tr></thead>
        <tbody>${[1, 2, 3, 4].map((n) => { const m = h[n]; return `<tr><td>${n}</td><td>${m ? esc(thaiDate(m.measured_on, true)) : ''}</td><td>${m ? esc(ageText(m.months)) : ''}</td>
          <td>${m?.weight_kg ?? ''}</td><td>${m?.height_cm ?? ''}</td><td>${esc(m?.wa ?? '')}</td><td>${esc(m?.ha ?? '')}</td><td>${esc(m?.wh ?? '')}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="pp6-sec"><b>ความคิดเห็นของครูประจำชั้น</b><div class="lines">${comment.length ? esc(comment.join(' ')) : ''}</div></div>
    <div class="pp6-sec"><b>ความคิดเห็นของผู้ปกครอง</b><div class="lines"></div>
      <div class="sign">${sig('', 'ผู้ปกครองนักเรียน')}</div></div>
    <div class="pp6-sec" style="font-size:12px"><b>คำอธิบายผลการเรียน</b>
      <table style="font-size:12px"><thead><tr>${LEVEL_MEANING.map(([g]) => `<th>${g}</th>`).join('')}<th>ร</th><th>มส</th></tr></thead>
        <tbody><tr>${LEVEL_MEANING.map(([, r]) => `<td>${r}</td>`).join('')}<td rowspan="2">รอการตัดสิน</td><td rowspan="2">ไม่มีสิทธิ์สอบปลายภาค</td></tr>
          <tr>${LEVEL_MEANING.map(([, , m]) => `<td>${m}</td>`).join('')}</tr></tbody></table>
      <p style="margin:2mm 0 0">ผลการประเมินคุณลักษณะอันพึงประสงค์ การอ่าน คิดวิเคราะห์และเขียน และค่านิยม 12 ประการ มี 4 ระดับ: ดีเยี่ยม ดี ผ่าน ไม่ผ่าน ·
        สมรรถนะสำคัญ: ดีเยี่ยม ดี พอใช้ ปรับปรุง · ผู้เรียนต้องมีเวลาเรียนไม่น้อยกว่าร้อยละ 80 ของแต่ละรายวิชาจึงมีสิทธิ์สอบปลายภาค</p></div>
    <div class="pp6-sec" style="font-size:12px"><b>ถึงผู้ปกครอง</b>
      <ol style="margin:1mm 0 0;padding-left:6mm"><li>กรุณาตรวจสอบชื่อ เลขประจำตัว และวันเกิดของนักเรียน หากไม่ถูกต้องโปรดแจ้งครูประจำชั้น</li>
        <li>ถ้าผลการประเมินภาวะโภชนาการไม่อยู่ในเกณฑ์ (เช่น ผอม เตี้ย หรืออ้วน) ควรดูแลเรื่องอาหารและการออกกำลังกาย หรือปรึกษาเจ้าหน้าที่สาธารณสุข</li>
        <li>รายวิชาที่ได้ 0 ร หรือ มส นักเรียนต้องสอบแก้ตัวหรือเรียนซ่อมเสริม โปรดติดต่อครูผู้สอนวิชานั้น</li>
        <li>ลงชื่อในช่องผู้ปกครองแล้วส่งเอกสารนี้คืนครูประจำชั้น</li></ol></div>
  </div>`;
  return page1 + page2;
}

// ---------------------------------------------------------------------
function countsTable(c) {
  const row = (label, k) => `<tr><td class="l">${label}</td><td>${c[k]['ช']}</td><td>${c[k]['ญ']}</td><td>${c[k]['ช'] + c[k]['ญ']}</td></tr>`;
  return `<table style="width:70%;margin:0 auto"><thead><tr><th class="l">จำนวนนักเรียน</th><th>ชาย</th><th>หญิง</th><th>รวม</th></tr></thead><tbody>
    ${row('ต้นภาคเรียน', 'start')}${row('ออกระหว่างภาคเรียน', 'left')}${row('เข้าระหว่างภาคเรียน', 'joined')}${row('สิ้นภาคเรียน', 'end')}</tbody></table>`;
}
const approval = (ctx) => `
  <div class="pp6-sec" style="margin-top:6mm"><b>การอนุมัติผลการเรียน</b>
    <div class="sign">${sig(ctx.settings.academic_head_name, 'หัวหน้างานวิชาการ')}<div>เสนอ<br>ความเห็นผู้บริหาร<br>☐ อนุมัติ &nbsp; ☐ ไม่อนุมัติ</div></div>
    <div class="sign" style="margin-top:6mm">${sig(ctx.settings.director_name, ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน', '........../........................../..........')}</div></div>`;

function coverClass(ctx, d, pt) {
  const room = d.room;
  const rows = pt.results.map((r) => ({ k: r.course, dist: distribution(d.roster.map((s) => r.res[s.id].grade)) }));
  const traitCount = (k) => TRAIT_KINDS[k].levels.map((_, i) => d.roster.filter((s) => pt.stu[s.id].traits[k] === i).length);
  return `<div class="a4">
    <h2 style="font-size:21px">สมุดบันทึกการพัฒนาคุณภาพผู้เรียน (ปพ.5)</h2>
    <div class="sub">${schoolLine(ctx)}<br>ชั้น${levelName(room.level)}/${room.room} · ${termTxt(pt.term)}<br>ครูประจำชั้น ${esc(d.homeroom.map((t) => t.full_name).join(' / ') || '-')}</div>
    ${countsTable(pt.counts)}
    <div class="pp6-sec"><b>สรุปผลสัมฤทธิ์ทางการเรียน</b>
      <table style="font-size:12.5px"><thead><tr><th>รหัส</th><th class="l">รายวิชา</th><th>นก.</th>${['มส', 'ร', '0', '1', '1.5', '2', '2.5', '3', '3.5', '4'].map((g) => `<th>${g}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(({ k, dist }) => `<tr><td>${esc(k.subject?.code)}</td><td class="l">${esc(k.subject?.name)}</td><td>${unit(k.subject)}</td>
          ${['มส', 'ร', '0', '1', '1.5', '2', '2.5', '3', '3.5', '4'].map((g) => `<td>${dist[g] || '-'}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="13">ยังไม่มีรายวิชา</td></tr>'}</tbody></table></div>
    <div class="pp6-sec"><b>สรุปผลการประเมิน (จำนวนนักเรียน)</b>
      <table style="font-size:12.5px"><thead><tr><th class="l">ด้าน</th><th colspan="4">ระดับ 0 · 1 · 2 · 3</th></tr></thead><tbody>
        ${Object.keys(TRAIT_KINDS).map((k) => { const c = traitCount(k); return `<tr><td class="l">${esc(TRAIT_KINDS[k].label)}</td>${c.map((n, i) => `<td>${esc(TRAIT_KINDS[k].levels[i])} ${n}</td>`).join('')}</tr>`; }).join('')}
        ${Object.entries(ACTIVITIES).map(([a, label]) => { const pass = d.roster.filter((s) => pt.stu[s.id].acts[a]?.passed === true).length; const fail = d.roster.filter((s) => pt.stu[s.id].acts[a]?.passed === false).length;
          return `<tr><td class="l">${esc(label)}</td><td colspan="2">ผ่าน ${pass}</td><td colspan="2">ไม่ผ่าน ${fail}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="sign" style="margin-top:6mm">${d.homeroom.length ? d.homeroom.map((t) => sig(t.full_name, 'ครูประจำชั้น')).join('') : sig('', 'ครูประจำชั้น')}</div>
    ${approval(ctx)}
  </div>`;
}

function coverCourse(ctx, d, pt, r) {
  const room = d.room; const k = r.course;
  const dist = distribution(d.roster.map((s) => r.res[s.id].grade));
  const n = d.roster.filter((s) => r.res[s.id].grade !== null).length;
  const ind = { p: d.roster.filter((s) => r.res[s.id].indicator === 'ผ').length, f: d.roster.filter((s) => r.res[s.id].indicator === 'มผ').length };
  return `<div class="a4">
    <h2 style="font-size:21px">สมุดบันทึกการพัฒนาคุณภาพผู้เรียน (ปพ.5)</h2>
    <div class="sub">${schoolLine(ctx)}<br>${termTxt(pt.term)}</div>
    <table class="info"><tbody>
      <tr><td class="l">รายวิชา <b>${esc(k.subject?.name)}</b></td><td class="l">รหัสวิชา <b>${esc(k.subject?.code)}</b></td><td class="l">${k.subject?.credits != null ? `หน่วยกิต <b>${Number(k.subject.credits)}</b>` : `เวลาเรียน <b>${k.subject?.hours_per_year ?? '-'}</b> ชม./ปี`}</td></tr>
      <tr><td class="l">กลุ่มสาระการเรียนรู้ ${esc(k.subject?.subject_group ?? '')}</td><td class="l">ประเภท ${esc(k.subject?.subject_type ?? '')}</td><td class="l">ชั้น${levelName(room.level)}/${room.room}</td></tr>
      <tr><td class="l" colspan="2">ครูผู้สอน ${esc(k.teachers.map((t) => t.full_name).join(' / ') || '-')}</td><td class="l">ครูประจำชั้น ${esc(d.homeroom.map((t) => t.full_name).join(' / ') || '-')}</td></tr>
      <tr><td class="l" colspan="3">อัตราส่วนคะแนน ระหว่างภาค : ปลายภาค = ${k.midterm_ratio} : ${k.final_ratio}</td></tr></tbody></table>
    ${countsTable(pt.counts)}
    <div class="pp6-sec"><b>สรุปผลการเรียน</b>
      <table><thead><tr><th class="l">ระดับผลการเรียน</th>${GRADE_LABELS.map((g) => `<th>${g}</th>`).join('')}<th>รวม</th></tr></thead>
        <tbody><tr><td class="l">จำนวน (คน)</td>${GRADE_LABELS.map((g) => `<td>${dist[g]}</td>`).join('')}<td>${n}</td></tr>
          <tr><td class="l">ร้อยละ</td>${GRADE_LABELS.map((g) => `<td>${n ? (100 * dist[g] / n).toFixed(1) : '-'}</td>`).join('')}<td>${n ? 100 : '-'}</td></tr></tbody></table>
      ${ind.p + ind.f ? `<p style="margin:2mm 0 0">ผลการประเมินตัวชี้วัด: ผ่าน ${ind.p} คน · ไม่ผ่าน ${ind.f} คน</p>` : ''}</div>
    <div class="sign" style="margin-top:6mm">${(k.teachers.length ? k.teachers : [{ full_name: '' }]).map((t) => sig(t.full_name, 'ครูผู้สอน')).join('')}</div>
    ${approval(ctx)}
  </div>`;
}

// ---------------------------------------------------------------------
function cert(ctx, d, s, i) {
  const p = d.priv[s.id] || {};
  const room = d.room;
  const [y, m, dd] = (pref.certDate || todayIso()).split('-').map(Number);
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const no = (() => { const mt = pref.certNo.match(/^(\d+)(.*)$/); return mt ? `${Number(mt[1]) + i}${mt[2]}` : pref.certNo; })();
  const text = pref.certText || `เป็นนักเรียนของโรงเรียนนี้จริง ปัจจุบันกำลังศึกษาอยู่ชั้น${levelName(room.level)} ปีการศึกษา ${room.academic_year}`;
  const g = d.yearGpa[s.id];
  const line = (label, v) => `<span class="cl">${label}</span> <span class="cv">${esc(v || '-')}</span>`;
  return `<div class="a4 cert">
    <div style="text-align:right">เลขที่ ${esc(no || '..............')}</div>
    <h2 style="font-size:24px;margin-top:6mm">ใบรับรองผลการศึกษา</h2>
    <div class="sub" style="font-size:17px">${schoolLine(ctx)}<br>${esc([ctx.settings.subdistrict && `ตำบล${ctx.settings.subdistrict}`, ctx.settings.district && `อำเภอ${ctx.settings.district}`, ctx.settings.province && `จังหวัด${ctx.settings.province}`].filter(Boolean).join(' '))}</div>
    <div class="cert-body">
      <p>ขอรับรองว่า ${line('', fullName(s))}</p>
      <p>${line('เลขประจำตัวนักเรียน', s.student_code)} &nbsp; ${line('เลขประจำตัวประชาชน', p.citizen_id)}</p>
      <p>${line('เกิดวันที่', thaiDate(p.birth_date))} &nbsp; ${line('เพศ', s.gender === 'ช' ? 'ชาย' : s.gender === 'ญ' ? 'หญิง' : '')} &nbsp; ${line('สัญชาติ', p.nationality)} &nbsp; ${line('ศาสนา', p.religion)}</p>
      <p>${line('ชื่อ-สกุลบิดา', personName(p.father))} &nbsp; ${line('ชื่อ-สกุลมารดา', personName(p.mother))}</p>
      <p style="text-indent:12mm">${esc(text)}${pref.certGpa && g != null ? ` มีผลการเรียนเฉลี่ย ${g2(g)}` : ''}</p>
      <p style="text-align:center;margin-top:8mm">ออกให้ ณ วันที่ ${dd} เดือน ${months[m - 1]} พ.ศ. ${y + 543}</p>
    </div>
    <div class="cert-sign">
      <div class="photo">ติดรูปถ่าย<br>ขนาด 3 × 4 ซม.</div>
      <div>${sig(ctx.settings.director_name, ctx.settings.director_title || 'ผู้อำนวยการโรงเรียน')}</div>
    </div>
    <div class="sign" style="margin-top:10mm">${sig(ctx.settings.registrar_name, 'นายทะเบียน')}</div>
    <p style="font-size:13px;margin-top:8mm">หมายเหตุ ...................................................................................................</p>
  </div>`;
}

