// =====================================================================
//  แบบพิมพ์ ปพ. ในตัวแอป (ไม่ต้องอัปโหลดไฟล์)
//  - pp/forms.xlsx = หน้าตาแบบพิมพ์อย่างเดียว (ข้อความหัวตาราง ขนาดช่อง เส้น ฟอนต์ การจัดหน้า)
//    ไม่มีสูตร ไม่มีข้อมูลนักเรียน
//  - แอปคำนวณทุกช่องเองจากข้อมูลในระบบ (buildBookData) แล้วใส่ลงช่องของแบบพิมพ์
//    กติกาการคำนวณตรงกับไฟล์โปรแกรม ปพ.5-6 เดิมของโรงเรียน (ตรวจด้วย tests/pp-forms.test.mjs)
// =====================================================================
import { Workbook, key } from './xl-model.js?v=2569.10.27-12';
import { Engine } from './xl-formula.js?v=2569.10.27-12';
import { levelName, thaiDate } from './util.js?v=2569.10.27-12';
import { toGrade } from './grading.js?v=2569.10.27-12';

export const FORMS_URL = new URL('../pp/forms.xlsx', import.meta.url).href;
let formsBytes = null;
export async function loadFormsBytes() {
  if (formsBytes) return formsBytes;
  const res = await fetch(FORMS_URL);
  if (!res.ok) throw new Error(`โหลดแบบพิมพ์ไม่ได้ (${res.status})`);
  formsBytes = new Uint8Array(await res.arrayBuffer());
  return formsBytes;
}

// ---------------------------------------------------------------------
//  ตัวช่วย
// ---------------------------------------------------------------------
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const sum = (a) => a.reduce((s, x) => s + (isNum(x) ? x : 0), 0);
const round2 = (x) => Math.round((x + Math.sign(x) * 1e-9) * 100) / 100;
// RANK ของ Excel: เท่ากันได้อันดับเดียวกัน · ค่าว่างไม่ได้อันดับ
const rankOf = (vals) => vals.map((v) => (isNum(v) ? 1 + vals.filter((x) => isNum(x) && x > v).length : null));
// รหัสนักเรียน: เลขล้วนที่ไม่ขึ้นต้นด้วย 0 เก็บเป็นตัวเลข (เหมือนไฟล์เดิม)
const codeVal = (c) => (c === null || c === undefined || c === '' ? null : /^[1-9]\d{0,14}$/.test(String(c)) ? Number(c) : String(c));
const schoolLine = (name) => `โรงเรียน${String(name || '').replace(/^โรงเรียน\s*/, '')}`;
/**
 * ระดับสรุปของคะแนนหลายข้อ (แบบไฟล์เดิม): ฐานนิยม ถ้าเท่ากันได้ค่าสูงกว่า · ไม่มีค่าซ้ำเลย = ค่าสูงสุด · ไม่มีคะแนน = ว่าง
 * (= IFERROR(MODE(LARGE(ช่วง,…)), IF(MAX(ช่วง)=0,"",MAX(ช่วง))))
 */
export function summaryLevel(scores) {
  const xs = scores.filter(isNum);
  if (!xs.length) return null;
  const cnt = new Map(); for (const x of xs) cnt.set(x, (cnt.get(x) || 0) + 1);
  let best = null; let bc = 1;
  for (const x of [...xs].sort((a, b) => b - a)) { const c = cnt.get(x); if (c > bc) { best = x; bc = c; } }
  if (best !== null) return best;
  const mx = Math.max(...xs); return mx === 0 ? null : mx;
}
const TRAIT_LABEL = ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'];
const COMP_LABEL = ['ปรับปรุง', 'พอใช้', 'ดี', 'ดีเยี่ยม'];

// ---------------------------------------------------------------------
//  คำนวณข้อมูลทั้งห้อง (1 ห้อง 1 ภาคเรียน)
// ---------------------------------------------------------------------
export function classModel(d) {
  const subjects = d.subjects.map((s) => {
    const rows = s.rows.map((r) => {
      const c = r.calc || {};
      const total = isNum(c.total) ? c.total : null;
      const grade = r.special || c.grade || (total === null ? null : toGrade(total));
      return { mid: c.mid ?? null, final: c.final ?? null, total, grade };
    });
    const totals = rows.map((r) => r.total).filter(isNum);
    return { ...s, rows, avg: totals.length ? round2(sum(totals) / totals.length) : null, hasCredit: s.credits !== null && s.credits !== undefined && s.credits !== '' };
  });
  const students = d.students.map((st, i) => {
    const s = st.s;
    // ผลรวมคะแนนทุกวิชา (คะแนนรายชั้น: W) และผลการเรียนเฉลี่ย (เกรดรายชั้น: W)
    const used = subjects.filter((x) => x.hasCredit);
    const totals = used.map((x) => x.rows[i].total);
    const sumTotal = totals.some(isNum) ? sum(totals) : null;
    let gs = 0; let gw = 0;
    for (const x of subjects) {
      const g = x.rows[i].grade;
      if (!x.code || typeof g !== 'number' || !isNum(Number(x.credits))) continue;
      gs += g * Number(x.credits); gw += Number(x.credits);
    }
    const gpa = gw ? Math.floor((gs / gw) * 100 + 1e-7) / 100 : null;
    return {
      i, no: st.no ?? i + 1, s, name: `${s.prefix ?? ''}${s.first_name ?? ''} ${s.last_name ?? ''}`.trim(), code: codeVal(s.student_code),
      sumTotal, gpa,
      trait: summaryLevel(st.trait8), rtw: summaryLevel(st.rtw), comp: summaryLevel(st.comp5), values: summaryLevel(st.values12),
      acts: st.acts, club: st.club,
    };
  });
  const rTotal = rankOf(students.map((x) => x.sumTotal));
  const rGpa = rankOf(students.map((x) => x.gpa));
  students.forEach((x, i) => { x.rankTotal = rTotal[i]; x.rankGpa = rGpa[i]; });
  const sch = d.school || {};
  return {
    d, subjects, students, sch,
    levelLine: `ชั้น${d.level} ภาคเรียนที่ ${d.term} ปีการศึกษา ${d.year}`,
    school: schoolLine(sch.school_name), schoolArea: `${schoolLine(sch.school_name)} ${sch.area_office || ''}`.trim(),
    homeroom: (d.homeroom || []).join(' / '),
    signDate: d.approveDate ? thaiDate(d.approveDate) : '',
  };
}

// ---------------------------------------------------------------------
//  ตัวเขียนแต่ละแผ่น: put('A1', ค่า)
// ---------------------------------------------------------------------
const PP6_ROWS = Array.from({ length: 20 }, (_, k) => 9 + k);        // วิชาที่ 1–20 → แถว 9–28
// ไฟล์เดิมตัดบรรทัดชื่อกิจกรรมเพื่อสังคมฯ ในแถวสูงบรรทัดเดียว ตัวอักษรจึงซ้อนกัน → ใช้บรรทัดเดียว
const ACT_LABELS = ['แนะแนว', 'ลูกเสือ-เนตรนารี', 'ชุมนุม', 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์'];

export const WRITERS = {
  'ปพ.6': {
    perStudent: true,
    write(put, m, i) {
      const st = m.students[i];
      put('A2', m.schoolArea); put('A3', m.levelLine);
      put('C5', st.name); put('F5', st.code); put('I5', st.no);
      let E = 0; let F = 0; let G = 0; let D = 0;
      m.subjects.forEach((x, k) => {
        const r = PP6_ROWS[k]; if (!r) return;
        const row = x.rows[i];
        put(`B${r}`, x.code || null); put(`C${r}`, x.name || null);
        if (!x.hasCredit) return;
        put(`D${r}`, Number(x.credits)); put(`E${r}`, 100); put(`F${r}`, x.avg);
        put(`G${r}`, row.total); put(`H${r}`, row.grade);
        D += Number(x.credits) || 0; E += 100; F += x.avg ?? 0; G += row.total ?? 0;
      });
      if (m.subjects.length) { put('D29', D); put('E29', E); put('F29', round2(F)); put('G29', G); }
      put('D30', E && st.sumTotal !== null ? (G / E) * 100 : null);
      put('D31', st.rankTotal); put('D32', st.gpa); put('D33', st.rankGpa);
      ACT_LABELS.forEach((t, k) => put(`B${35 + k}`, t));
      st.acts.forEach((p, k) => put(`D${35 + k}`, p === true ? 'ผ่าน' : p === false ? 'ไม่ผ่าน' : null));
      put('C37', st.club || null);
      put('D39', st.trait === null ? null : TRAIT_LABEL[st.trait] ?? null);
      put('D40', st.rtw === null ? null : TRAIT_LABEL[st.rtw] ?? null);
      put('D41', st.comp === null ? null : COMP_LABEL[st.comp] ?? null);
      put('E32', `(${m.homeroom})`); put('E37', `(${m.sch.academic_head_name || ''})`);
      put('E42', `(${m.sch.director_name || ''})`); put('E43', m.sch.director_title || 'ผู้อำนวยการโรงเรียน');
      for (const ref of ['F34', 'F39', 'F44']) put(ref, m.signDate || null);
    },
  },
};
export const FORM_SHEETS = Object.keys(WRITERS);

// ---------------------------------------------------------------------
//  เปิดแบบพิมพ์ + ใส่ค่า
// ---------------------------------------------------------------------
export class Forms {
  static async open(bytes) { const f = new Forms(); f.wb = await Workbook.open(bytes); f.eng = new Engine(f.wb.engineBook); f.written = new Map(); return f; }
  // ใส่ค่าลงเซลล์ (คงรูปแบบเดิมของช่อง)
  put(sheet, ref, v) {
    const sh = this.wb.sheet(sheet); if (!sh) return;
    const m = /^([A-Z]+)(\d+)$/.exec(ref); const c = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0); const r = +m[2];
    const k = key(r, c); const cell = sh.cells.get(k);
    const val = v === undefined || v === '' ? null : typeof v === 'string' ? v.replace(/\r?\n/g, '\r\n') : v;
    if (cell) cell.v = val; else sh.cells.set(k, { s: 0, v: val });
    if (!this.written.has(sheet)) this.written.set(sheet, new Set());
    this.written.get(sheet).add(k);
  }
  // ล้างค่าที่เคยใส่ (ก่อนใส่ของนักเรียนคนถัดไป)
  reset(sheet) {
    const sh = this.wb.sheet(sheet); const ks = this.written.get(sheet); if (!sh || !ks) return;
    for (const k of ks) { const c = sh.cells.get(k); if (c) c.v = null; }
    ks.clear();
  }
  fill(sheet, m, i = 0) {
    const w = WRITERS[sheet]; if (!w) return false;
    this.reset(sheet);
    w.write((ref, v) => this.put(sheet, ref, v), m, i);
    return true;
  }
}
