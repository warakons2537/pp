// =====================================================================
//  ปรับหน้ากระดาษรายแผ่น (แบบ Word): ขอบ · ขนาดตัวอักษร · ระยะบรรทัด · ความกว้างคอลัมน์ · ย่อ/ขยาย · จัดกึ่งกลาง
//  ใช้ร่วมกันในแท็บ "เล่ม ปพ." และ "ปพ.5 ครบชุด" · ตัวแสดงผล (xl-render.js) รับค่าผ่าน adj
// =====================================================================
import { esc, modal } from './util.js?v=2569.11.1-26';

// ค่าปรับหน้า (ขอบเป็นมม.) → ค่าที่ตัวแสดงผลใช้ (ขอบเป็นนิ้ว)
export function adjOpt(a) {
  if (!a) return null;
  const o = { ...a };
  for (const k of ['mt', 'mb', 'ml', 'mr']) if (Number.isFinite(o[k])) o[k] = o[k] / 25.4; else delete o[k];
  return o;
}

// สรุปค่าที่ปรับไว้เป็นข้อความสั้น ๆ (ว่าง = ตามต้นฉบับ)
export function adjText(a) {
  if (!a) return '';
  const p = [];
  if (['mt', 'mb', 'ml', 'mr'].some((k) => Number.isFinite(a[k]))) p.push(`ขอบ บน${a.mt ?? '-'} ล่าง${a.mb ?? '-'} ซ้าย${a.ml ?? '-'} ขวา${a.mr ?? '-'} มม.`);
  if (a.font) p.push(`ตัวอักษร ${a.font}%`); if (a.row) p.push(`ระยะบรรทัด ${a.row}%`); if (a.col) p.push(`คอลัมน์ ${a.col}%`); if (a.scale) p.push(`ย่อ/ขยาย ${a.scale}%`);
  if (typeof a.hCenter === 'boolean') p.push(a.hCenter ? 'กึ่งกลาง' : 'ชิดซ้าย');
  return p.join(' · ');
}

/**
 * เปิดกล่องปรับหน้า
 * @param n      ชื่อแผ่น
 * @param cur    ค่าที่ปรับไว้ก่อนหน้า (หรือ undefined)
 * @param hint   { margins: {top,bottom,left,right} นิ้ว (ค่าเดิมของแบบพิมพ์), scale: % เริ่มต้นของแผ่น }
 * @param what   ข้อความอธิบายว่ามีผลกับอะไร
 * @returns null (ยกเลิก) | { adj: object|null (null = ล้างค่า), all: boolean (ใช้กับทุกแผ่นที่เลือก) }
 */
export async function adjustDialog(n, cur, hint = {}, what = 'การดูตัวอย่าง/พิมพ์/PDF ในแอป') {
  cur = cur || {};
  const om = (k) => (hint.margins ? Math.round(hint.margins[k] * 25.4) : '');
  const num = (name, label, val, ph, extra = '') => `<label class="small" style="display:flex;flex-direction:column;gap:2px">${label}
    <input type="number" name="${name}" value="${val ?? ''}" placeholder="${ph}" ${extra} inputmode="decimal"></label>`;
  const html = `
    <p class="small muted" style="margin:0 0 8px">เว้นว่าง = ตามแบบพิมพ์เดิม · ใช้กับแผ่น <b>${esc(n)}</b> · มีผลกับ${esc(what)}</p>
    <fieldset style="border:1px solid var(--rule-strong);border-radius:8px;padding:8px;margin:0 0 8px"><legend class="small">ขอบกระดาษ (มม.)</legend>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${num('mt', 'บน', cur.mt, om('top') || 'เดิม', 'min="0" max="100" step="1"')}${num('mb', 'ล่าง', cur.mb, om('bottom') || 'เดิม', 'min="0" max="100" step="1"')}
        ${num('ml', 'ซ้าย', cur.ml, om('left') || 'เดิม', 'min="0" max="100" step="1"')}${num('mr', 'ขวา', cur.mr, om('right') || 'เดิม', 'min="0" max="100" step="1"')}
      </div></fieldset>
    <fieldset style="border:1px solid var(--rule-strong);border-radius:8px;padding:8px;margin:0 0 8px"><legend class="small">ขนาดและระยะ (%) — 100 = ตามแบบพิมพ์เดิม</legend>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
        ${num('font', 'ขนาดตัวอักษร', cur.font, '100', 'min="50" max="200" step="5"')}${num('row', 'ระยะบรรทัด (ความสูงแถว)', cur.row, '100', 'min="50" max="200" step="5"')}
        ${num('col', 'ความกว้างคอลัมน์', cur.col, '100', 'min="50" max="200" step="5"')}${num('scale', 'ย่อ/ขยายทั้งหน้า', cur.scale, hint.scale ? String(hint.scale) : 'อัตโนมัติ', 'min="10" max="400" step="1"')}
      </div></fieldset>
    <label class="small" style="display:block;margin:0 0 8px">จัดตารางกึ่งกลางหน้าแนวนอน
      <select name="hc"><option value="">ตามแบบพิมพ์เดิม</option><option value="1" ${cur.hCenter === true ? 'selected' : ''}>จัดกึ่งกลาง</option><option value="0" ${cur.hCenter === false ? 'selected' : ''}>ชิดซ้ายตามขอบ</option></select></label>
    <label class="small" style="display:block"><input type="checkbox" name="all" value="1"> ใช้ค่าเดียวกันกับทุกแผ่นที่เลือกพิมพ์</label>
    <label class="small" style="display:block"><input type="checkbox" name="reset" value="1"> ล้างค่าที่ปรับ กลับเป็นตามแบบพิมพ์เดิม</label>`;
  const r = await modal(`ปรับหน้ากระดาษ — ${n}`, html, { okText: 'ใช้ค่านี้', wide: false });
  if (!r) return null;
  const v = (k) => (r[k] === '' || r[k] === undefined ? undefined : Number(r[k]));
  const a = { mt: v('mt'), mb: v('mb'), ml: v('ml'), mr: v('mr'), font: v('font'), row: v('row'), col: v('col'), scale: v('scale'), hCenter: r.hc === '' ? undefined : r.hc === '1' };
  for (const k of Object.keys(a)) if (a[k] === undefined || (typeof a[k] === 'number' && !Number.isFinite(a[k]))) delete a[k];
  return { adj: r.reset || !Object.keys(a).length ? null : a, all: !!r.all };
}
