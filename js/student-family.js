// =====================================================================
//  ข้อมูลครอบครัวและที่อยู่ของนักเรียน (บิดา มารดา ผู้ปกครอง ที่อยู่) — ฟอร์มแก้ไขในหน้านักเรียน
//  ใช้พิมพ์ ปพ.5 แผ่น "บิดามารดา" และ "ผู้ปกครอง" · เก็บใน student_private (father / mother / guardian / address)
//  ค่าที่นำเข้าจาก DMC (เลขบัตร รายได้ เบอร์โทร ฯลฯ) ที่ฟอร์มนี้ไม่ได้แสดง จะถูกเก็บไว้ไม่เปลี่ยน
// =====================================================================
import { esc } from './util.js?v=2569.11.1-26';

export const PEOPLE = [['father', 'บิดา'], ['mother', 'มารดา'], ['guardian', 'ผู้ปกครอง']];
const ADDR = [['house_no', 'บ้านเลขที่'], ['moo', 'หมู่ที่'], ['subdistrict', 'ตำบล'], ['district', 'อำเภอ'], ['province', 'จังหวัด'], ['postcode', 'รหัสไปรษณีย์']];
const t = (v) => { const x = String(v ?? '').trim(); return x === '' ? null : x; };

// อาชีพที่ไฟล์ DMC เก็บไว้ในข้อมูลดิบ (หัวคอลัมน์ เช่น "อาชีพบิดา") — ใช้เมื่อยังไม่ได้กรอกเองในระบบ
export function rawOccupation(priv, who) {
  const label = { father: 'บิดา', mother: 'มารดา', guardian: 'ผู้ปกครอง' }[who];
  const raw = priv?.dmc_raw || {};
  const k = Object.keys(raw).find((h) => h.includes('อาชีพ') && h.includes(label));
  return k ? t(raw[k]) : null;
}
export const occupationOf = (priv, who) => t(priv?.[who]?.occupation) ?? rawOccupation(priv, who);

// ชื่อเต็มของบุคคล (คำนำหน้า ชื่อ นามสกุล)
export const personName = (p) => (p ? `${p.prefix ?? ''}${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null : null);

// ที่อยู่แบบสั้นตามใบ ปพ.5 เช่น "175/2 หมู่ 3 ต.วังลึก อ.ศรีสำโรง จ.สุโขทัย 64120"
export function addressShort(ad) {
  if (!ad) return null;
  return [ad.house_no, ad.moo && `หมู่ ${ad.moo}`, ad.subdistrict && `ต.${ad.subdistrict}`, ad.district && `อ.${ad.district}`, ad.province && `จ.${ad.province}`, ad.postcode].filter(Boolean).join(' ') || null;
}

// ส่วนฟอร์ม (ใส่ในกล่องแก้ไขนักเรียน) · ชื่อ input = ชื่อฟิลด์ที่ familyPatch อ่าน
export function familyHtml(priv = {}) {
  const inp = (name, label, val, extra = '') => `<label class="small">${label}<input type="text" name="${name}" value="${esc(val ?? '')}" ${extra}></label>`;
  const person = ([who, label]) => {
    const p = priv[who] || {};
    return `<fieldset style="border:1px solid var(--rule-strong);border-radius:8px;padding:8px;margin:6px 0"><legend class="small">${label}</legend>
      <div class="row">${inp(`${who}_prefix`, 'คำนำหน้า', p.prefix, 'list="fam-prefix" style="width:90px"')}${inp(`${who}_first_name`, 'ชื่อ', p.first_name)}${inp(`${who}_last_name`, 'นามสกุล', p.last_name)}</div>
      <div class="row">${inp(`${who}_occupation`, 'อาชีพ', occupationOf(priv, who))}${who === 'guardian' ? inp('guardian_relation', 'ความเกี่ยวข้องกับนักเรียน (เช่น มารดา ยาย)', p.relation) : ''}</div></fieldset>`;
  };
  const ad = priv.address || {};
  return `<details style="margin-top:8px"><summary class="small"><b>ข้อมูลบิดา มารดา ผู้ปกครอง และที่อยู่</b> (ใช้พิมพ์ ปพ.5)</summary>
    <datalist id="fam-prefix"><option value="นาย"><option value="นาง"><option value="นางสาว"></datalist>
    ${PEOPLE.map(person).join('')}
    <fieldset style="border:1px solid var(--rule-strong);border-radius:8px;padding:8px;margin:6px 0"><legend class="small">ที่อยู่ปัจจุบันของนักเรียน</legend>
      <div class="row">${ADDR.slice(0, 3).map(([k, l]) => inp(`addr_${k}`, l, ad[k])).join('')}</div>
      <div class="row">${ADDR.slice(3).map(([k, l]) => inp(`addr_${k}`, l, ad[k])).join('')}</div></fieldset></details>`;
}

// ค่าจากฟอร์ม r → ข้อมูลที่จะบันทึกลง student_private (รวมกับค่าเดิมที่ฟอร์มไม่ได้แสดง)
export function familyPatch(priv = {}, r = {}) {
  const out = {};
  for (const [who] of PEOPLE) {
    const base = priv[who] || {};
    const next = { ...base, prefix: t(r[`${who}_prefix`]), first_name: t(r[`${who}_first_name`]), last_name: t(r[`${who}_last_name`]), occupation: t(r[`${who}_occupation`]) };
    if (who === 'guardian') next.relation = t(r.guardian_relation);
    out[who] = Object.values(next).every((v) => v === null || v === undefined) ? null : next;
  }
  const ad = { ...(priv.address || {}) };
  for (const [k] of ADDR) ad[k] = t(r[`addr_${k}`]);
  out.address = Object.values(ad).every((v) => v === null || v === undefined) ? null : ad;
  return out;
}
