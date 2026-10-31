// ลากแถวขึ้นลงเพื่อเรียงลำดับ (เหมือนเพลย์ลิสต์ YouTube): จับที่ไอคอน ⋮⋮ แล้วลาก แถวอื่นเลื่อนหลบให้ · เลื่อนหน้าจออัตโนมัติเมื่อลากไปชิดขอบ
// ใช้ได้ทั้งเมาส์และนิ้ว (pointer events) · คีย์บอร์ด: โฟกัสที่ไอคอนแล้วกดลูกศรขึ้น/ลง · Esc ขณะลาก = ยกเลิก
// tbody: ตัวครอบแถว · rowSel: ตัวเลือกแถวที่เรียงได้ · handleSel: ที่จับ · onChange(rows[]) เรียกเมื่อปล่อยและลำดับเปลี่ยนจริง
export function sortableRows(tbody, { rowSel = 'tr[data-sortable]', handleSel = '.drag', onChange, onMove = () => {}, say = () => {} }) {
  const rows = () => [...tbody.querySelectorAll(rowSel)];
  let st = null;

  const start = (e, row) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const before = rows();
    const last = before[before.length - 1];
    st = { row, before, anchor: last ? last.nextElementSibling : null, order0: before.map((r) => r.dataset.sid), startY: e.clientY + window.scrollY, y: e.clientY, raf: 0, id: e.pointerId };
    row.classList.add('dragging');
    tbody.closest('table')?.classList.add('sorting');
    e.target.closest(handleSel)?.setPointerCapture?.(e.pointerId);
    loop();
  };

  const natural = (row, dy) => row.getBoundingClientRect().top + window.scrollY - dy;
  const update = () => {
    if (!st) return;
    const { row } = st;
    let dy = st.y + window.scrollY - st.startY;
    row.style.transform = `translateY(${dy}px)`;
    // แถวที่ตัวชี้อยู่ด้านบน (ไม่นับแถวที่กำลังลาก)
    const others = rows().filter((r) => r !== row);
    const py = st.y;
    const over = others.find((r) => { const b = r.getBoundingClientRect(); return py >= b.top && py <= b.bottom; });
    if (over) {
      const b = over.getBoundingClientRect(); const after = py > b.top + b.height / 2;
      const n1 = natural(row, dy);
      const target = after ? over.nextElementSibling : over;
      // เลื่อนจริงเมื่อข้ามกึ่งกลางของแถวนั้นเท่านั้น (กันสั่น)
      const idx = rows().indexOf(row); const oi = rows().indexOf(over);
      if ((after && oi > idx) || (!after && oi < idx)) {
        if (target !== row) tbody.insertBefore(row, target);
        const n2 = natural(row, dy);
        st.startY += n2 - n1;                              // ชดเชยตำแหน่งตามธรรมชาติที่เปลี่ยน ให้แถวติดตัวชี้ต่อ
        dy = st.y + window.scrollY - st.startY;
        row.style.transform = `translateY(${dy}px)`;
        onMove(rows());
      }
    }
  };
  // เลื่อนหน้าจออัตโนมัติเมื่อชิดขอบบน/ล่าง
  const loop = () => {
    if (!st) return;
    const h = window.innerHeight; const edge = 70;
    if (st.y < edge) window.scrollBy(0, -Math.ceil((edge - st.y) / 6));
    else if (st.y > h - edge) window.scrollBy(0, Math.ceil((st.y - (h - edge)) / 6));
    update();
    st.raf = requestAnimationFrame(loop);
  };
  const finish = (cancel) => {
    if (!st) return;
    const { row, order0, raf, anchor } = st; st = null; cancelAnimationFrame(raf);
    row.classList.remove('dragging'); row.style.transform = '';
    tbody.closest('table')?.classList.remove('sorting');
    if (cancel) { const map = new Map(rows().map((r) => [r.dataset.sid, r])); order0.forEach((id) => tbody.insertBefore(map.get(id), anchor)); onMove(rows()); return; }
    const now = rows();
    if (now.some((r, i) => r.dataset.sid !== order0[i])) onChange(now);
  };

  tbody.addEventListener('pointerdown', (e) => { const h = e.target.closest(handleSel); const row = h?.closest(rowSel); if (h && row) start(e, row); });
  document.addEventListener('pointermove', (e) => { if (st) { st.y = e.clientY; update(); } });
  document.addEventListener('pointerup', () => finish(false));
  document.addEventListener('pointercancel', () => finish(true));
  document.addEventListener('keydown', (e) => { if (st && e.key === 'Escape') { e.preventDefault(); finish(true); } });

  // คีย์บอร์ด (สำหรับผู้ที่ใช้เมาส์ไม่สะดวก)
  tbody.addEventListener('keydown', (e) => {
    const h = e.target.closest(handleSel); const row = h?.closest(rowSel); if (!h || !row || st) return;
    const dir = { ArrowUp: -1, ArrowDown: 1 }[e.key]; if (!dir) return;
    e.preventDefault();
    const list = rows(); const i = list.indexOf(row); const j = i + dir;
    if (j < 0 || j >= list.length) return;
    if (dir < 0) tbody.insertBefore(row, list[j]); else tbody.insertBefore(row, list[j].nextElementSibling);
    h.focus(); onMove(rows()); say(row, j + 1);
    clearTimeout(tbody._kt); tbody._kt = setTimeout(() => onChange(rows()), 700);          // รอให้กดต่อเนื่องจนเสร็จก่อนค่อยบันทึก
  });
}
