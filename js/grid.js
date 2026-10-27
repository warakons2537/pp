// ตัวช่วยตารางกรอกข้อมูลแบบ Excel: ลูกศร/Enter เลื่อนช่อง, เลือกข้อความเมื่อเข้าช่อง, วางหลายช่องจาก Excel
// ช่องกรอกต้องมี class="gc" และ data-r / data-c
import { toast } from './util.js?v=2569.10.27-9';

export function attachGrid(table, onCommit) {
  const cell = (r, c) => table.querySelector(`input.gc[data-r="${r}"][data-c="${c}"]`);
  table.addEventListener('focusin', (e) => { if (e.target.matches('input.gc')) e.target.select(); });
  table.addEventListener('change', (e) => { if (e.target.matches('input.gc')) onCommit(e.target, e.target.value); });
  table.addEventListener('keydown', (e) => {
    const inp = e.target.closest('input.gc'); if (!inp) return;
    const mv = { ArrowDown: [1, 0], Enter: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] }[e.key];
    if (!mv) return;
    e.preventDefault();
    const next = cell(Number(inp.dataset.r) + mv[0], Number(inp.dataset.c) + mv[1]);
    if (next) next.focus(); else inp.blur();
  });
  table.addEventListener('paste', (e) => {
    const inp = e.target.closest('input.gc'); if (!inp) return;
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const r0 = Number(inp.dataset.r); const c0 = Number(inp.dataset.c);
    let ok = 0; let bad = 0;
    rows.forEach((line, i) => line.forEach((v, j) => {
      const t = cell(r0 + i, c0 + j); if (!t || t.readOnly) return;
      if (onCommit(t, v)) ok++; else bad++;
    }));
    toast(bad ? `วางแล้ว ${ok} ช่อง · มีปัญหา ${bad} ช่อง (สีแดง)` : `วางแล้ว ${ok} ช่อง`, bad ? 'err' : 'ok');
  });
}
