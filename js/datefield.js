// ช่องเลือกวันที่บนจอสัมผัส: iPhone/Android แสดงวันที่ตามภาษาของเครื่อง (เช่น "1 Nov 2026") แก้ด้วย CSS ไม่ได้
// → วางข้อความวันที่ไทย ("1 พ.ย. 2569") ทับหน้าช่อง ส่วนช่องจริงยังอยู่เต็มพื้นที่แบบโปร่งใส แตะแล้วเปิดตัวเลือกวันของเครื่องเหมือนเดิม
// ใช้เฉพาะอุปกรณ์สัมผัส (pointer: coarse) เพราะบนคอมพิวเตอร์ผู้ใช้พิมพ์/เลือกส่วนของวันที่ในช่องจริง
import { thaiDate } from './util.js?v=2569.11.1-16';

const CAL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>';

export function enhanceDateField(inp) {
  if (inp.dataset.th || inp.type !== 'date') return;
  inp.dataset.th = '1';
  const wrap = document.createElement('span'); wrap.className = 'dt-wrap';
  const face = document.createElement('span'); face.className = 'dt-face'; face.setAttribute('aria-hidden', 'true');
  inp.replaceWith(wrap); wrap.append(inp, face);
  const paint = () => { face.innerHTML = `<span class="${inp.value ? '' : 'dt-empty'}">${inp.value ? thaiDate(inp.value, true) : 'เลือกวันที่'}</span>${CAL}`; };
  paint();
  inp.addEventListener('input', paint); inp.addEventListener('change', paint);
}

export function enhanceDateFields(root = document.body, { force = false } = {}) {
  if (!force && !window.matchMedia('(pointer: coarse)').matches) return;
  root.querySelectorAll('input[type=date]:not([data-th])').forEach(enhanceDateField);
}

// ดูหน้าที่วาดใหม่ตลอด (แต่ละหน้าสร้างช่องใหม่ทุกครั้งที่เปลี่ยนห้อง/วัน)
export function initDateFields() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  let t = 0;
  new MutationObserver(() => { cancelAnimationFrame(t); t = requestAnimationFrame(() => enhanceDateFields()); }).observe(document.body, { childList: true, subtree: true });
  enhanceDateFields();
}
