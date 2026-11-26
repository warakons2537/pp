// =====================================================================
//  ปรับหน้ากระดาษรายแผ่น (แบบ Word): ขอบ · ขนาดตัวอักษร · ระยะบรรทัด · ความกว้างคอลัมน์ · ย่อ/ขยาย · จัดกึ่งกลาง
//  ใช้ร่วมกันในแท็บ "เล่ม ปพ." และ "ปพ.5 ครบชุด" · ตัวแสดงผล (xl-render.js) รับค่าผ่าน adj
// =====================================================================
import { esc, modal } from './util.js?v=2569.11.1-45';

// จัดหน้าอัตโนมัติทั้งชุด: ทุกหน้าของแต่ละแผ่นขนาดเท่ากัน จัดกึ่งกลาง ขอบ 10 มม. เท่ากัน (หน่วยนิ้ว ใช้กับตัวแสดงผลโดยตรง)
export const AUTO_ADJ = { autoFit: true, mt: 10 / 25.4, mb: 10 / 25.4, ml: 10 / 25.4, mr: 10 / 25.4 };

// ค่าปรับหน้า (ขอบเป็นมม.) → ค่าที่ตัวแสดงผลใช้ (ขอบเป็นนิ้ว)
export function adjOpt(a) {
  if (!a) return null;
  const o = { ...a };
  for (const k of ['mt', 'mb', 'ml', 'mr']) if (Number.isFinite(o[k])) o[k] = o[k] / 25.4; else delete o[k];
  for (const k of ['ox', 'oy']) if (Number.isFinite(o[k])) o[k] = o[k] * 72 / 25.4; else delete o[k];       // ตำแหน่งที่ลากย้าย: มม. → pt
  return o;
}

// ---------------------------------------------------------------------
//  ค่าพิมพ์ทั้งชุด (แผงขวาของหน้า ปพ.5): ขอบ (ซม.) · ตัวอักษร (pt) · ขนาดทั้งหน้า (%) หรือพอดีหน้า · ระยะบรรทัด/คอลัมน์ (%)
//  ใช้เป็นฐานของทุกแผ่น — ค่าที่ปรับรายแผ่น ("ปรับหน้า…"/"ลากปรับ…") ทับค่านี้เสมอ
// ---------------------------------------------------------------------
export const MARGIN_PRESETS = { gov: ['ตามราชการ', { mt: 2.5, mb: 2, ml: 3, mr: 2 }], pp5: ['ปพ.5', { mt: 2.54, mb: 2.54, ml: 2.54, mr: 2.54 }] };
export const BASE_PT = 16;                     // ขนาดตัวอักษร 16 pt = 100% ของแบบพิมพ์
export const SET_LIMITS = { m: [0, 10], pt: [12, 20], scale: [50, 150], zoom: [70, 140], pct: [50, 200] };

// ค่าทั้งชุด → ค่าปรับหน้า หน่วยเดียวกับ "ปรับหน้า…" (ขอบ มม. · ขนาด %)
export function globalAdj(s) {
  const a = {}; if (!s) return a;
  for (const k of ['mt', 'mb', 'ml', 'mr']) if (Number.isFinite(s[k])) a[k] = Math.round(s[k] * 100) / 10;
  if (Number.isFinite(s.pt)) a.font = s.pt / BASE_PT * 100;
  if (s.fit) a.autoFit = true; else if (Number.isFinite(s.scale)) a.scale = s.scale;
  if (Number.isFinite(s.row)) a.row = s.row;
  if (Number.isFinite(s.col)) a.col = s.col;
  return a;
}

/**
 * รวมค่าปรับหน้าของแผ่นหนึ่ง (หน่วยของตัวแสดงผล: ขอบเป็นนิ้ว)
 * @param base  ค่าตั้งต้นของแผ่น (pp5Layout / จัดหน้าอัตโนมัติ) — หน่วยนิ้วแล้ว
 * @param set   ค่าทั้งชุด (globalAdj)
 * @param own   ค่าที่ปรับรายแผ่น (มม.) — ชนะค่าทั้งชุด
 */
export function mergeAdj(base, set, own) {
  const b = { ...(base || {}) }; const g = adjOpt(globalAdj(set)) || {}; const o = adjOpt(own) || {};
  if (o.autoFit === false && o.scale === undefined) { delete g.scale; delete g.autoFit; delete o.autoFit; }   // แผ่นนี้ใช้ขนาดตามแบบพิมพ์ ไม่ตามค่าทั้งชุด
  else if (g.scale !== undefined || g.autoFit) delete b.scale;                // ขนาดทั้งหน้า/พอดีหน้า แทนค่าย่อตั้งต้นของแผ่น
  if (o.autoFit && o.scale === undefined) delete g.scale;                     // แผ่นนี้ตั้งจัดหน้าอัตโนมัติเอง → ไม่ใช้ % ทั้งชุด
  const out = { ...b, ...g, ...o };
  return Object.keys(out).length ? out : undefined;
}

// ใส่เลขหน้าที่กึ่งกลางขอบล่างของหน้าที่วาดแล้ว (html ของ xl-render ปิดท้ายด้วย </div> ของ .xl-page)
export function withPageNo(html, k, bottomPt = 36) {
  const at = html.lastIndexOf('</div>'); if (at < 0) return html;
  const y = Math.max(4, bottomPt / 2 - 7).toFixed(1);
  return `${html.slice(0, at)}<div class="pp-pgno" style="position:absolute;left:0;right:0;bottom:${y}pt;text-align:center;font:14pt/1 'TH SarabunPSK','Sarabun',sans-serif;color:#000">${k}</div>${html.slice(at)}`;
}

// สรุปค่าที่ปรับไว้เป็นข้อความสั้น ๆ (ว่าง = ตามต้นฉบับ)
export function adjText(a) {
  if (!a) return '';
  const p = [];
  if (['mt', 'mb', 'ml', 'mr'].some((k) => Number.isFinite(a[k]))) p.push(`ขอบ บน${a.mt ?? '-'} ล่าง${a.mb ?? '-'} ซ้าย${a.ml ?? '-'} ขวา${a.mr ?? '-'} มม.`);
  if (a.font) p.push(`ตัวอักษร ${a.font}%`); if (a.row) p.push(`ระยะบรรทัด ${a.row}%`); if (a.col) p.push(`คอลัมน์ ${a.col}%`); if (a.scale) p.push(`ย่อ/ขยาย ${a.scale}%`);
  if (typeof a.hCenter === 'boolean') p.push(a.hCenter ? 'กึ่งกลาง' : 'ชิดซ้าย');
  if (a.autoFit) p.push('อัตโนมัติ (กึ่งกลาง ขนาดเท่ากันทุกหน้า)');
  if (Number.isFinite(a.ox) || Number.isFinite(a.oy)) p.push(`ย้ายตำแหน่ง ${a.ox ?? 0},${a.oy ?? 0} มม.`);
  if (a.cw && Object.keys(a.cw).length) p.push(`ปรับ ${Object.keys(a.cw).length} คอลัมน์`); if (a.rh && Object.keys(a.rh).length) p.push(`ปรับ ${Object.keys(a.rh).length} แถว`);
  if (Array.isArray(a.fmt) && a.fmt.length) p.push(`จัดรูปแบบเซลล์ ${a.fmt.length} ช่วง`);
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
    <label class="small" style="display:block;margin:0 0 8px"><input type="checkbox" name="auto" value="1" ${cur.autoFit ? 'checked' : ''}> จัดหน้าอัตโนมัติ: ทุกหน้าของแผ่นขนาดเท่ากัน จัดกึ่งกลางทั้งแนวนอนและแนวตั้ง ขอบเท่ากัน <span class="muted">(ถ้าใส่ "ย่อ/ขยายทั้งหน้า" เอง จะใช้ค่านั้นแทน)</span></label>
    ${hint.noAll ? '' : '<label class="small" style="display:block"><input type="checkbox" name="all" value="1"> ใช้ค่าเดียวกันกับทุกแผ่นที่เลือกพิมพ์</label>'}
    <label class="small" style="display:block"><input type="checkbox" name="reset" value="1"> ล้างค่าที่ปรับ กลับเป็นตามแบบพิมพ์เดิม</label>`;
  const r = await modal(`ปรับหน้ากระดาษ — ${n}`, html, { okText: 'ใช้ค่านี้', wide: false });
  if (!r) return null;
  const v = (k) => (r[k] === '' || r[k] === undefined ? undefined : Number(r[k]));
  const a = { mt: v('mt'), mb: v('mb'), ml: v('ml'), mr: v('mr'), font: v('font'), row: v('row'), col: v('col'), scale: v('scale'), hCenter: r.hc === '' ? undefined : r.hc === '1', autoFit: r.auto ? true : undefined };
  for (const k of Object.keys(a)) if (a[k] === undefined || (typeof a[k] === 'number' && !Number.isFinite(a[k]))) delete a[k];
  return { adj: r.reset || !Object.keys(a).length ? null : a, all: !!r.all };
}

/**
 * เลือกหลายแผ่นพร้อมกันเพื่อปรับหน้าด้วยค่าเดียวกัน (ขั้นที่ 1 ของ "ปรับหน้าหลายแผ่น") — ขั้นที่ 2 ใช้ adjustDialog
 * @param names   รายชื่อแผ่นที่เลือกได้ (ตามลำดับ)
 * @param groups  [[ป้ายกลุ่ม, (ชื่อแผ่น) => boolean]] ปุ่มเลือกเป็นกลุ่ม เช่น ทุกวิชา · เวลาเรียนรายเดือน
 * @param marked  ชื่อแผ่นที่ปรับไว้แล้ว (แสดงเครื่องหมาย ●)
 * @returns null (ยกเลิก) | ชื่อแผ่นที่เลือก (อย่างน้อย 1)
 */
export async function pickSheetsDialog(names, groups = [], marked = new Set()) {
  const html = `
    <p class="small muted" style="margin:0 0 6px">ติ๊กแผ่นที่ต้องการปรับหน้าด้วยค่าเดียวกัน แล้วกด "ต่อไป" เพื่อกำหนดขอบ/ขนาด/ระยะ · ● = เคยปรับไว้แล้ว</p>
    <div class="row" style="flex-wrap:wrap;gap:4px;margin:0 0 6px">
      <button type="button" class="btn btn-sm" data-pick="*">เลือกทั้งหมด</button><button type="button" class="btn btn-sm" data-pick="">ไม่เลือก</button>
      ${groups.map(([l], i) => `<button type="button" class="btn btn-sm" data-pick="g${i}">${esc(l)}</button>`).join('')}</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px 14px;max-height:45vh;overflow:auto;border:1px solid var(--rule-strong);border-radius:8px;padding:8px">
      ${names.map((n, i) => `<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" name="s${i}" value="${esc(n)}" data-i="${i}">${esc(n)}${marked.has(n) ? ' ●' : ''}</label>`).join('')}</div>
    <p class="small muted" id="pick-n" style="margin:6px 0 0">เลือกแล้ว 0 แผ่น</p>`;
  const done = modal('ปรับหน้าหลายแผ่น — เลือกแผ่น', html, { okText: 'ต่อไป', wide: true });
  const wrap = document.querySelector('.modal-wrap:last-of-type'); const form = wrap?.querySelector('form');
  const boxes = () => [...(form?.querySelectorAll('input[type=checkbox]') || [])];
  const count = () => { const el = form?.querySelector('#pick-n'); if (el) el.textContent = `เลือกแล้ว ${boxes().filter((b) => b.checked).length} แผ่น`; };
  form?.addEventListener('change', count);
  form?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const k = b.dataset.pick; const g = k.startsWith('g') ? groups[Number(k.slice(1))][1] : null;
    boxes().forEach((c) => { c.checked = k === '*' ? true : g ? g(c.value) : false; }); count();
  });
  const r = await done;
  if (!r) return null;
  const picked = Object.entries(r).filter(([k]) => /^s\d+$/.test(k)).map(([, v]) => v);
  return picked.length ? picked : null;
}
