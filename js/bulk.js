// เลือกหลายรายการ + แถบจัดการลอยกระจกใส (ใช้ร่วมกันทุกหน้า เหมือนหน้านักเรียน)
//  - root: ส่วนที่สร้างใหม่ทุกครั้งที่วาดหน้า (มีช่องติ๊กแถว + ช่องติ๊กทั้งหมด) · host: ที่วางแถบ (ปกติคือ #view)
//  - state: Set ของ id ที่เลือก (ส่งมาเองถ้าต้องการให้จำข้ามการวาดใหม่) · เลือกได้เฉพาะแถวที่ยังแสดงอยู่
//  - actions: [{ label, cta?, run(ids, { clear }) }] เรียกเมื่อกดปุ่มในแถบ (ปุ่ม cta เป็นสีทอง)
import { esc } from './util.js?v=2569.11.1-31';

export function attachBulk({ root, host = document.getElementById('view'), boxSel = 'input.g-chk[data-id]', allSel = 'input.g-all', unit = 'คน',
  actions = [], rowSel = 'tr, .roll-row', state = new Set() }) {
  const bar = document.createElement('div');
  bar.className = 'g-bulk'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'จัดการรายการที่เลือก'); bar.hidden = true;
  bar.innerHTML = `<div class="g-bulk-top"><div>เลือกแล้ว <span class="g-num" data-n>0</span> ${esc(unit)}</div><button class="btn" type="button" data-clear>ล้างที่เลือก</button></div>
    <div class="g-bulk-actions">${actions.map((a, i) => `<button class="btn${a.cta ? ' btn-primary' : ''}" type="button" data-act="${i}">${esc(a.label)}</button>`).join('')}</div>`;
  host.appendChild(bar);

  const boxes = () => [...root.querySelectorAll(boxSel)];
  const live = () => boxes().filter((b) => !b.disabled);
  const shown = (b) => !b.closest(rowSel)?.hidden;
  const sync = () => {
    const have = new Set(live().filter(shown).map((b) => b.dataset.id));
    for (const id of [...state]) if (!have.has(id)) state.delete(id);          // แถวที่หายไป/ถูกซ่อน ไม่นับว่าเลือก
    boxes().forEach((b) => { b.checked = state.has(b.dataset.id); b.closest(rowSel)?.classList.toggle('g-selected', b.checked); });
    bar.hidden = !state.size; bar.querySelector('[data-n]').textContent = state.size;
    host.classList.toggle('g-has-bar', state.size > 0);                       // มีแถบลอยอยู่ = ปุ่มทองมีแค่ปุ่มในแถบ
    const all = root.querySelector(allSel);
    if (all) { const n = [...have].filter((id) => state.has(id)).length; all.checked = have.size > 0 && n === have.size; all.indeterminate = n > 0 && n < have.size; }
  };
  const clear = () => { state.clear(); sync(); };

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches(boxSel)) { if (t.checked) state.add(t.dataset.id); else state.delete(t.dataset.id); sync(); }
    else if (t.matches(allSel)) { live().filter(shown).forEach((b) => { if (t.checked) state.add(b.dataset.id); else state.delete(b.dataset.id); }); sync(); }
  });
  bar.querySelector('[data-clear]').addEventListener('click', clear);
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const btns = [...bar.querySelectorAll('button')]; btns.forEach((x) => { x.disabled = true; });
    try { await actions[Number(b.dataset.act)].run([...state], { clear }); }
    finally { btns.forEach((x) => { x.disabled = false; }); sync(); }
  });
  sync();
  return { ids: () => [...state], clear, refresh: sync, destroy: () => { bar.remove(); host.classList.remove('g-has-bar'); } };
}
