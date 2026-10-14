// =====================================================================
//  ภาวะโภชนาการ (เกณฑ์อ้างอิงกรมอนามัย) และสรุปผลการประเมินคุณลักษณะฯ
//  ถอดจากชีต "โภชนาการ" และ "คุณลักษณะอันพึงประสงค์/สมรรถนะ" ในไฟล์ Excel เดิม
// =====================================================================

// อายุเป็นเดือนเต็ม เหมือน DATEDIF(วันเกิด, วันชั่ง, "m") ของ Excel
export function ageMonths(birthIso, dateIso) {
  if (!birthIso || !dateIso) return null;
  const [y1, m1, d1] = birthIso.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = dateIso.slice(0, 10).split('-').map(Number);
  const m = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return m < 0 ? null : m;
}
export const ageText = (months) => (months === null || months === undefined ? '' : `${Math.floor(months / 12)} ปี ${months % 12} เดือน`);

export const WA = ['น้ำหนักมากกว่าเกณฑ์', 'น้ำหนักค่อนข้างมาก', 'น้ำหนักตามเกณฑ์', 'น้ำหนักค่อนข้างน้อย', 'น้ำหนักน้อยกว่าเกณฑ์'];
export const HA = ['สูงกว่าเกณฑ์', 'ค่อนข้างสูง', 'ส่วนสูงตามเกณฑ์', 'ค่อนข้างเตี้ย', 'เตี้ย'];
export const WH = ['อ้วน', 'เริ่มอ้วน', 'ท้วม', 'สมส่วน', 'ค่อนข้างผอม', 'ผอม'];
export const OUT_OF_TABLE = 'เกินตารางอ้างอิง';
// ระดับความรุนแรง ใช้ระบายสี: 0 = ปกติ, 1 = เฝ้าระวัง, 2 = มีปัญหา
export const severity = (label) => ({
  'น้ำหนักตามเกณฑ์': 0, 'ส่วนสูงตามเกณฑ์': 0, 'สมส่วน': 0, 'ค่อนข้างสูง': 0, 'สูงกว่าเกณฑ์': 0,
  'น้ำหนักค่อนข้างมาก': 1, 'น้ำหนักค่อนข้างน้อย': 1, 'ค่อนข้างเตี้ย': 1, 'ท้วม': 1, 'ค่อนข้างผอม': 1,
}[label] ?? (label ? 2 : null));

/**
 * ตารางอ้างอิง: แถวจากตาราง growth_reference
 * { sex: 'ช'|'ญ', basis: 'age_months'|'height_cm', key, measure: 'weight'|'height', median, sd, minus2, minus15, plus15, plus2, plus3 }
 */
export function makeRef(rows) {
  const map = new Map();
  for (const r of rows) map.set(`${r.sex}|${r.basis}|${r.key}|${r.measure}`, r);
  return { size: map.size, get: (sex, basis, key, measure) => map.get(`${sex}|${basis}|${key}|${measure}`) };
}

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export function classify(ref, { sex, months, weight, height }) {
  const w = n(weight); const h = n(height);
  const out = { wa: null, ha: null, wh: null, goodShape: null };
  if (!ref || !sex) return out;
  // น้ำหนักตามเกณฑ์อายุ (Excel: G>+2SD, G>+1.5SD, G>=-1.5SD, G>=-2SD)
  if (w !== null && months !== null && months !== undefined) {
    const r = ref.get(sex, 'age_months', months, 'weight');
    out.wa = !r ? OUT_OF_TABLE : w > n(r.plus2) ? WA[0] : w > n(r.plus15) ? WA[1] : w >= n(r.minus15) ? WA[2] : w >= n(r.minus2) ? WA[3] : WA[4];
  }
  // ส่วนสูงตามเกณฑ์อายุ
  if (h !== null && months !== null && months !== undefined) {
    const r = ref.get(sex, 'age_months', months, 'height');
    out.ha = !r ? OUT_OF_TABLE : h > n(r.plus2) ? HA[0] : h > n(r.plus15) ? HA[1] : h >= n(r.minus15) ? HA[2] : h >= n(r.minus2) ? HA[3] : HA[4];
  }
  // น้ำหนักตามเกณฑ์ส่วนสูง (Excel ปัดส่วนสูงเป็นจำนวนเต็มก่อนเปิดตาราง)
  if (w !== null && h !== null) {
    const r = ref.get(sex, 'height_cm', Math.round(h), 'weight');
    out.wh = !r ? OUT_OF_TABLE : w > n(r.plus3) ? WH[0] : w > n(r.plus2) ? WH[1] : w > n(r.plus15) ? WH[2] : w >= n(r.minus15) ? WH[3] : w >= n(r.minus2) ? WH[4] : WH[5];
  }
  // สูงดีสมส่วน (ตัวชี้วัดกรมอนามัย): ส่วนสูง ≥ -1.5SD และ น้ำหนักตามส่วนสูงอยู่ระหว่าง ±1.5SD
  if (out.ha && out.wh && out.ha !== OUT_OF_TABLE && out.wh !== OUT_OF_TABLE) out.goodShape = HA.slice(0, 3).includes(out.ha) && out.wh === 'สมส่วน';
  return out;
}

// แปลงตาราง age / ht ในไฟล์ Excel เดิม (รหัส = เพศ 1/2 ต่อด้วยอายุเดือนหรือส่วนสูง) เป็นแถว growth_reference
export function excelRefToRows(age, ht, refSet = 'excel') {
  const rows = [];
  const sexOf = (code) => (String(code)[0] === '1' ? 'ช' : 'ญ');
  const keyOf = (code) => Number(String(code).slice(1));
  for (const [code, mw, sdw, m2w, m15w, p15w, p2w, mh, sdh, m2h, m15h, p15h, p2h] of age) {
    rows.push({ ref_set: refSet, sex: sexOf(code), basis: 'age_months', key: keyOf(code), measure: 'weight', median: mw, sd: sdw, minus2: m2w, minus15: m15w, plus15: p15w, plus2: p2w, plus3: null });
    rows.push({ ref_set: refSet, sex: sexOf(code), basis: 'age_months', key: keyOf(code), measure: 'height', median: mh, sd: sdh, minus2: m2h, minus15: m15h, plus15: p15h, plus2: p2h, plus3: null });
  }
  for (const [code, med, sd, m2, m15, p15, p2, p3] of ht) {
    rows.push({ ref_set: refSet, sex: sexOf(code), basis: 'height_cm', key: keyOf(code), measure: 'weight', median: med, sd, minus2: m2, minus15: m15, plus15: p15, plus2: p2, plus3: p3 });
  }
  return rows;
}

// ---------------------------------------------------------------------
//  คุณลักษณะฯ / อ่านคิดวิเคราะห์ / ค่านิยม / สมรรถนะ
// ---------------------------------------------------------------------
export const TRAIT_KINDS = {
  trait8: {
    label: 'คุณลักษณะอันพึงประสงค์ 8 ประการ', short: 'คุณลักษณะฯ',
    items: ['รักชาติ ศาสน์ กษัตริย์', 'ซื่อสัตย์สุจริต', 'มีวินัย', 'ใฝ่เรียนรู้', 'อยู่อย่างพอเพียง', 'มุ่งมั่นในการทำงาน', 'รักความเป็นไทย', 'มีจิตสาธารณะ'],
    levels: ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'],
  },
  rtw: {
    label: 'การอ่าน คิดวิเคราะห์ และเขียนสื่อความ', short: 'อ่านคิดวิเคราะห์ฯ',
    items: ['ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5'],   // ตามเกณฑ์ที่โรงเรียนกำหนด (Excel เดิมใช้เลข 1–5)
    levels: ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'],
  },
  values12: {
    label: 'ค่านิยมหลักของคนไทย 12 ประการ', short: 'ค่านิยม 12',
    items: ['รักชาติ ศาสน์ กษัตริย์', 'ซื่อสัตย์ เสียสละ อดทน', 'กตัญญูต่อพ่อแม่ ผู้ปกครอง ครูบาอาจารย์', 'ใฝ่หาความรู้', 'รักษาวัฒนธรรมประเพณีไทย',
      'มีศีลธรรม รักษาความสัตย์', 'เข้าใจการปกครองระบอบประชาธิปไตย', 'มีระเบียบวินัย เคารพกฎหมาย', 'ปฏิบัติตามพระราชดำรัส',
      'ดำเนินชีวิตตามหลักเศรษฐกิจพอเพียง', 'มีความเข้มแข็งทั้งร่างกายและจิตใจ', 'คำนึงถึงผลประโยชน์ส่วนรวม'],
    levels: ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'],
  },
  competency5: {
    label: 'สมรรถนะสำคัญของผู้เรียน 5 ประการ', short: 'สมรรถนะ',
    items: ['ความสามารถในการสื่อสาร', 'ความสามารถในการคิด', 'ความสามารถในการแก้ปัญหา', 'ความสามารถในการใช้ทักษะชีวิต', 'ความสามารถในการใช้เทคโนโลยี'],
    levels: ['ปรับปรุง', 'พอใช้', 'ดี', 'ดีเยี่ยม'],
  },
};

/**
 * สรุปผลด้วยฐานนิยม แบบเดียวกับสูตร Excel:
 * IFERROR(MODE(LARGE(ช่วง, 1..n)), IF(MAX=0, "", MAX))
 * - ค่าที่ซ้ำมากที่สุด ถ้าซ้ำเท่ากันหลายค่าเลือกค่าสูงสุด
 * - ไม่มีค่าใดซ้ำเลย ใช้ค่าสูงสุด (ถ้าค่าสูงสุดเป็น 0 ให้ว่าง)
 */
export function modeSummary(values) {
  const v = values.map(n).filter((x) => x !== null);
  if (!v.length) return null;
  const freq = new Map(); v.forEach((x) => freq.set(x, (freq.get(x) || 0) + 1));
  const best = Math.max(...freq.values());
  if (best < 2) { const mx = Math.max(...v); return mx === 0 ? null : mx; }
  return Math.max(...[...freq].filter(([, c]) => c === best).map(([x]) => x));
}

export const ACTIVITIES = {
  guidance: 'กิจกรรมแนะแนว',
  scout: 'ลูกเสือ-เนตรนารี / ยุวกาชาด',
  club: 'กิจกรรมชุมนุม',
  social: 'กิจกรรมเพื่อสังคมและสาธารณประโยชน์',
};
