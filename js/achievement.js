// =====================================================================
//  แบบบันทึกผลสัมฤทธิ์ทางการเรียนรายวิชา (แผ่นงาน "ผลสัมฤทธิ์")
//  วางตำแหน่งเซลล์ตามไฟล์ Excel เดิมของโรงเรียน:
//    A เลขที่ · B ชื่อ-สกุล · C–AX ช่องคะแนนระหว่างเรียน (48 ช่อง) · AY รวม · AZ ปลายภาค · BA รวม · BB ระดับผลการเรียน
//    แถว 5 ชื่อช่อง · แถว 6 คะแนนเต็ม · แถว 7–51 นักเรียน (45 คน) · แถว 52–54 รวม/เฉลี่ย/เฉลี่ย % · แถว 56 ลงชื่อ
//  ใส่สูตรแบบเดียวกับไฟล์เดิม เปิดใน Excel แล้วแก้คะแนนต่อได้ ผลคำนวณเปลี่ยนตาม
//  ปรับจากไฟล์เดิม: ซ่อนช่องคะแนนที่ไม่ได้ใช้ และพิมพ์เลขที่/ชื่อซ้ำทุกหน้า
// =====================================================================
import { Sheet, ref, colName } from './xlsx-write.js?v=2569.10.31-13';
import { ROUNDING, toGrade } from './grading.js?v=2569.10.31-13';

export const SLOTS = 48;            // ช่องคะแนนในไฟล์เดิม (C..AX)
export const ROWS = 45;             // แถวนักเรียนในไฟล์เดิม (7..51)
const PER_PAGE = 18;                // ช่องที่พิมพ์ได้ต่อหน้า (ต่อจากเลขที่และชื่อ) ตามไฟล์เดิม
const PINK = 'FFCCFF';
const F = 'TH SarabunPSK';

const S = {
  title: { font: { name: F, sz: 14, b: true }, fill: PINK, align: { v: 'center' } },
  band: { fill: PINK },
  head: { font: { name: F, sz: 14, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', wrap: true } },
  headRot: { font: { name: F, sz: 14, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', rot: 90, wrap: true } },
  item: { font: { name: F, sz: 14, b: true }, border: 'thin', align: { h: 'center', v: 'bottom', rot: 90, wrap: true } },
  max: { font: { name: F, sz: 13, b: true }, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  maxCalc: { font: { name: F, sz: 13, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  no: { font: { name: F, sz: 12 }, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  name: { font: { name: F, sz: 13 }, border: 'thin', align: { v: 'center', shrink: true } },
  cell: { font: { name: F, sz: 12 }, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  calc: { font: { name: F, sz: 12 }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  calcB: { font: { name: F, sz: 12, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  footLabel: { font: { name: F, sz: 14, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center' } },
  foot: { font: { name: F, sz: 12, b: true }, fill: PINK, border: 'thin', align: { h: 'center', v: 'center', shrink: true } },
  foot2: { font: { name: F, sz: 12, b: true }, fill: PINK, border: 'thin', numFmt: '0.0#', align: { h: 'center', v: 'center', shrink: true } },
  sign: { font: { name: F, sz: 14, b: true }, align: { v: 'center', shrink: true } },
  signC: { font: { name: F, sz: 14 }, align: { h: 'center', v: 'center', shrink: true } },
};

// สูตรปัดเศษคะแนนระหว่างภาคตามที่ตั้งค่าโรงเรียน (ค่าเริ่มต้นเหมือนไฟล์เดิม: ROUNDDOWN)
const ROUND_F = { floor: (x) => `ROUNDDOWN(${x},0)`, round: (x) => `ROUND(${x},0)`, none: (x) => `ROUND(${x},2)` };
const GRADE_F = (t) => `IF(${t}<50,0,IF(${t}<55,1,IF(${t}<60,1.5,IF(${t}<65,2,IF(${t}<70,2.5,IF(${t}<75,3,IF(${t}<80,3.5,4)))))))`;

/**
 * @param spec {
 *   sheetName, line1 ('ชั้นมัธยมศึกษาปีที่ 1 ภาคเรียนที่ 1 ปีการศึกษา 2569'), line2 ('วิชา ...'),
 *   midRatio, finalRatio, rounding ('floor'|'round'|'none'),
 *   items: [{ title, max }],                  // คะแนนเก็บระหว่างภาค เรียงซ้ายไปขวา
 *   students: [{ no, name, scores: [number|null], final: number|null, special: 'ร'|'มส'|null }],
 *   signs: [{ line, name }]                   // บรรทัดลงชื่อ (ไม่ใส่ = ครูผู้สอน + ผู้อำนวยการ)
 * }
 */
export function achievementSheet(spec) {
  const items = spec.items || [];
  const studs = spec.students || [];
  const n = items.length;
  const N = Math.max(SLOTS, n);
  const C0 = 3;                         // C
  const AY = C0 + N; const AZ = AY + 1; const BA = AY + 2; const BB = AY + 3;
  const R0 = 7; const R = Math.max(ROWS, studs.length); const RL = R0 + R - 1;
  const rSum = RL + 1; const rAvg = RL + 2; const rPct = RL + 3;
  const mid = Number(spec.midRatio ?? 70); const fin = Number(spec.finalRatio ?? 30);
  const roundKey = ROUND_F[spec.rounding] ? spec.rounding : 'floor';
  const R_ = (ROUNDING[roundKey] || ROUNDING.floor).fn;

  const sh = new Sheet(spec.sheetName || 'ผลสัมฤทธิ์');
  sh.defaultRowHeight = 16.5;
  sh.freeze = { c: C0, r: R0 };
  sh.printTitles = { cols: [1, 2], rows: [1, 6] };
  sh.page = { paper: 9, orientation: 'portrait', scale: 85, left: 0.59, right: 0.59, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1, hCenter: true };

  // ---------- ความกว้างคอลัมน์ / ซ่อนช่องที่ไม่ได้ใช้ ----------
  sh.width(1, 6).width(2, 25.67);
  for (let c = C0; c < AY; c++) sh.width(c, 3.16, c - C0 >= n);
  sh.width(AY, 4.16).width(AZ, 4.5).width(BA, 4.5).width(BB, 4.5);

  // ---------- แบ่งหน้าตามแนวนอน (ไม่ให้ 4 ช่องสรุปแยกหน้า) ----------
  const visible = [...Array(n).keys()].map((i) => C0 + i).concat([AY, AZ, BA, BB]);
  const pages = [];
  for (let i = 0; i < visible.length;) {
    let end = Math.min(i + PER_PAGE, visible.length);
    const sumAt = visible.length - 4;
    if (end > sumAt && end < visible.length && end - i > 4) end = sumAt;   // ย้ายช่องสรุปไปหน้าถัดไปทั้งชุด
    pages.push(visible.slice(i, end)); i = end;
  }
  sh.colBreaks = pages.slice(0, -1).map((p) => p[p.length - 1]);

  // ---------- แถว 1–3: หัวกระดาษ (ซ้ำทุกหน้า) ----------
  for (let r = 1; r <= 3; r++) { sh.height(r, 16.5); sh.styleRange(1, r, BB, r, S.band); }
  const ratioText = `อัตราส่วนคะแนน ระหว่างเรียน : ปลายภาค = ${mid} : ${fin}`;
  pages.forEach((p, i) => {
    const c = i === 0 ? C0 : p[0];
    if (i === 0) {
      sh.set(c, 1, spec.line1 || '', S.title).set(c, 2, spec.line2 || '', S.title)
        .set(c, 3, ratioText, S.title, `"อัตราส่วนคะแนน ระหว่างเรียน : ปลายภาค = "&$${colName(AY)}$6&" : "&$${colName(AZ)}$6`);
    } else {
      sh.set(c, 1, spec.line1 || '', S.title, '$C$1').set(c, 2, spec.line2 || '', S.title, '$C$2').set(c, 3, ratioText, S.title, '$C$3');
    }
  });

  // ---------- แถว 4–6: หัวตาราง ----------
  sh.height(4, 18).height(5, 101).height(6, 16.5);
  sh.set(1, 4, 'เลขที่', S.head).merge(1, 4, 1, 6).styleRange(1, 4, 1, 6, S.head);
  sh.set(2, 4, 'ชื่อ-สกุล', S.head).merge(2, 4, 2, 6).styleRange(2, 4, 2, 6, S.head);
  let ayAlone = false;
  // "คะแนนระหว่างเรียน" ผสานเซลล์แยกตามหน้า (เหมือนไฟล์เดิม C4:T4, U4:AL4, AM4:AY4)
  for (const p of pages) {
    const cs = p.filter((c) => c <= AY);
    if (!cs.length) continue;
    const a = cs[0]; const b = cs[cs.length - 1];
    if (a === AY) { ayAlone = true; sh.set(AY, 4, 'รวมคะแนนเก็บ', S.headRot).merge(AY, 4, AY, 5); continue; }   // หน้าที่เหลือแค่ช่องรวม
    sh.set(a, 4, 'คะแนนระหว่างเรียน', S.head).styleRange(a, 4, b, 4, S.head).merge(a, 4, b, 4);
  }
  for (let c = C0; c < AY; c++) {
    const it = items[c - C0];
    sh.set(c, 5, it ? (it.title || `${c - C0 + 1}`) : null, S.item);
    sh.set(c, 6, it && it.max !== null && it.max !== undefined && it.max !== '' ? Number(it.max) : null, S.max);
  }
  if (!ayAlone) sh.set(AY, 5, 'รวม', S.headRot); else sh.style(AY, 5, S.headRot);
  sh.set(AY, 6, mid, S.max);
  sh.set(AZ, 4, 'ทดสอบปลายภาค', S.headRot).merge(AZ, 4, AZ, 5).style(AZ, 5, S.headRot).set(AZ, 6, fin, S.max);
  sh.set(BA, 4, 'รวม', S.headRot).merge(BA, 4, BA, 5).style(BA, 5, S.headRot).set(BA, 6, mid + fin, S.maxCalc, `SUM(${ref(AY, 6)}:${ref(AZ, 6)})`);
  sh.set(BB, 4, 'ระดับผลการเรียน', S.headRot).merge(BB, 4, BB, 6).styleRange(BB, 4, BB, 6, S.headRot);

  // ---------- แถวนักเรียน ----------
  const rawMax = items.reduce((s, it) => s + (Number(it.max) || 0), 0);
  const colVals = Array.from({ length: BA + 1 }, () => []);
  for (let i = 0; i < R; i++) {
    const r = R0 + i; const st = studs[i];
    sh.height(r, 14.25);
    const A = ref(1, r);
    sh.set(1, r, st ? (st.no ?? i + 1) : null, S.no);
    sh.set(2, r, st ? st.name : null, S.name);
    let raw = 0;
    for (let c = C0; c < AY; c++) {
      const v = st ? st.scores?.[c - C0] : null;
      const num = v === null || v === undefined || v === '' ? null : Number(v);
      sh.set(c, r, num, S.cell);
      if (num !== null && Number.isFinite(num)) { raw += num; colVals[c].push(num); }
    }
    // AY: =IF(A7="","",IFERROR(ROUNDDOWN(SUM(C7:AX7)/(SUM($C$6:$AX$6)/$AY$6),0),""))
    const fAY = `IF(${A}="","",IFERROR(${ROUND_F[roundKey](`SUM(${ref(C0, r)}:${ref(AY - 1, r)})/(SUM($${colName(C0)}$6:$${colName(AY - 1)}$6)/$${colName(AY)}$6)`)},""))`;
    const ay = st && rawMax > 0 ? R_(raw / (rawMax / mid)) : (st ? '' : '');
    sh.set(AY, r, ay, S.calc, fAY);
    const finV = st && st.final !== null && st.final !== undefined && st.final !== '' ? Number(st.final) : null;
    sh.set(AZ, r, finV, S.cell);
    // ยังไม่มีคะแนนเลยสักช่อง = เว้นว่าง (ไฟล์เดิมจะขึ้น 0 ซึ่งดูเหมือนสอบตก)
    const none = `OR(${A}="",COUNT(${ref(C0, r)}:${ref(AY - 1, r)})+COUNT(${ref(AZ, r)})=0)`;
    const anyScore = !!st && (st.scores || []).some((v) => v !== null && v !== undefined && v !== '') || finV !== null;
    const ba = anyScore ? (Number(ay) || 0) + (finV || 0) : '';
    sh.set(BA, r, ba, S.calcB, `IF(${none},"",SUM(${ref(AY, r)}:${ref(AZ, r)}))`);
    if (st && st.special) sh.set(BB, r, st.special, S.calcB);
    else sh.set(BB, r, anyScore ? toGrade(ba) : '', S.calcB, `IF(${none},"",${GRADE_F(ref(BA, r))})`);
    if (st) { if (ay !== '') colVals[AY].push(ay); if (finV !== null) colVals[AZ].push(finV); if (ba !== '') colVals[BA].push(ba); }
  }

  // ---------- รวม / เฉลี่ย / เฉลี่ย % ----------
  [[rSum, 'รวม'], [rAvg, 'เฉลี่ย'], [rPct, 'เฉลี่ย %']].forEach(([r, label]) => {
    sh.height(r, 14.25); sh.set(1, r, label, S.footLabel).style(2, r, S.footLabel).merge(1, r, 2, r);
  });
  for (let c = C0; c <= BA; c++) {
    const L = colName(c); const vals = colVals[c];
    const max = c < AY ? items[c - C0]?.max : c === AY ? mid : c === AZ ? fin : mid + fin;
    const has = max !== null && max !== undefined && max !== '';
    const sum = vals.reduce((s, v) => s + v, 0); const avg = vals.length ? sum / vals.length : null;
    sh.set(c, rSum, has ? sum : '', S.foot, `IF(${L}6="","",SUM(${L}${R0}:${L}${RL}))`);
    sh.set(c, rAvg, has && avg !== null ? avg : '', S.foot2, `IF(${L}6="","",AVERAGE(${L}${R0}:${L}${RL}))`);
    sh.set(c, rPct, has && avg !== null && Number(max) ? (avg / Number(max)) * 100 : '', S.foot2, `IF(${L}6="","",(${L}${rAvg}/${L}6)*100)`);
  }
  sh.styleRange(BB, rSum, BB, rPct, S.foot);

  // ---------- ลงชื่อ (ครูผู้สอน / ผู้อำนวยการ) ----------
  sh.height(rPct + 1, 5);
  const signs = spec.signs ?? [
    { line: 'ลงชื่อ.............................ครูผู้สอน', name: '' },
    { line: 'ลงชื่อ.......................ผู้อำนวยการโรงเรียน', name: '' },
  ];
  let r = rPct + 2;
  for (const g of signs) {
    // ใส่ในคอลัมน์ A:B ซึ่งพิมพ์ซ้ำทุกหน้า จึงมีช่องลงชื่อทุกหน้าเหมือนไฟล์เดิม
    sh.height(r, 16.5).set(1, r, g.line, S.sign).merge(1, r, 2, r);
    sh.height(r + 1, 16.5).set(1, r + 1, g.name ? `( ${g.name} )` : '(..................................)', S.signC).merge(1, r + 1, 2, r + 1);
    r += 2;
  }

  return sh;
}

// ชื่อ-สกุลแบบไฟล์เดิม (เว้น 2 ช่องระหว่างชื่อกับนามสกุล)
export const sheetName = (s) => `${s.prefix ?? ''}${s.first_name ?? ''}  ${s.last_name ?? ''}`.trim();
