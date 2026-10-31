// ปัดซ้าย/ขวาบนจอสัมผัส (ใช้เปลี่ยนวันในเช็กชื่อ/เช็กอาหาร) — ปัดแนวนอนชัดเจนเท่านั้น เลื่อนหน้าขึ้นลงไม่ทำงาน
export function onSwipe(el, cb, { min = 70 } = {}) {
  let x0 = 0; let y0 = 0; let t0 = 0; let on = false;
  el.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) { on = false; return; } const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); on = true; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!on) return; on = false;
    const t = e.changedTouches[0]; const dx = t.clientX - x0; const dy = t.clientY - y0;
    if (Math.abs(dx) >= min && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - t0 < 800) cb(dx < 0 ? 'left' : 'right');
  }, { passive: true });
}
