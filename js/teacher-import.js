// =====================================================================
//  นำเข้าครูจากไฟล์ CSV ของ WL Scheduler (ส่วนคำนวณ ไม่แตะหน้าจอ/ฐานข้อมูล)
//  ใช้คอลัมน์: ชั้น · รายวิชา · ครูประจำรายวิชา (ไม่ใช้คอลัมน์ครูร่วม)
//  ไฟล์ไม่มีรหัสวิชาและเลขห้อง → จับคู่การเปิดสอนจาก "ชื่อวิชา + ระดับชั้น" (ทุกห้องของชั้นนั้น)
// =====================================================================

// CSV แบบมีเครื่องหมายคำพูด ("a","b ""c""") · ตัด BOM
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^﻿/, '');
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const COLS = { level: 'ชั้น', subject: 'รายวิชา', teacher: 'ครูประจำรายวิชา' };

// แถวข้อมูล → [{ line, level, subject, teacher }]
export function readSchedulerCsv(text) {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new Error('ไฟล์ว่าง');
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, h]) => [k, head.findIndex((c) => c.trim() === h)]));
  const miss = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => COLS[k]);
  if (miss.length) throw new Error(`ไม่ใช่ไฟล์จาก WL Scheduler (ไม่พบคอลัมน์ ${miss.join(', ')})`);
  return body.map((r, i) => ({ line: i + 2, level: (r[idx.level] ?? '').trim(), subject: (r[idx.subject] ?? '').trim(), teacher: (r[idx.teacher] ?? '').trim() }))
    .filter((r) => r.level || r.subject || r.teacher);
}

// ชื่อครูสำหรับจับคู่ (ตรงกับ public.teacher_name_key ใน schema.sql)
const TPREFIX = /^(?:(?:ครู|นางสาว|นาง|นาย|น\.ส\.)\s*)+/;
export const teacherKey = (s) => String(s ?? '').trim().replace(TPREFIX, '').replace(/\s+/g, '');
// ชื่อที่บันทึก: ตัด "ครู" ข้างหน้าออก
export const displayName = (s) => String(s ?? '').trim().replace(/^ครู\s*/, '').replace(/\s+/g, ' ');
// ชื่อจริงมีชื่อ-นามสกุลคั่นด้วยช่องว่าง · ไม่มีช่องว่าง (เช่น "ครูแนะแนวและสวดมนต์") = ไม่ใช่ชื่อคน ข้ามโดยปริยาย
export const looksLikePerson = (s) => /\S\s+\S/.test(displayName(s));

// ชื่อวิชาสำหรับจับคู่: ตัดช่องว่าง และเลขท้ายชื่อ ("ภาษาอังกฤษ 2" = "ภาษาอังกฤษ")
export const subjectNameKey = (s) => String(s ?? '').replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50)).replace(/\s+/g, '').replace(/\d+$/, '');

// ครูแต่ละชื่อในไฟล์ → ค่าเริ่มต้น: id ครูในระบบ (ชื่อตรง 1 คน) · 'new' · 'skip'
export function teacherChoices(rows, profiles) {
  const out = new Map();
  for (const r of rows) {
    if (!r.teacher || out.has(r.teacher)) continue;
    const k = teacherKey(r.teacher);
    const hits = profiles.filter((p) => teacherKey(p.full_name) === k);
    out.set(r.teacher, { name: r.teacher, hits, choice: !looksLikePerson(r.teacher) ? 'skip' : hits.length === 1 ? hits[0].id : hits.length ? '' : 'new' });
  }
  return [...out.values()];
}

// ชื่อวิชาแต่ละชื่อในไฟล์ → ค่าเริ่มต้น: ชื่อวิชาในระบบที่ตรงกัน (คีย์) หรือ '' (ให้ผู้ดูแลเลือก)
export function subjectChoices(rows, subjects) {
  const keys = new Set(subjects.map((s) => subjectNameKey(s.name)));
  const out = new Map();
  for (const r of rows) {
    if (!r.subject || out.has(r.subject)) continue;
    const k = subjectNameKey(r.subject);
    out.set(r.subject, { name: r.subject, choice: keys.has(k) ? k : '' });
  }
  return [...out.values()];
}

// รายวิชาในระบบ (ไม่ซ้ำชื่อ) สำหรับช่องเลือก
export function subjectOptions(subjects) {
  const m = new Map();
  for (const s of subjects) { const k = subjectNameKey(s.name); if (k && !m.has(k)) m.set(k, s.name.trim()); }
  return [...m].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'th'));
}

// วางแผนการผูก: tMap = ชื่อในไฟล์ → id/'new'/'skip'/'' · sMap = ชื่อวิชาในไฟล์ → คีย์ชื่อวิชา/'' (ข้าม)
// courses = การเปิดสอนภาคเรียนปัจจุบัน (มี subject, classroom, teachers)
export function planLinks(rows, courses, tMap, sMap) {
  const links = []; const skipped = []; const seen = new Set();
  for (const r of rows) {
    const t = tMap.get(r.teacher);
    if (!r.teacher) { skipped.push({ ...r, reason: 'ไม่มีชื่อครู' }); continue; }
    if (!t || t === 'skip') { skipped.push({ ...r, reason: t === 'skip' ? 'ข้ามชื่อนี้' : 'ยังไม่ได้เลือกครู' }); continue; }
    const sk = sMap.get(r.subject);
    if (!sk) { skipped.push({ ...r, reason: 'ไม่ได้เลือกวิชาในระบบ' }); continue; }
    const ks = courses.filter((k) => k.classroom?.level === r.level && subjectNameKey(k.subject?.name) === sk);
    if (!ks.length) { skipped.push({ ...r, reason: `ไม่พบการเปิดสอนวิชานี้ของ ${r.level || '(ไม่ระบุชั้น)'} ในภาคเรียนนี้` }); continue; }
    for (const k of ks) {
      const key = `${k.id}|${r.teacher}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const already = t !== 'new' && k.teachers?.some((x) => x.id === t);
      links.push({ courseId: k.id, teacher: r.teacher, teacherId: t, already });
    }
  }
  return { links, skipped };
}
