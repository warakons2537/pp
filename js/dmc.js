// =====================================================================
//  นำเข้าข้อมูลนักเรียนจากไฟล์ DMC (.xls / .xlsx / .csv)
//  อ่านคอลัมน์ตาม "ชื่อหัวตาราง" ไม่ใช่ตำแหน่ง
// =====================================================================

const clean = (v) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s === '-' ? '' : s;
};
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const num = (v) => { const n = parseInt(digits(v), 10); return Number.isFinite(n) ? n : null; };

export function parseThaiDate(v) {
  const s = clean(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);       // 25/02/2555
  if (m) {
    let [, d, mo, y] = m.map(Number);
    if (y < 100) y += 2500;                                          // 25/02/55 = พ.ศ. 2555
    if (y > 2400) y -= 543;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                       // 2012-02-25 หรือ 2555-02-25
  if (m) {
    let [, y, mo, d] = m.map(Number);
    if (y > 2400) y -= 543;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

export function normLevel(v) {
  const s = clean(v).replace(/\s/g, '');
  let m = s.match(/^(อ|ป|ม)\.?(\d)/);
  if (m) return `${m[1]}.${m[2]}`;
  m = s.match(/(อนุบาล|ประถมศึกษา|มัธยมศึกษา)ปีที่(\d)/);
  if (m) return `${{ อนุบาล: 'อ', ประถมศึกษา: 'ป', มัธยมศึกษา: 'ม' }[m[1]]}.${m[2]}`;
  return '';
}

const normGender = (g, prefix) => {
  const s = clean(g);
  if (/^(ช|ชาย|M|male)/i.test(s)) return 'ช';
  if (/^(ญ|หญิง|F|female)/i.test(s)) return 'ญ';
  if (/ชาย|นาย/.test(prefix)) return 'ช';
  if (/หญิง|นาง/.test(prefix)) return 'ญ';
  return null;
};

// หาบรรทัดหัวตาราง (ไฟล์ DMC มักมีหัวอยู่แถว 1 หรือ 2)
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map(clean);
    if (r.includes('ชื่อ') && r.includes('นามสกุล')) return i;
  }
  return -1;
}

export function parseDmcRows(rows) {
  const hi = findHeader(rows);
  if (hi < 0) throw new Error('ไม่พบหัวตาราง "ชื่อ" และ "นามสกุล" ในไฟล์ — กรุณาใช้ไฟล์ที่ส่งออกจาก DMC');
  const header = rows[hi].map(clean);
  const col = (name, nth = 0) => {
    let seen = -1;
    for (let i = 0; i < header.length; i++) if (header[i] === name && ++seen === nth) return i;
    return -1;
  };
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const g = (name, nth) => { const i = col(name, nth); return i < 0 ? '' : clean(r[i]); };
    const first = g('ชื่อ');
    if (!first) continue;
    const prefix = g('คำนำหน้าชื่อ');
    const person = (who) => {
      const o = {
        citizen_id: digits(g(`หมายเลขบัตรประชาชน${who}`)) || null,
        prefix: g(`คำนำหน้าชื่อ${who}`) || null,
        first_name: g(`ชื่อ${who}`) || null,
        last_name: g(`นามสกุล${who}`) || null,
        income: num(g(`รายได้ต่อเดือนของ${who}`)),
        phone: g(`หมายเลขโทรศัพท์ของ${who}`) || null,
      };
      return Object.values(o).some((x) => x !== null) ? o : null;
    };
    const guardian = person('ผู้ปกครอง');
    const relation = g('ความเกี่ยวข้องของผู้ปกครองกับนักเรียน', 1) || g('ความเกี่ยวข้องของผู้ปกครองกับนักเรียน');
    if (guardian && relation) guardian.relation = relation;
    const raw = {};
    header.forEach((h, i) => { if (h && clean(r[i])) raw[h] = clean(r[i]); });

    out.push({
      level: normLevel(g('ชั้น')),
      room: num(g('ห้อง')) ?? 1,
      student: {
        student_code: digits(g('รหัสนักเรียน')) || g('รหัสนักเรียน') || null,
        prefix: prefix || null,
        first_name: first,
        last_name: g('นามสกุล'),
        first_name_en: g('ชื่อ (อังกฤษ)') || null,
        last_name_en: g('นามสกุล (อังกฤษ)') || null,
        gender: normGender(g('เพศ'), prefix),
      },
      private: {
        citizen_id: digits(g('เลขประจำตัวประชาชน')) || null,
        birth_date: parseThaiDate(g('วันเกิด')),
        blood_type: g('หมู่โลหิต') || null,
        ethnicity: g('เชื้อชาติ') || null,
        nationality: g('สัญชาติ') || null,
        religion: g('ศาสนา') || null,
        siblings: {
          older_brothers: num(g('จำนวนพี่ชาย')), younger_brothers: num(g('จำนวนน้องชาย')),
          older_sisters: num(g('จำนวนพี่สาว')), younger_sisters: num(g('จำนวนน้องสาว')),
          child_no: num(g('เป็นบุตรคนที่')),
        },
        father: person('บิดา'),
        mother: person('มารดา'),
        guardian,
        address: {
          house_code: g('รหัสประจำบ้าน (ทะเบียนบ้าน)') || null,
          house_no: g('เลขที่บ้าน (ทะเบียนบ้าน)') || null,
          moo: g('หมู่ (ทะเบียนบ้าน)') || null,
          road: g('ถนน (ทะเบียนบ้าน)') || null,
          subdistrict: g('ตำบล (ทะเบียนบ้าน)') || null,
          district: g('อำเภอ (ทะเบียนบ้าน)') || null,
          province: g('จังหวัด (ทะเบียนบ้าน)') || null,
          postcode: g('รหัสไปรษณีย์ (ทะเบียนบ้าน)') || null,
        },
        dmc_raw: raw,
      },
    });
  }
  return out;
}

// อ่านไฟล์ด้วย SheetJS แล้วเลือกชีตที่มีหัวตาราง DMC
export async function readDmcFile(file) {
  if (!window.XLSX) throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  for (const name of wb.SheetNames) {
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    if (findHeader(rows) >= 0) return { sheet: name, records: parseDmcRows(rows) };
  }
  throw new Error('ไม่พบชีตข้อมูลนักเรียนในไฟล์นี้');
}
