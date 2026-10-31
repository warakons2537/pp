// นำเข้ารายการ 0 ร มส จากไฟล์ (CSV / Excel): จับคู่นักเรียนด้วยเลขประจำตัว · แยกเป็น "วิชาในภาคเรียนปัจจุบัน" กับ "วิชาค้างจากปีก่อน/ภาคก่อน"
// ระบบ "ตัดสินใจ" ให้เฉพาะข้อเสนอแนะ (สาเหตุ/วิธีแก้เริ่มต้น) ครูและผู้ดูแลระบบแก้ได้ทุกช่อง ไม่แตะเกรดใน ปพ.5 ไม่ตัดสินผลผ่านเอง
// ไฟล์นี้ไม่แตะฐานข้อมูลและหน้าจอ (ทดสอบได้) · ส่วนบันทึกอยู่ที่ applyImport

export const TEMPLATE_HEADERS = ['เลขประจำตัว', 'ชื่อ-สกุล', 'ห้อง', 'รหัสวิชา', 'ชื่อวิชา', 'หน่วยกิต', 'ผลเดิม', 'สถานะ', 'หมายเหตุ'];
const ALIASES = {
  code: ['เลขประจำตัว', 'เลขประจำตัวนักเรียน', 'รหัสนักเรียน'], name: ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ'], room: ['ห้อง', 'ชั้น'],
  subject: ['รหัสวิชา'], title: ['ชื่อวิชา', 'วิชา'], credits: ['หน่วยกิต'], grade: ['ผลเดิม', 'ผล', 'เกรด'], status: ['สถานะ'], note: ['หมายเหตุ'],
};

// ---- CSV (รองรับเครื่องหมายคำพูดและ BOM) ----
export function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}
export const toCsv = (rows) => `﻿${rows.map((r) => r.map((c) => (/[",\n\r]/.test(String(c ?? '')) ? `"${String(c).replace(/"/g, '""')}"` : String(c ?? ''))).join(',')).join('\r\n')}\r\n`;

// ตาราง (แถวแรกเป็นหัว) → [{ code, name, room, subject, title, credits, grade, status, note, line }]
export function rowsFromTable(table) {
  if (!table.length) return [];
  const head = table[0].map((h) => String(h ?? '').replace(/\s+/g, '').trim());
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.map((n) => n.replace(/\s+/g, '')).includes(h));
  if (col.code < 0 || col.subject < 0 || col.grade < 0) throw new Error('ไม่พบหัวคอลัมน์ "เลขประจำตัว" "รหัสวิชา" และ "ผลเดิม" ในไฟล์ (แถวแรกต้องเป็นหัวตาราง)');
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
  return table.slice(1).map((r, i) => ({ line: i + 2, code: get(r, 'code'), name: get(r, 'name'), room: get(r, 'room'), subject: get(r, 'subject'),
    title: get(r, 'title'), credits: get(r, 'credits'), grade: get(r, 'grade'), status: get(r, 'status'), note: get(r, 'note') }))
    .filter((r) => r.code || r.subject || r.grade);
}

const norm = (s) => String(s ?? '').normalize('NFC').replace(/[\s​]/g, '').toLowerCase();
export const normGrade = (g) => { const t = String(g ?? '').trim().replace('๐', '0'); return t === '0' ? '0' : /^ร$/.test(t) ? 'ร' : /^มส\.?$/.test(t) ? 'มส' : null; };
// รหัสวิชา ค21101 → ระดับชั้นของวิชา (หลักที่ 2 = ปีที่ 1–3)
export const subjectLevel = (code) => { const m = String(code).match(/^[^\d]*\d(\d)\d\d{2}$/); return m ? Number(m[1]) : null; };
const roomLevel = (cl) => { const m = String(cl?.level ?? '').match(/^ม\.(\d)/); return m ? Number(m[1]) : null; };

// ข้อเสนอแนะเริ่มต้น (ครูแก้ได้): 0 → คะแนนไม่ถึง/สอบแก้ตัว · ร → ไม่ครบ/ทำงานเพิ่ม · มส → ขาดเรียน/เรียนซ่อมเสริม
export const suggest = (grade) => ({ '0': { cause: 'low_score', plan: 'retest' }, 'ร': { cause: 'missing_work', plan: 'extra_work' }, 'มส': { cause: 'absent', plan: 'tutoring' } }[grade]);
const DONE = 'แก้แล้ว (ตามลายมือในแบบคำร้อง) — รอครูระบุผลหลังแก้และส่งยืนยัน';

/**
 * env = {
 *   byCode: Map(เลขประจำตัว → { student: {id, first_name, last_name}, classroom: {id, level, room, academic_year} }),
 *   courses: [{ id, classroom_id, term_id, code, name }]   // ทุกภาคเรียนของห้องเหล่านั้น
 *   terms: Map(term_id → { academic_year, term }), currentTermId,
 *   existing: { course: Set('courseId|studentId'), legacy: Set('studentId|code|year') },
 * }
 * @returns { items: [{ line, row, level: 'ok'|'warn'|'skip'|'error', messages, kind, student, classroom, payload, label }], counts }
 */
export function planImport(rows, env) {
  const zeroCount = new Map();
  for (const r of rows) if (normGrade(r.grade) === '0') zeroCount.set(r.code, (zeroCount.get(r.code) || 0) + 1);
  const seen = new Set();
  const items = rows.map((row) => {
    const msgs = []; const it = { line: row.line, row, level: 'ok', messages: msgs, kind: null, student: null, classroom: null, payload: null, label: '' };
    const fail = (m) => { msgs.push(m); it.level = 'error'; return it; };
    const hit = env.byCode.get(row.code);
    if (!row.code) return fail('ไม่มีเลขประจำตัว');
    if (!hit) return fail(`ไม่พบเลขประจำตัว ${row.code} ในทะเบียนนักเรียน`);
    const { student, classroom } = hit; it.student = student; it.classroom = classroom;
    const orig = normGrade(row.grade); if (!orig) return fail(`ผลเดิม "${row.grade}" ไม่ใช่ 0 / ร / มส`);
    if (!row.subject) return fail('ไม่มีรหัสวิชา');
    const L = roomLevel(classroom); if (L === null) return fail('นักเรียนคนนี้ไม่ได้อยู่ห้องมัธยมในปีปัจจุบัน (ระบบติดตามเฉพาะ ม.1–ม.3)');
    if (row.name && !(norm(row.name).includes(norm(student.first_name)) && norm(row.name).includes(norm(student.last_name)))) msgs.push(`ชื่อในไฟล์ไม่ตรงกับทะเบียน (${student.first_name} ${student.last_name})`);

    // วิชานี้อยู่ในระบบไหม: ภาคเรียนปัจจุบัน → รายการปกติ · ภาคอื่น/ไม่มี → วิชาค้าง
    const found = env.courses.filter((k) => k.classroom_id === classroom.id && norm(k.code) === norm(row.subject));
    const cur = found.find((k) => k.term_id === env.currentTermId);
    const base = { student_id: student.id, original_grade: orig, ...suggest(orig), status: 'planned', note: row.note || null };
    if (zeroCount.get(row.code) >= 6) { base.cause = 'absent'; msgs.push(`ติด 0 ถึง ${zeroCount.get(row.code)} วิชา — ควรตรวจสาเหตุ (ขาดเรียนต่อเนื่อง/ย้ายออก?)`); }
    if (/แก้แล้ว/.test(row.status)) { base.status = 'in_progress'; base.note = [row.note, DONE].filter(Boolean).join(' · '); }
    if (cur) {
      it.kind = 'course'; it.label = `วิชาในภาคเรียนปัจจุบัน`;
      it.payload = { ...base, course_id: cur.id };
      if (env.existing.course.has(`${cur.id}|${student.id}`)) { it.level = 'skip'; msgs.push('มีรายการนี้ในระบบแล้ว (ไม่นำเข้าซ้ำ)'); }
    } else {
      const old = found[0]; const t = old && env.terms.get(old.term_id);
      const l = subjectLevel(row.subject);
      if (l !== null && l > L) return fail(`วิชา ${row.subject} เป็นของชั้นสูงกว่าห้องปัจจุบัน (ม.${L})`);
      const year = t ? t.academic_year : (l !== null ? classroom.academic_year - (L - l) : classroom.academic_year);
      const term = t ? t.term : null;
      it.kind = 'legacy'; it.label = `วิชาค้าง · ปี ${year}${term ? ` ภาค ${term}` : ''}`;
      if (!t && l !== null && l === L) msgs.push('ไม่พบรายวิชานี้ในระบบของปีนี้ — บันทึกเป็นวิชาค้าง');
      it.payload = { ...base, course_id: null, classroom_id: classroom.id, legacy_code: row.subject, legacy_name: row.title || old?.name || null,
        legacy_year: year, legacy_term: term, legacy_credits: row.credits && Number.isFinite(Number(row.credits)) ? Number(row.credits) : null };
      if (env.existing.legacy.has(`${student.id}|${row.subject}|${year}`)) { it.level = 'skip'; msgs.push('มีรายการค้างนี้ในระบบแล้ว (ไม่นำเข้าซ้ำ)'); }
    }
    const dupKey = it.kind === 'course' ? `c|${it.payload.course_id}|${student.id}` : `l|${student.id}|${row.subject}|${it.payload.legacy_year}`;
    if (seen.has(dupKey)) { it.level = 'skip'; msgs.push('ซ้ำกับแถวก่อนหน้าในไฟล์'); } else seen.add(dupKey);
    if (it.level === 'ok' && msgs.length) it.level = 'warn';
    return it;
  });
  const counts = { ok: 0, warn: 0, skip: 0, error: 0 };
  items.forEach((i) => counts[i.level]++);
  return { items, counts, importable: items.filter((i) => i.level === 'ok' || i.level === 'warn') };
}

// บันทึกเฉพาะรายการที่นำเข้าได้ · วิชาปัจจุบันใช้ upsert (ไม่ซ้ำเพราะตรวจแล้ว) · วิชาค้าง insert ทีละกลุ่มเล็ก ๆ
export async function applyImport(db, importable) {
  const cur = importable.filter((i) => i.kind === 'course').map((i) => i.payload);
  const leg = importable.filter((i) => i.kind === 'legacy').map((i) => i.payload);
  for (let i = 0; i < cur.length; i += 40) await db.upsert('remedial_cases', cur.slice(i, i + 40), 'course_id,student_id');
  for (let i = 0; i < leg.length; i += 40) await db.insert('remedial_cases', leg.slice(i, i + 40));
  return { course: cur.length, legacy: leg.length };
}
