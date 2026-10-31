// =====================================================================
//  ตัวชี้วัดกลางของรายวิชา (subject_indicators)
//  - รายการเดียวต่อรหัสวิชา ใช้ร่วมกับทุกห้องที่เปิดสอนรหัสวิชานั้น
//  - ใส่ลงแต่ละห้อง (assessment_items kind = indicator) เฉพาะตัวที่ห้องนั้นยังไม่มี ไม่ลบ/แทนของเดิม
//  - จัดรูปแบบรหัสให้สม่ำเสมอ และอ่านรายการจากเล่ม ปพ.5-6 เดิม (แผ่น "รายวิชา" + "วิชาที่ n" แถว 5)
// =====================================================================
import { codeLevel } from './subject-import.js?v=2569.10.31-1';

const DIGIT = '0-9๐-๙';
const arabic = (s) => String(s).replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50));

// จัดรูปแบบรหัส: "ท1.1 ม 3/3" → "ท 1.1 ม.3/3" · ช่องว่างซ้ำเหลือช่องเดียว · "1 - 6" → "1-6" · ไม่แตกช่วง
export function normIndicatorCode(s) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  t = t.replace(new RegExp(`^([ก-ฮ]{1,2})\\s*(?=[${DIGIT}]+\\s*\\.)`), '$1 ');
  t = t.replace(new RegExp(`([${DIGIT}])([ปม])(?=\\s*\\.?\\s*[${DIGIT}]\\s*\\/)`, 'g'), '$1 $2');
  t = t.replace(new RegExp(`(^|[\\s(])([ปม])\\s*\\.?\\s*([${DIGIT}])\\s*\\/\\s*`, 'g'), '$1$2.$3/');
  t = t.replace(new RegExp(`([${DIGIT}])\\s*-\\s*(?=[${DIGIT}])`, 'g'), '$1-');
  return t;
}

// คีย์เทียบรหัส (ไม่สนช่องว่างและเลขไทย/อารบิก)
export const indKey = (s) => arabic(normIndicatorCode(s)).replace(/\s+/g, '');

// ชั้นในรหัสตัวชี้วัด เช่น "ท 1.1 ม.3/1" → "ม.3" (ผลการเรียนรู้ 1 → null)
export function codeLevelOf(code) {
  const m = arabic(normIndicatorCode(code)).match(/(?:^|\s)([ปม])\.(\d)\//);
  return m ? `${m[1]}.${m[2]}` : null;
}

export const subjectLevel = (subject) => subject?.level || codeLevel(subject?.code || '') || null;

// รหัสที่ชั้นไม่ตรงกับชั้นของวิชา
export function levelMismatch(codes, subject) {
  const lv = subjectLevel(subject); if (!lv) return [];
  return codes.filter((c) => { const x = codeLevelOf(c); return x && x !== lv; });
}

// แยกข้อความที่วางมา (บรรทัดละตัว คั่นคำอธิบายด้วยแท็บ) → [{ code, title }] ไม่ซ้ำกันเองและไม่ซ้ำกับ existing
export function parseIndicatorLines(text, existing = []) {
  const seen = new Set(existing.map((x) => indKey(x.code)));
  const out = []; const dup = [];
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) continue;
    const [c, ...rest] = line.split('\t');
    const code = normIndicatorCode(c); if (!code) continue;
    const k = indKey(code);
    if (seen.has(k)) { dup.push(code); continue; }
    seen.add(k); out.push({ code, title: rest.join(' ').trim() || null });
  }
  return { rows: out, dup };
}

// ---------------------------------------------------------------------
//  ใส่รายการกลางลงห้อง: เพิ่มเฉพาะตัวที่ห้องยังไม่มี ต่อท้ายลำดับเดิม
// ---------------------------------------------------------------------
const bySort = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);

export function missingForCourse(courseId, master, items) {
  const have = new Set(items.filter((i) => i.kind === 'indicator').map((i) => indKey(i.code || i.title || '')));
  let order = items.reduce((m, i) => Math.max(m, i.sort_order || 0), 0);
  return [...master].sort(bySort).filter((m) => !have.has(indKey(m.code)))
    .map((m) => ({ course_id: courseId, kind: 'indicator', code: m.code, title: m.title ?? null, max_score: null, sort_order: ++order }));
}

export async function syncCourse(db, courseId, master, items = null) {
  if (!master.length) return 0;
  const its = items ?? await db.select('assessment_items', { eq: { course_id: courseId } });
  const rows = missingForCourse(courseId, master, its);
  if (rows.length) await db.insert('assessment_items', rows);
  return rows.length;
}

// ห้องที่ผู้ใช้นี้ใส่รายการกลางให้ได้ (ผู้ดูแล = ทุกห้อง · ครู = ห้องที่สอน) ของภาคเรียนปัจจุบัน
export const syncableCourses = (ctx, subjectId) => (ctx.isAdmin ? ctx.courses : ctx.myCourses).filter((k) => k.subject_id === subjectId);

export async function syncSubject(ctx, subjectId) {
  const master = await ctx.db.select('subject_indicators', { eq: { subject_id: subjectId } });
  let added = 0; let rooms = 0;
  for (const k of syncableCourses(ctx, subjectId)) { const n = await syncCourse(ctx.db, k.id, master); added += n; if (n) rooms++; }
  return { added, rooms };
}

// ---------------------------------------------------------------------
//  อ่านเล่ม ปพ.5-6: แผ่น "รายวิชา" (B = รหัส, C = ชื่อ) + "วิชาที่ n" แถว 5 ช่อง C–AL (36 ตัว)
//  sheets = { ชื่อแผ่น: ตาราง 2 มิติ เริ่มที่ 0 }
// ---------------------------------------------------------------------
export const BOOK_SUBJECT_ROWS = [6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];   // ตรงกับ SUBJECT_ROWS ใน pp-book.js

export function parseBookIndicators(sheets) {
  const list = sheets['รายวิชา'];
  if (!list || !sheets['วิชาที่ 1']) throw new Error('ไม่ใช่ไฟล์เล่ม ปพ.5-6 (ไม่พบแผ่น "รายวิชา" หรือ "วิชาที่ 1")');
  const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const subjects = [];
  BOOK_SUBJECT_ROWS.forEach((r, i) => {
    const n = i + 1; const sh = sheets[`วิชาที่ ${n}`]; if (!sh) return;
    const row = list[r - 1] || [];
    const code = txt(row[1]); const name = txt(row[2]);
    const hdr = sh[4] || [];
    const seen = new Set(); const codes = []; const dup = [];
    for (let c = 2; c <= 37; c++) {
      const v = txt(hdr[c]); if (!v) continue;
      const t = normIndicatorCode(v); const k = indKey(t);
      if (seen.has(k)) { dup.push(t); continue; }
      seen.add(k); codes.push(t);
    }
    if (code || codes.length) subjects.push({ n, code, name, codes, dup });
  });
  return { level: txt(list[1]?.[1]), term: txt(list[2]?.[1]), subjects };
}

const flatCode = (s) => arabic(s).replace(/\s+/g, '');
const flatName = (s) => String(s ?? '').replace(/\s+/g, '');

// จับคู่กับรายวิชาในระบบด้วยรหัสวิชา · หลายแถวในไฟล์ได้รหัสเดียวกัน → ใช้แถวที่ชื่อตรง (หรือแถวแรก) แถวอื่นไม่เลือก
// masterBySubject = { subject_id: [{ code }] }
export function planBookImport(parsed, subjects, masterBySubject = {}) {
  const rows = parsed.subjects.map((s) => {
    const subject = s.code ? subjects.find((x) => flatCode(x.code) === flatCode(s.code)) || null : null;
    const have = new Set((subject ? masterBySubject[subject.id] || [] : []).map((m) => indKey(m.code)));
    const fresh = s.codes.filter((c) => !have.has(indKey(c)));
    return { ...s, subject, fresh, levelWarn: subject ? levelMismatch(s.codes, subject) : [], conflict: null };
  });
  const groups = new Map();
  for (const r of rows) if (r.subject) groups.set(r.subject.id, [...(groups.get(r.subject.id) || []), r]);
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const main = g.find((r) => flatName(r.name) === flatName(r.subject.name)) || g[0];
    for (const r of g) if (r !== main) r.conflict = main.n;
  }
  for (const r of rows) r.pick = !!(r.subject && r.fresh.length && !r.conflict);
  return rows;
}
