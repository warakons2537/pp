// =====================================================================
//  แบบพิมพ์ ปพ. ในตัวแอป (ไม่ต้องอัปโหลดไฟล์)
//  - pp/forms.xlsx = หน้าตาแบบพิมพ์อย่างเดียว (ข้อความหัวตาราง ขนาดช่อง เส้น ฟอนต์ การจัดหน้า)
//    ไม่มีสูตร ไม่มีข้อมูลนักเรียน
//  - แอปคำนวณทุกช่องเองจากข้อมูลในระบบ (buildBookData) แล้วใส่ลงช่องของแบบพิมพ์
//    กติกาการคำนวณตรงกับไฟล์โปรแกรม ปพ.5-6 เดิมของโรงเรียน (ตรวจด้วย tests/pp-forms.test.mjs)
// =====================================================================
import { Workbook, key } from './xl-model.js?v=2569.11.1-14';
import { Engine } from './xl-formula.js?v=2569.11.1-14';
import { levelName, thaiDate } from './util.js?v=2569.11.1-14';
import { toGrade } from './grading.js?v=2569.11.1-14';

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

// ---------------------------------------------------------------------
//  ปพ.5 ชุดแบบพิมพ์ในตัว — เฟส 1: ปก ปพ.5 รายชั้น · รายชื่อ · บิดามารดา · ผู้ปกครอง · เวลาเรียนรายเดือน · สรุปเวลาเรียน
//  (ตำแหน่งช่องตรวจกับแบบพิมพ์ pp/forms.xlsx และไฟล์ PDF ตัวอย่างของโรงเรียน)
// ---------------------------------------------------------------------
const colLetters = (c) => { let s = ''; while (c > 0) { s = String.fromCharCode(65 + ((c - 1) % 26)) + s; c = Math.floor((c - 1) / 26); } return s; };
const THAI_MONTH_FULL = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_DAY = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
// เดือนของปีการศึกษา: ภาค 1 = พ.ค.–ต.ค. · ภาค 2 = พ.ย.–เม.ย.
export const ATT_MONTHS = [['พ.ค.', 5], ['มิ.ย.', 6], ['ก.ค.', 7], ['ส.ค.', 8], ['ก.ย.', 9], ['ต.ค.', 10], ['พ.ย.', 11], ['ธ.ค.', 12], ['ม.ค.', 1], ['ก.พ.', 2], ['มี.ค.', 3], ['เม.ย.', 4]];
const SIGN_LINE = 'ลงชื่อ................................................ครูประจำชั้น/ครูประจำวิชา';
const monthKey = (d, mo) => { const gy = d.year - 543; const y = mo >= 5 ? gy : gy + 1; return { y, pre: `${y}-${String(mo).padStart(2, '0')}-`, days: new Date(y, mo, 0).getDate() }; };
export const citizenText = (id) => { const x = String(id ?? '').replace(/\D/g, ''); return x.length === 13 ? `${x[0]} ${x.slice(1, 5)} ${x.slice(5, 10)} ${x.slice(10, 12)} ${x[12]}` : (id || null); };
export const birthText = (iso) => {
  if (!iso) return null; const [y, mo, d] = String(iso).slice(0, 10).split('-').map(Number); if (!y) return null;
  return `วัน${THAI_DAY[new Date(y, mo - 1, d).getDay()]}ที่ ${d} ${THAI_MONTH_FULL[mo]} ${y + 543}`;
};
const nameOf = (st) => `${st.s.prefix ?? ''}${st.s.first_name ?? ''} ${st.s.last_name ?? ''}`.trim();
const gradeCols = [['AL', 'มส'], ['AQ', 'ร'], ['AV', 0], ['BA', 1], ['BF', 1.5], ['BK', 2], ['BP', 2.5], ['BU', 3], ['BZ', 3.5], ['CE', 4]];
const countOf = (xs, v) => xs.filter((x) => x === v).length;

WRITERS['ปก ปพ.5 รายชั้น'] = {
  write(put, m) {
    const d = m.d; const sch = m.sch;
    put('A3', m.school); put('A4', sch.area_office || null);
    const rm = d.room && String(d.room) !== '1' ? `/${d.room}` : '';
    put('H6', `${d.level}${rm}`); put('AW6', d.term); put('BS6', d.year);
    put('F8', m.homeroom || null);
    ['start', 'left', 'joined', 'end'].forEach((k, i) => {
      const c = d.counts?.[k] || { 'ช': 0, 'ญ': 0 }; const r = 10 + i;
      put(`AH${r}`, c['ช']); put(`BD${r}`, c['ญ']); put(`BY${r}`, c['ช'] + c['ญ']);
    });
    m.subjects.slice(0, 20).forEach((x, k) => {
      const r = 18 + k; const gs = x.rows.map((row) => row.grade);
      put(`E${r}`, x.code || null); put(`M${r}`, x.name || null);
      for (const [c, g] of gradeCols) put(`${c}${r}`, countOf(gs, g));
    });
    const lv = (key) => m.students.map((st) => st[key]);
    [['AB', 'AJ', 'AQ', 'AX'], ['BF', 'BN', 'BU', 'CB']].forEach((cols, k) => cols.forEach((c, v) => put(`${c}41`, countOf(lv(k ? 'rtw' : 'trait'), v))));
    ['AB', 'AJ', 'AQ', 'AX'].forEach((c, v) => put(`${c}45`, countOf(lv('comp'), v)));
    put('T55', sch.director_name ? `(${sch.director_name})` : null); put('A56', sch.director_title || 'ผู้อำนวยการโรงเรียน');
    if (d.approveDate) { const [y, mo, dd] = d.approveDate.split('-').map(Number); put('AE57', dd); put('AP57', THAI_MONTH_FULL[mo]); put('BF57', y + 543); }
  },
};
WRITERS['ชื่อนักเรียน'] = {
  noFill: true,
  write(put, m) {
    put('A1', `รายชื่อนักเรียน ${m.levelLine}`);
    m.d.students.slice(0, 46).forEach((st, i) => { const r = 3 + i;
      put(`A${r}`, st.no); put(`B${r}`, m.students[i].code); put(`C${r}`, nameOf(st)); put(`D${r}`, citizenText(st.citizen)); put(`E${r}`, birthText(st.birth)); });
    put('A49', SIGN_LINE);
  },
};
WRITERS['บิดามารดา'] = {
  noFill: true,
  write(put, m) {
    put('B1', m.levelLine);
    m.d.students.slice(0, 46).forEach((st, i) => { const r = 3 + i;
      put(`B${r}`, st.no); put(`C${r}`, st.fam?.father); put(`D${r}`, st.occ?.[0]); put(`E${r}`, st.fam?.mother); put(`F${r}`, st.occ?.[1]); });
    put('B49', SIGN_LINE);
  },
};
WRITERS['ผู้ปกครอง'] = {
  noFill: true,
  write(put, m) {
    put('B1', m.levelLine);
    m.d.students.slice(0, 46).forEach((st, i) => { const r = 3 + i;
      put(`B${r}`, st.no); put(`C${r}`, st.fam?.guardian); put(`D${r}`, st.fam?.relation); put(`E${r}`, st.occ?.[2]); put(`F${r}`, st.addrShort); });
    put('B49', SIGN_LINE);
  },
};
// เวลาเรียนรายเดือน: 1 = มา · ป · ล · ข ต่อวัน + สรุป ม ป ล ข ท้ายแถว
for (const [name, mo] of ATT_MONTHS) {
  WRITERS[name] = {
    noFill: true,
    write(put, m) {
      const d = m.d; const { y, pre, days } = monthKey(d, mo);
      put('B1', `เวลาเรียน ${m.levelLine}`); put('M2', THAI_MONTH_FULL[mo]); put('Y2', y + 543);
      d.students.slice(0, 45).forEach((st, i) => {
        const r = 4 + i; const cnt = { 1: 0, 'ป': 0, 'ล': 0, 'ข': 0 };
        put(`B${r}`, st.no);
        for (let day = 1; day <= days; day++) {
          const mark = st.att?.[`${pre}${String(day).padStart(2, '0')}`];
          if (mark === undefined || mark === null) continue;
          put(`${colLetters(2 + day)}${r}`, mark); if (mark in cnt) cnt[mark]++;
        }
        ['AH', 'AI', 'AJ', 'AK'].forEach((c, k) => put(`${c}${r}`, cnt[[1, 'ป', 'ล', 'ข'][k]] || '-'));   // 0 แสดงเป็น - (เหมือนใบที่พิมพ์ของโรงเรียน)
      });
      put('B50', SIGN_LINE);
    },
  };
}
// สรุปเวลาเรียนรายภาค: จำนวนวันมาเรียนรายเดือน · เต็ม = วันที่มีบันทึกของนักเรียนคนนั้น · ร้อยละ = มา ÷ เต็ม
for (const t of [1, 2]) {
  WRITERS[`เวลา รวม ${t}`] = {
    noFill: true,
    write(put, m) {
      const d = m.d; const months = ATT_MONTHS.slice((t - 1) * 6, t * 6);
      put('A1', `สรุปเวลาเรียน ${m.levelLine}`);
      d.students.slice(0, 46).forEach((st, i) => {
        const r = 4 + i; let full = 0; let came = 0;
        put(`A${r}`, st.no); put(`B${r}`, nameOf(st));
        months.forEach(([, mo], k) => {
          const { pre, days } = monthKey(d, mo); let c = 0;
          for (let day = 1; day <= days; day++) { const mk = st.att?.[`${pre}${String(day).padStart(2, '0')}`]; if (mk === undefined || mk === null) continue; full++; if (mk === 1) c++; }
          came += c; put(`${colLetters(3 + k)}${r}`, c || '-');
        });
        put(`I${r}`, full); put(`J${r}`, came); put(`K${r}`, full ? round2((came / full) * 100) : null);
      });
      put('A50', SIGN_LINE);
    },
  };
}
export const FORM_SHEETS = Object.keys(WRITERS);
// เฟส 1 ของชุด ปพ.5 ในตัว (เรียงตามลำดับที่โรงเรียนพิมพ์)
export const PP5_PHASE1 = ['ปก ปพ.5 รายชั้น', 'ชื่อนักเรียน', 'บิดามารดา', 'ผู้ปกครอง', ...ATT_MONTHS.map((x) => x[0]), 'เวลา รวม 1', 'เวลา รวม 2'];
// ชุดที่พิมพ์ของภาคเรียนนั้น (ตัดเดือน/เวลารวมของอีกภาคออก)
export function pp5Set(term) {
  return PP5_PHASE1.filter((n) => {
    const i = ATT_MONTHS.findIndex((x) => x[0] === n); if (i >= 0) return Math.floor(i / 6) + 1 === term;
    const w = /^เวลา รวม (\d)$/.exec(n); return w ? Number(w[1]) === term : true;
  });
}

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
  // ล้างสีพื้นของแผ่น (ไฟล์แบบพิมพ์ใช้สีชมพู/เหลืองบอกช่องกรอก แต่ใบที่พิมพ์ของโรงเรียนเป็นพื้นขาว)
  stripFills(sheet) {
    const sh = this.wb.sheet(sheet); if (!sh || (this.stripped ||= new Set()).has(sheet)) return;
    const xfs = this.wb.styles.cellXfs; const cache = new Map();
    const clean = (s) => {
      const xf = xfs[s]; if (!xf || !xf.fillId) return s;
      if (!cache.has(s)) { xfs.push({ ...xf, fillId: 0 }); cache.set(s, xfs.length - 1); }
      return cache.get(s);
    };
    for (const c of sh.cells.values()) if (c.s !== undefined && c.s !== null) c.s = clean(c.s);
    for (const c of sh.cols) if (c.style) c.style = clean(c.style);
    for (const r of sh.rows.values()) if (r.style !== null && r.style !== undefined) r.style = clean(r.style);
    this.stripped.add(sheet);
  }
  fill(sheet, m, i = 0) {
    const w = WRITERS[sheet]; if (!w) return false;
    if (w.noFill) this.stripFills(sheet);
    this.reset(sheet);
    w.write((ref, v) => this.put(sheet, ref, v), m, i);
    return true;
  }
}
