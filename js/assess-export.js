// =====================================================================
//  ส่งออกแบบประเมินละเอียดเป็นไฟล์ Excel ตามแบบไฟล์ของโรงเรียน
//  · คุณลักษณะ: แผ่นงาน "ข้อที่ 1.1" … "ข้อที่ 8.2" + "แบบสรุปผลการประเมิน" + "สรุปผล"
//  · สมรรถนะ: "ข้อที่1 สื่อสาร" … "ข้อที่ 5 เทคโนโลยี" + "สรุปผล" + "แบบสรุปผล"
//  ทุกแผ่นมีสูตรเชื่อมกันเหมือนไฟล์เดิม แก้คะแนนใน Excel แล้วผลสรุปเปลี่ยนตาม
// =====================================================================
import { Sheet, ref, colName } from './xlsx-write.js?v=2569.10.31-13';
import { TRAITS, SUBS, subResult, traitOverall, LV4, COMPETENCIES, compResult, compOverall, COMP_LV } from './assess-forms.js?v=2569.10.31-13';

const F = 'TH Sarabun New';
const BLUE = '92CDDC'; const BLUE2 = 'DAEEF3'; const PINK = 'F2DCDB';
const GREEN = 'C4D79B'; const GREEN2 = 'EBF1DE'; const CREAM = 'FFF2CC';
const st = (o) => ({ font: { name: F, sz: 16, ...(o.font || {}) }, ...o, font: { name: F, sz: 16, ...(o.font || {}) } });
const S = {
  title: st({ font: { b: true }, align: { h: 'center', v: 'center' } }),
  left: st({ font: { b: true }, align: { v: 'center' } }),
  note: st({ font: { sz: 14 }, align: { v: 'center' } }),
  head: (fill) => st({ font: { b: true }, fill, border: 'thin', align: { h: 'center', v: 'center', wrap: true } }),
  rot: (fill, sz = 14) => st({ font: { sz }, fill, border: 'thin', align: { h: 'center', v: 'center', rot: 90, wrap: true } }),
  no: st({ border: 'thin', align: { h: 'center', v: 'center' } }),
  name: st({ border: 'thin', align: { v: 'center', shrink: true } }),
  cell: st({ border: 'thin', align: { h: 'center', v: 'center' } }),
  calc: (fill, numFmt) => st({ fill, border: 'thin', numFmt, align: { h: 'center', v: 'center', shrink: true } }),
  label: st({ border: 'thin', align: { v: 'center', shrink: true } }),
};
const q = (name) => `'${name.replace(/'/g, "''")}'`;
const IFS = (cases, other) => cases.reduceRight((acc, [cond, v]) => `IF(${cond},"${v}",${acc})`, `"${other}"`);

function base(name, { landscape = false } = {}) {
  const sh = new Sheet(name);
  sh.defaultRowHeight = 21;
  sh.page = { paper: 9, orientation: landscape ? 'landscape' : 'portrait', left: 0.5, right: 0.4, top: 0.4, bottom: 0.3, hCenter: true, fitToWidth: 1, fitToHeight: 1 };
  return sh;
}
// หัวกระดาษ 3 บรรทัด ผสานเต็มความกว้าง
function titles(sh, lines, lastCol, { from = 1 } = {}) {
  lines.forEach((t, i) => { const r = from + i; sh.height(r, 22).set(1, r, t, i === 0 ? S.title : st({ font: { b: true, sz: 16 }, align: { h: 'center', v: 'center' } })).merge(1, r, lastCol, r); });
}
// เลขที่ + ชื่อ (B:D ผสาน) ของนักเรียนแต่ละแถว
function studentCells(sh, r, s, i) {
  sh.height(r, 18.75);
  sh.set(1, r, s ? (s.no ?? i + 1) : null, S.no);
  sh.set(2, r, s ? s.name : null, S.name).style(3, r, S.name).style(4, r, S.name).merge(2, r, 4, r);
}
function signRows(sh, r, lines, col = 2) {
  lines.forEach((t, i) => sh.height(r + i, 22).set(col, r + i, t, st({ align: { v: 'center' } })));
}

// =====================================================================
//  คุณลักษณะอันพึงประสงค์
// =====================================================================
/**
 * @param info { line2: 'ชั้น… ภาคเรียนที่ … ปีการศึกษา …', schoolName: 'โรงเรียน…', area: 'สำนักงานเขต…', homeroom: [ชื่อครู] }
 * @param students [{ no, name, get(code) → คะแนน|null }]
 */
export function traitWorkbook(info, students) {
  const R = Math.max(30, students.length);
  const head4 = (t) => [t, info.line2, info.schoolName, info.area].filter(Boolean);
  const sheets = []; const totalRef = {};   // code → { sheet, col }
  // แถวในแผ่นรายตัวชี้วัด: หัวกระดาษ 4 · "ข้อที่" 1 · หัวตาราง 3 แถว
  const TL = head4('x').length; const RH = TL + 2; const R0 = RH + 3;

  // ---------- แผ่นรายตัวชี้วัด ----------
  for (const sub of SUBS) {
    const n = sub.items.length; const E = 5; const T = E + n; const AV = T + 1; const RS = T + 2;
    const name = `ข้อที่ ${sub.code}`;
    totalRef[sub.code] = { sheet: name, col: T };
    const sh = base(name);
    [5.5, 6.8, 9.2, 9.5].forEach((w, i) => sh.width(i + 1, w));
    for (let c = E; c < T; c++) sh.width(c, n > 3 ? 9.5 : 11.2);
    sh.width(T, 7).width(AV, 8).width(RS, 11);
    titles(sh, head4('แบบประเมินคุณลักษณะอันพึงประสงค์'), RS);
    sh.height(TL + 1, 24).set(1, TL + 1, `ข้อที่ ${sub.trait}  ${sub.traitName}`, S.left).merge(1, TL + 1, RS, TL + 1);
    const H = S.head(BLUE);
    sh.height(RH, 24).height(RH + 1, 48).height(RH + 2, 175);
    sh.set(1, RH, 'เลขที่', H).styleRange(1, RH, 1, RH + 2, H).merge(1, RH, 1, RH + 2);
    sh.set(2, RH, 'ชื่อ-สกุล', H).styleRange(2, RH, 4, RH + 2, H).merge(2, RH, 4, RH + 2);
    sh.set(E, RH, 'ตัวชี้วัด/พฤติกรรมบ่งชี้', H).styleRange(E, RH, T - 1, RH, H).merge(E, RH, T - 1, RH);
    sh.set(E, RH + 1, `${sub.code} ${sub.title}`, st({ font: { b: true, sz: 14 }, fill: BLUE, border: 'thin', align: { h: 'center', v: 'center', wrap: true, shrink: true } }))
      .styleRange(E, RH + 1, T - 1, RH + 1, H).merge(E, RH + 1, T - 1, RH + 1);
    sub.items.forEach((t, i) => sh.set(E + i, RH + 2, `${sub.code}.${i + 1} ${t}`, S.rot(BLUE2, 13)));
    [[T, 'รวม'], [AV, 'เฉลี่ย'], [RS, 'ผลการประเมิน']].forEach(([c, t]) => sh.set(c, RH, t, H).styleRange(c, RH, c, RH + 2, H).merge(c, RH, c, RH + 2));
    const [ex, good, pass] = sub.cut;
    for (let i = 0; i < R; i++) {
      const r = R0 + i; const s = students[i]; const A = `$A${r}`;
      studentCells(sh, r, s, i);
      sub.items.forEach((_, j) => { const v = s ? s.get(`${sub.code}.${j + 1}`) : null; sh.set(E + j, r, v ?? null, S.cell); });
      const res = s ? subResult(sub, s.get) : null;
      const tot = ref(T, r);
      sh.set(T, r, res ? res.sum : '', S.calc(PINK), `IF(${A}="","",SUM(${ref(E, r)}:${ref(T - 1, r)}))`);
      sh.set(AV, r, res ? res.avg : '', S.calc(PINK, '0.00'), `IF(${A}="","",${tot}/${n})`);
      sh.set(RS, r, res ? res.label : '', S.calc(PINK), `IF(${A}="","",${IFS([[`${tot}>${ex}`, 'ดีเยี่ยม'], [`${tot}>=${good}`, 'ดี'], [`${tot}>=${pass}`, 'ผ่าน']], 'ไม่ผ่าน')})`);
    }
    sh.height(R0 + R, 8);
    sh.set(2, R0 + R + 1, `เกณฑ์: ให้คะแนน 0–3 ต่อพฤติกรรม · รวมมากกว่า ${ex} ดีเยี่ยม · ${good}–${ex} ดี · ${pass}–${good - 1} ผ่าน · ต่ำกว่า ${pass} ไม่ผ่าน`, S.note);
    sh.freeze = { c: E, r: R0 };
    sheets.push(sh);
  }

  // ---------- แบบสรุปผลการประเมิน (รายบุคคล) ----------
  const sum = base('แบบสรุปผลการประเมิน');
  const SH = TL + 1; const S0 = SH + 2; const E = 5; const M = 13; const N = 14; const O = 15;
  [5.2, 9.2, 9.8, 10.8, 7, 7, 7, 7, 7, 7, 7, 7, 6.5, 7.5, 10].forEach((w, i) => sum.width(i + 1, w));
  titles(sum, head4('แบบรายงานผลการประเมินคุณลักษณะอันพึงประสงค์ของผู้เรียนรายบุคคล'), O);
  const H = S.head(BLUE);
  sum.height(SH, 24).height(SH + 1, 115);
  sum.set(1, SH, 'เลขที่', H).styleRange(1, SH, 1, SH + 1, H).merge(1, SH, 1, SH + 1);
  sum.set(2, SH, 'ชื่อ-สกุล', H).styleRange(2, SH, 4, SH + 1, H).merge(2, SH, 4, SH + 1);
  sum.set(E, SH, 'คุณลักษณะอันพึงประสงค์', H).styleRange(E, SH, E + 7, SH, H).merge(E, SH, E + 7, SH);
  TRAITS.forEach((t, k) => sum.set(E + k, SH + 1, `${t.no}. ${t.name}`, S.rot(BLUE2)));
  [[M, 'รวม'], [N, 'เฉลี่ย'], [O, 'ผลการประเมิน']].forEach(([c, t]) => sum.set(c, SH, t, H).styleRange(c, SH, c, SH + 1, H).merge(c, SH, c, SH + 1));
  for (let i = 0; i < R; i++) {
    const r = S0 + i; const s = students[i]; const A = `$A${r}`;
    studentCells(sum, r, s, i);
    const ov = s ? traitOverall(s.get) : null;
    TRAITS.forEach((t, k) => {
      const count = t.subs.reduce((x, sb) => x + sb.items.length, 0);
      const parts = t.subs.map((sb) => `${q(totalRef[sb.code].sheet)}!${ref(totalRef[sb.code].col, R0 + i)}`).join('+');
      sum.set(E + k, r, ov ? ov.per[k].avg : '', S.calc(PINK, '0.00'), `IF(${A}="","",(${parts})/${count})`);
    });
    sum.set(M, r, ov ? ov.sum : '', S.calc(BLUE2, '0.00'), `IF(${A}="","",SUM(${ref(E, r)}:${ref(E + 7, r)}))`);
    sum.set(N, r, ov ? ov.avg : '', S.calc(BLUE2, '0.00'), `IF(${A}="","",${ref(M, r)}/8)`);
    const nv = ref(N, r);
    sum.set(O, r, ov ? LV4[ov.level] : '', S.calc(BLUE2), `IF(${A}="","",${IFS([[`${nv}>2.5`, 'ดีเยี่ยม'], [`${nv}>=1.5`, 'ดี'], [`${nv}>=1`, 'ผ่าน']], 'ไม่ผ่าน')})`);
  }
  const SL = S0 + R - 1;
  sum.height(SL + 1, 8);
  sum.set(2, SL + 2, 'เกณฑ์ (ค่าเฉลี่ย 0–3): มากกว่า 2.5 ดีเยี่ยม · 1.5–2.5 ดี · 1–1.49 ผ่าน · ต่ำกว่า 1 ไม่ผ่าน', S.note);
  signRows(sum, SL + 4, ['ลงชื่อ.......................................ครูประจำชั้น', `(${(info.homeroom || []).join(', ') || '.......................................'})`], 7);
  sum.freeze = { c: E, r: S0 };
  sheets.push(sum);

  // ---------- สรุปผล (จำนวน/ร้อยละ รายข้อ) ----------
  const cnt = base('สรุปผล');
  [5, 24, 8.5, 8, 8.5, 8, 8.5, 8, 8.5, 8, 9].forEach((w, i) => cnt.width(i + 1, w));
  titles(cnt, head4('แบบสรุปรายงานผลการประเมินคุณลักษณะอันพึงประสงค์'), 11);
  const C0 = TL + 1; const D0 = C0 + 4;     // หัวตาราง 4 แถว · ข้อมูลเริ่ม
  const HC = st({ font: { b: true }, border: 'thin', align: { h: 'center', v: 'center', wrap: true } });
  const H14 = st({ font: { b: true, sz: 14 }, border: 'thin', align: { h: 'center', v: 'center', wrap: true } });
  [24, 24, 21, 21].forEach((h, i) => cnt.height(C0 + i, h));
  cnt.set(1, C0, 'คุณลักษณะอันพึงประสงค์', HC).styleRange(1, C0, 2, C0 + 3, HC).merge(1, C0, 2, C0 + 3);
  cnt.set(3, C0, 'ระดับคุณภาพ', HC).styleRange(3, C0, 10, C0, HC).merge(3, C0, 10, C0);
  cnt.set(11, C0, 'หมายเหตุ', HC).styleRange(11, C0, 11, C0 + 3, HC).merge(11, C0, 11, C0 + 3);
  LV4.forEach((l, k) => {
    const c = 3 + k * 2;
    cnt.set(c, C0 + 1, l, HC).style(c + 1, C0 + 1, HC).merge(c, C0 + 1, c + 1, C0 + 1);
    cnt.set(c, C0 + 2, 'จำนวน', H14).set(c + 1, C0 + 2, 'ร้อยละ', H14).set(c, C0 + 3, 'นักเรียน', H14).style(c + 1, C0 + 3, H14).merge(c + 1, C0 + 2, c + 1, C0 + 3);
  });
  const RT = D0 + TRAITS.length;             // แถวรวม 8 ข้อ
  const NROW = RT + 2;                        // จำนวนนักเรียน
  const nStud = students.length;
  const bands = [['"<1"'], ['">=1"', '"<1.5"'], ['">=1.5"', '"<=2.5"'], ['">2.5"']];
  const inBand = (v, k) => (k === 0 ? v < 1 : k === 1 ? v >= 1 && v < 1.5 : k === 2 ? v >= 1.5 && v <= 2.5 : v > 2.5);
  const rangeOf = (c) => `${q('แบบสรุปผลการประเมิน')}!$${colName(c)}$${S0}:$${colName(c)}$${SL}`;
  const countF = (rg, k) => (bands[k].length === 1 ? `COUNTIF(${rg},${bands[k][0]})` : `COUNTIFS(${rg},${bands[k][0]},${rg},${bands[k][1]})`);
  const ovs = students.map((s) => traitOverall(s.get));
  const totals = [0, 0, 0, 0];
  const rowFor = (r, label, no, rg, vals) => {
    cnt.height(r, 24).set(1, r, no, S.cell).set(2, r, label, S.label);
    LV4.forEach((_, k) => {
      const c = 3 + k * 2; const v = vals.filter((x) => inBand(x, k)).length;
      cnt.set(c, r, v, S.cell, countF(rg, k));
      cnt.set(c + 1, r, nStud ? (v * 100) / nStud : 0, S.calc(null, '0.00'), `IF($C$${NROW}=0,0,${ref(c, r)}*100/$C$${NROW})`);
    });
    cnt.set(11, r, null, S.cell);
  };
  TRAITS.forEach((t, k) => {
    const vals = ovs.map((o) => o.per[k].avg);
    vals.forEach((v) => LV4.forEach((_, b) => { if (inBand(v, b)) totals[b]++; }));
    rowFor(D0 + k, t.name, t.no, rangeOf(E + k), vals);
  });
  cnt.height(RT, 24).set(1, RT, 'สรุปรวม (8 ข้อ)', st({ font: { b: true }, border: 'thin', align: { h: 'center', v: 'center' } })).style(2, RT, S.cell).merge(1, RT, 2, RT);
  LV4.forEach((_, k) => {
    const c = 3 + k * 2;
    cnt.set(c, RT, totals[k], S.cell, `SUM(${ref(c, D0)}:${ref(c, RT - 1)})`);
    cnt.set(c + 1, RT, nStud ? (totals[k] * 100) / (nStud * 8) : 0, S.calc(null, '0.00'), `IF($C$${NROW}=0,0,${ref(c, RT)}*100/($C$${NROW}*8))`);
  });
  cnt.set(11, RT, null, S.cell);
  rowFor(RT + 1, 'ผลการประเมินภาพรวม', '', rangeOf(N), ovs.map((o) => o.avg));
  cnt.height(NROW, 24).set(2, NROW, 'จำนวนนักเรียน', S.label).set(3, NROW, nStud, st({ fill: 'FFFF00', border: 'thin', align: { h: 'center', v: 'center' } }),
    `COUNTA(${q('แบบสรุปผลการประเมิน')}!$B$${S0}:$B$${SL})`).set(4, NROW, 'คน', S.label);
  cnt.set(2, NROW + 2, 'เกณฑ์ (ค่าเฉลี่ย 0–3): ไม่ผ่าน ต่ำกว่า 1 · ผ่าน 1–1.49 · ดี 1.5–2.5 · ดีเยี่ยม มากกว่า 2.5', S.note);
  signRows(cnt, NROW + 4, ['ลงชื่อ.......................................ครูประจำชั้น', `(${(info.homeroom || []).join(', ') || '.......................................'})`], 5);
  sheets.push(cnt);
  return sheets;
}

// =====================================================================
//  สมรรถนะสำคัญของผู้เรียน
// =====================================================================
export function competencyWorkbook(info, students) {
  const R = Math.max(15, students.length);
  const head4 = (t) => [t, info.line2, info.schoolName, info.area].filter(Boolean);
  const TL = head4('x').length; const RH = TL + 2; const R0 = RH + 3;
  const sheets = [];
  const H = S.head(GREEN);
  for (const comp of COMPETENCIES) {
    const sh = base(comp.sheet);
    [5.1, 7.4, 10.1, 10.4, 9, 9, 9, 9, 9, 7.5, 7.5, 9].forEach((w, i) => sh.width(i + 1, w));
    titles(sh, head4(`แบบประเมินสมรรถนะสำคัญของผู้เรียน สมรรถนะที่ ${comp.no} ${comp.name}`), 12);
    sh.height(TL + 1, 22).set(1, TL + 1, 'คำชี้แจง  ให้ผู้สอนสังเกตพฤติกรรมของผู้เรียน และให้คะแนน 1 2 หรือ 3 ลงในช่องรายการประเมิน', st({ font: { b: true, sz: 14 }, align: { v: 'center' } })).merge(1, TL + 1, 12, TL + 1);
    sh.height(RH, 26).height(RH + 1, 135).height(RH + 2, 24);
    sh.set(1, RH, 'เลขที่', H).styleRange(1, RH, 1, RH + 2, H).merge(1, RH, 1, RH + 2);
    sh.set(2, RH, 'ชื่อ - สกุล', H).styleRange(2, RH, 4, RH + 2, H).merge(2, RH, 4, RH + 2);
    sh.set(5, RH, `รายการประเมิน${comp.name}`, st({ font: { b: true, sz: 14 }, fill: GREEN, border: 'thin', align: { h: 'center', v: 'center', wrap: true, shrink: true } })).styleRange(5, RH, 9, RH, H).merge(5, RH, 9, RH);
    comp.items.forEach((t, j) => sh.set(5 + j, RH + 1, `${j + 1}. ${t}`, S.rot(GREEN2, 13)).style(5 + j, RH + 2, S.rot(GREEN2, 13)).merge(5 + j, RH + 1, 5 + j, RH + 2));
    sh.set(10, RH, `สรุปการประเมิน${comp.name}`, H).styleRange(10, RH, 12, RH + 1, H).merge(10, RH, 12, RH + 1);
    sh.set(10, RH + 2, 'คะแนน', H).set(11, RH + 2, 'สรุปผล', H).set(12, RH + 2, 'แปลผล', H);
    for (let i = 0; i < R; i++) {
      const r = R0 + i; const s = students[i]; const A = `$A${r}`;
      studentCells(sh, r, s, i);
      comp.items.forEach((_, j) => sh.set(5 + j, r, s ? (s.get(`${comp.no}.${j + 1}`) ?? null) : null, S.cell));
      const res = s ? compResult(comp, s.get) : null;
      const rg = `${ref(5, r)}:${ref(9, r)}`; const J = ref(10, r);
      sh.set(10, r, res ? res.sum : '', S.calc(CREAM), `IF(${A}="","",SUM(${rg}))`);
      // ฐานนิยม ถ้าซ้ำเท่ากันเลือกค่าต่ำสุด (เทียบเท่า MIN(MODE.MULT()) ในไฟล์เดิม แต่ใช้ได้ทุกรุ่นของ Excel)
      const c1 = `COUNTIF(${rg},1)`; const c2 = `COUNTIF(${rg},2)`; const c3 = `COUNTIF(${rg},3)`;
      sh.set(11, r, res ? res.level : '', S.calc(CREAM),
        `IF(${A}="","",IF(COUNT(${rg})=0,0,IF(AND(${c1}>0,${c1}>=${c2},${c1}>=${c3}),1,IF(AND(${c2}>0,${c2}>=${c3}),2,IF(${c3}>0,3,MIN(${rg}))))))`);
      sh.set(12, r, res ? res.label : '', S.calc(CREAM), `IF(${A}="","",${IFS([[`${J}=0`, 'ไม่ผ่าน'], [`${J}>12.1`, 'ดีเยี่ยม'], [`${J}>=9`, 'ดี']], 'ผ่าน')})`);
    }
    sh.height(R0 + R, 8);
    sh.set(2, R0 + R + 1, 'สรุปผล = คะแนนที่ได้บ่อยที่สุด (ถ้าเท่ากันใช้ค่าต่ำกว่า) · แปลผลจากคะแนนรวม: 13–15 ดีเยี่ยม · 9–12 ดี · 1–8 ผ่าน', S.note);
    sh.freeze = { c: 5, r: R0 };
    sheets.push(sh);
  }

  // ---------- สรุปผล (รายบุคคล) ----------
  const sm = base('สรุปผล');
  [5.1, 7.4, 10.1, 10.4, 9, 9, 9, 9, 9, 7.5, 9].forEach((w, i) => sm.width(i + 1, w));
  titles(sm, head4('สรุปผลการประเมินสมรรถนะสำคัญของผู้เรียน'), 11);
  const PH = TL + 1; const P0 = PH + 3;
  sm.height(PH, 26).height(PH + 1, 135).height(PH + 2, 24);
  sm.set(1, PH, 'เลขที่', H).styleRange(1, PH, 1, PH + 2, H).merge(1, PH, 1, PH + 2);
  sm.set(2, PH, 'ชื่อ - สกุล', H).styleRange(2, PH, 4, PH + 2, H).merge(2, PH, 4, PH + 2);
  sm.set(5, PH, 'สมรรถนะสำคัญของผู้เรียน', H).styleRange(5, PH, 9, PH, H).merge(5, PH, 9, PH);
  COMPETENCIES.forEach((c, k) => sm.set(5 + k, PH + 1, `${c.no}. ผลการประเมิน${c.name}`, S.rot(GREEN2, 13)).style(5 + k, PH + 2, S.rot(GREEN2, 13)).merge(5 + k, PH + 1, 5 + k, PH + 2));
  sm.set(10, PH, 'สรุปผลการประเมิน', H).styleRange(10, PH, 11, PH + 1, H).merge(10, PH, 11, PH + 1);
  sm.set(10, PH + 2, 'รวม', H).set(11, PH + 2, 'แปลผล', H);
  for (let i = 0; i < R; i++) {
    const r = P0 + i; const s = students[i]; const A = `$A${r}`;
    studentCells(sm, r, s, i);
    const ov = s ? compOverall(s.get) : null;
    COMPETENCIES.forEach((c, k) => sm.set(5 + k, r, ov ? ov.per[k].level : '', S.calc(CREAM), `IF(${A}="","",${q(c.sheet)}!${ref(11, R0 + i)})`));
    const J = ref(10, r);
    sm.set(10, r, ov ? ov.sum : '', S.calc(CREAM), `IF(${A}="","",SUM(${ref(5, r)}:${ref(9, r)}))`);
    sm.set(11, r, ov ? ov.label : '', S.calc(CREAM), `IF(${A}="","",${IFS([[`${J}=0`, 'ปรับปรุง'], [`${J}*100/15>=75`, 'ดีเยี่ยม'], [`${J}*100/15>=40`, 'ดี']], 'พอใช้')})`);
  }
  const PL = P0 + R - 1;
  sm.height(PL + 1, 8);
  sm.set(2, PL + 2, 'แปลผลจากผลรวม 5 ด้าน (เต็ม 15): ร้อยละ 75 ขึ้นไป ดีเยี่ยม · ร้อยละ 40–74 ดี · ต่ำกว่าร้อยละ 40 พอใช้ · 0 ปรับปรุง', S.note);
  sm.freeze = { c: 5, r: P0 };
  sheets.push(sm);

  // ---------- แบบสรุปผล (จำนวน/ร้อยละ) ----------
  const ct = base('แบบสรุปผล');
  [5, 30, 8.5, 8, 8.5, 8, 8.5, 8, 8.5, 8, 10].forEach((w, i) => ct.width(i + 1, w));
  titles(ct, head4('แบบสรุปรายงานผลการประเมินสมรรถนะสำคัญของผู้เรียน'), 11);
  const C0 = TL + 1; const D0 = C0 + 4;
  const HC = st({ font: { b: true }, border: 'thin', align: { h: 'center', v: 'center', wrap: true } });
  const H14 = st({ font: { b: true, sz: 14 }, border: 'thin', align: { h: 'center', v: 'center', wrap: true } });
  [24, 24, 21, 21].forEach((h, i) => ct.height(C0 + i, h));
  ct.set(1, C0, 'สมรรถนะสำคัญของผู้เรียน', HC).styleRange(1, C0, 2, C0 + 3, HC).merge(1, C0, 2, C0 + 3);
  ct.set(3, C0, 'ระดับคุณภาพ', HC).styleRange(3, C0, 10, C0, HC).merge(3, C0, 10, C0);
  ct.set(11, C0, 'จำนวนนักเรียน', HC).styleRange(11, C0, 11, C0 + 3, HC).merge(11, C0, 11, C0 + 3);
  COMP_LV.forEach((l, k) => {
    const c = 3 + k * 2;
    ct.set(c, C0 + 1, l, HC).style(c + 1, C0 + 1, HC).merge(c, C0 + 1, c + 1, C0 + 1);
    ct.set(c, C0 + 2, 'จำนวน', H14).set(c + 1, C0 + 2, 'ร้อยละ', H14).set(c, C0 + 3, 'นักเรียน', H14).style(c + 1, C0 + 3, H14).merge(c + 1, C0 + 2, c + 1, C0 + 3);
  });
  const nStud = students.length;
  const ovs = students.map((s) => compOverall(s.get));
  const K = `$K$${D0}`;
  COMPETENCIES.forEach((c, k) => {
    const r = D0 + k; const rg = `${q('สรุปผล')}!$${colName(5 + k)}$${P0}:$${colName(5 + k)}$${PL}`;
    ct.height(r, 24).set(1, r, c.no, S.cell).set(2, r, c.name, S.label);
    COMP_LV.forEach((_, lv) => {
      const col = 3 + lv * 2; const v = ovs.filter((o) => o.per[k].level === lv).length;
      ct.set(col, r, v, S.cell, `COUNTIF(${rg},${lv})`);
      ct.set(col + 1, r, nStud ? (v * 100) / nStud : 0, S.calc(null, '0.00'), `IF(${K}=0,0,${ref(col, r)}*100/${K})`);
    });
  });
  const RS = D0 + COMPETENCIES.length;
  ct.set(11, D0, nStud, st({ font: { b: true }, border: 'thin', align: { h: 'center', v: 'center' } }), `COUNTA(${q('สรุปผล')}!$B$${P0}:$B$${PL})`).styleRange(11, D0 + 1, 11, RS - 1, S.cell).merge(11, D0, 11, RS - 1);
  ct.height(RS, 24).set(2, RS, 'รวม', st({ font: { b: true }, border: 'thin', align: { h: 'center', v: 'center' } }));
  COMP_LV.forEach((_, lv) => {
    const col = 3 + lv * 2;
    ct.set(col, RS, ovs.reduce((x, o) => x + o.per.filter((p) => p.level === lv).length, 0), S.cell, `SUM(${ref(col, D0)}:${ref(col, RS - 1)})`);
    ct.style(col + 1, RS, S.cell);
  });
  ct.style(1, RS, S.cell).style(11, RS, S.cell);
  const A0 = RS + 2;
  ct.height(A0, 24).set(2, A0, 'ผลการวิเคราะห์ข้อมูลของสมรรถนะในภาพรวม', HC).set(3, A0, 'จำนวน', HC).set(4, A0, 'ร้อยละ', HC);
  ['ดีเยี่ยม', 'ดี', 'พอใช้', 'ปรับปรุง'].forEach((l, i) => {
    const r = A0 + 1 + i; const v = ovs.filter((o) => o.label === l).length;
    ct.height(r, 24).set(2, r, l, S.label).set(3, r, v, S.cell, `COUNTIF(${q('สรุปผล')}!$K$${P0}:$K$${PL},"${l}")`)
      .set(4, r, nStud ? (v * 100) / nStud : 0, S.calc(null, '0.00'), `IF(${K}=0,0,${ref(3, r)}*100/${K})`);
  });
  signRows(ct, A0 + 7, ['ลงชื่อ.......................................ครูประจำชั้น', `(${(info.homeroom || []).join(', ') || '.......................................'})`], 2);
  sheets.push(ct);
  return sheets;
}
