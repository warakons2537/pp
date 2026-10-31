// ---------- แท็บแบบกลุ่ม (ใช้ร่วมทุกหน้า) ----------
// groups = [{ label, icon, tabs: [{ key, label (HTML ได้), disabled, title }] }]
// แต่ละกลุ่ม: ป้ายหัวกลุ่ม + ไอคอน → แถวแท็บเลื่อนแนวนอน · ปุ่ม › ที่ขอบขวาเมื่อยังมีแท็บต่อไป (กดเพื่อเลื่อน)
import { esc } from './util.js?v=2569.10.31-13';
import { icon } from './icons.js?v=2569.10.31-13';

export const tabGroups = (groups, cur, attr = 'tab', cls = '') => `<div class="tabgroups ${cls}">${groups.map((g) => `
  <section class="tg" aria-label="${esc(g.label)}">
    <div class="tg-label">${icon(g.icon)}${esc(g.label)}</div>
    <div class="tg-scroll"><div class="tg-row" role="tablist" aria-label="${esc(g.label)}">${g.tabs.map((t) => `<button type="button" role="tab" data-${attr}="${esc(t.key)}"
      aria-selected="${t.key === cur}" class="${t.key === cur ? 'on' : ''}" ${t.disabled ? 'disabled' : ''} ${t.title ? `title="${esc(t.title)}"` : ''}>${t.label}</button>`).join('')}</div>
      <button type="button" class="tg-more" tabindex="-1" aria-label="เลื่อนดูแท็บถัดไป">›</button></div>
  </section>`).join('')}</div>`;

// ผูกลูกศร ›: ซ่อนเมื่อสุดแถว · กดแล้วเลื่อนไปทางขวา · เลื่อนแท็บที่เลือกให้อยู่ในจอ
export function wireTabGroups(root) {
  root.querySelectorAll('.tg-scroll').forEach((box) => {
    const row = box.querySelector('.tg-row');
    const sync = () => box.classList.toggle('at-end', row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
    row.addEventListener('scroll', sync, { passive: true });
    box.querySelector('.tg-more').addEventListener('click', () => row.scrollBy({ left: Math.max(120, row.clientWidth * 0.7), behavior: 'smooth' }));
    const on = row.querySelector('.on');
    if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - 16;
    sync();
    if (window.ResizeObserver) new ResizeObserver(sync).observe(row);
  });
}
