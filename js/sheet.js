// ตารางกรอกข้อมูลแบบ Excel: ลากคลุมหลายช่อง · คัดลอก/ตัด/วาง · ลบทั้งช่วง · ลากมุมขวาล่างเพื่อเติม (คัดลอก/เรียงเลข) · เลิกทำ
// ทุกการเขียนผ่านฟังก์ชันบันทึกเดิมของหน้านั้น (set / setBatch) จึงตรวจค่าและสิทธิ์เหมือนกรอกเอง ค่าที่ไม่ผ่านจะไม่ถูกบันทึก
// ช่องต้องมี data-r / data-c · ตัวเลือก: { cell: ตัวเลือก CSS ของช่อง, get(el), set(el, text) → true/false หรือ setBatch([{el,value}]) → [true/false], canEdit }
import { toast, modal } from './util.js?v=2569.10.31-10';
import { parseClip, toTsv, fillValues, wantSeries } from './sheet-core.js?v=2569.10.31-10';

let current = null;                                   // ตารางที่มีการเลือกอยู่ (มีได้ทีละตาราง)
const isField = (t) => !!t?.closest?.('input, textarea, select');

export function attachSheet(table, o) {
  const { cell, get, canEdit = true } = o;
  const wrap = table.closest('.tbl-wrap') || table.parentElement;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

  // ---- ดัชนีช่อง ----
  let map = null; let dims = { R: 0, C: 0 };
  const build = () => {
    map = new Map(); let R = 0; let C = 0;
    table.querySelectorAll(`${cell}[data-r][data-c]`).forEach((el) => {
      const r = Number(el.dataset.r); const c = Number(el.dataset.c);
      map.set(`${r},${c}`, el); R = Math.max(R, r + 1); C = Math.max(C, c + 1);
    });
    dims = { R, C };
  };
  const at = (r, c) => { if (!map) build(); return map.get(`${r},${c}`); };
  const size = () => { if (!map) build(); return dims; };
  new MutationObserver(() => { map = null; }).observe(table, { childList: true, subtree: true });
  const cellFrom = (t) => {
    const td = t?.closest?.('td'); if (!td || !table.contains(td)) return null;
    return td.querySelector(`${cell}[data-r][data-c]`);
  };
  const pos = (el) => ({ r: Number(el.dataset.r), c: Number(el.dataset.c) });

  // ---- การเลือก ----
  let sel = null;                                      // { r1, c1 (จุดเริ่ม), r2, c2 (จุดปัจจุบัน) }
  const norm = (s) => ({ r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) });
  const cellsOf = (n) => { const out = []; for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) out.push({ r, c, el: at(r, c) }); return out; };
  const count = (s) => { const n = norm(s); return (n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1); };
  let lit = []; let prev = [];
  const paint = (list, cls, store) => { store.forEach((td) => td.classList.remove(cls)); const out = [];
    list.forEach(({ el }) => { const td = el?.closest('td'); if (td) { td.classList.add(cls); out.push(td); } }); return out; };

  const handle = document.createElement('div');
  handle.className = 'sheet-handle no-print'; handle.hidden = true; handle.title = 'ลากเพื่อเติม (กด Ctrl สลับคัดลอก/เรียงเลข)';
  wrap.appendChild(handle);
  const place = () => {
    const n = sel && canEdit ? norm(sel) : null; const el = n && at(n.r2, n.c2);
    if (!el) { handle.hidden = true; return; }
    const t = el.closest('td').getBoundingClientRect(); const w = wrap.getBoundingClientRect();
    handle.style.left = `${t.right - w.left + wrap.scrollLeft - 5}px`; handle.style.top = `${t.bottom - w.top + wrap.scrollTop - 5}px`;
    handle.hidden = false;
  };

  const bar = document.createElement('div');
  bar.className = 'sheet-bar no-print';
  bar.innerHTML = `<span class="sb-msg small muted"></span><span class="sb-btns">
    <button type="button" class="btn btn-sm" data-act="copy">คัดลอก</button>
    ${canEdit ? `<button type="button" class="btn btn-sm" data-act="down" title="Ctrl+D">เติมลง</button>
    <button type="button" class="btn btn-sm" data-act="right" title="Ctrl+R">เติมขวา</button>
    <button type="button" class="btn btn-sm" data-act="clear" title="Delete">ลบ</button>
    <button type="button" class="btn btn-sm" data-act="undo" title="Ctrl+Z">เลิกทำ</button>` : ''}</span>`;
  wrap.insertAdjacentElement('beforebegin', bar);
  const HINT = canEdit ? 'ลากคลุมหลายช่องได้ · Ctrl+C คัดลอก · Delete ลบ · ลากมุมขวาล่างเพื่อเติม (กด Ctrl สลับคัดลอก/เรียงเลข)' : 'ลากคลุมหลายช่องแล้ว Ctrl+C เพื่อคัดลอกไปวางใน Excel ได้';
  const undo = [];
  const updateBar = () => {
    bar.querySelector('.sb-msg').textContent = sel ? `เลือก ${count(sel)} ช่อง` : HINT;
    bar.querySelectorAll('button').forEach((b) => {
      const a = b.dataset.act;
      b.disabled = a === 'undo' ? !undo.length : !sel;
    });
  };

  const setSel = (s) => {
    if (s && current && current !== api) current.clear();
    sel = s; current = s ? api : (current === api ? null : current);
    lit = paint(s ? cellsOf(norm(s)) : [], 'sel', lit);
    place(); updateBar();
  };

  // ---- เขียนค่า (ผ่านฟังก์ชันบันทึกเดิม) ----
  const run = (changes) => (o.setBatch ? o.setBatch(changes) : changes.map((x) => o.set(x.el, x.value)));
  const apply = (changes, label) => {
    if (!canEdit) return 0;
    const todo = changes.filter((x) => x.el && !x.el.readOnly && !x.el.disabled && get(x.el) !== x.value);
    if (!todo.length) { toast('ไม่มีช่องที่ต้องเปลี่ยน'); return 0; }
    const before = todo.map((x) => get(x.el));
    const res = run(todo); const done = []; let bad = 0;
    todo.forEach((x, i) => { if (res[i]) done.push({ el: x.el, value: before[i] }); else bad++; });
    if (done.length) { undo.push({ label, items: done }); if (undo.length > 30) undo.shift(); }
    toast(bad ? `${label} ${done.length} ช่อง · ไม่ผ่านการตรวจ ${bad} ช่อง (ไม่ได้บันทึก)` : `${label} ${done.length} ช่อง`, bad ? 'err' : 'ok');
    updateBar();
    return done.length;
  };
  const doUndo = () => {
    const op = undo.pop(); if (!op) return;
    const ch = op.items.map((i) => ({ el: i.el, value: i.value }));
    const ok = run(ch).filter(Boolean).length;
    toast(`เลิกทำ "${op.label}" ${ok} ช่อง`); updateBar();
  };

  // ---- คัดลอก / ลบ ----
  const matrix = (n) => { const rows = []; for (let r = n.r1; r <= n.r2; r++) { const row = []; for (let c = n.c1; c <= n.c2; c++) { const el = at(r, c); row.push(el ? get(el) : ''); } rows.push(row); } return rows; };
  const copyText = () => toTsv(matrix(norm(sel)));
  const copyNow = async () => {
    const text = copyText();
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(`คัดลอก ${count(sel)} ช่อง`);
  };
  const clearSel = async () => {
    if (!canEdit || !sel) return;
    const list = cellsOf(norm(sel)).filter((x) => x.el && !x.el.readOnly && !x.el.disabled && get(x.el) !== '');
    if (!list.length) { toast('ช่องที่เลือกว่างอยู่แล้ว'); return; }
    if (list.length > 10) {
      const ok = await modal('ลบข้อมูลที่เลือก', `<p>จะลบข้อมูล <b>${list.length}</b> ช่อง</p><p class="small muted">เลิกทำได้ด้วยปุ่ม "เลิกทำ" หรือ Ctrl+Z</p>`, { okText: 'ลบ' });
      if (!ok) return;
    }
    apply(list.map((x) => ({ el: x.el, value: '' })), 'ลบ');
  };

  // ---- เติม (ลากมุม / Ctrl+D / Ctrl+R) ----
  const fill = (src, dest, dir, ctrl) => {
    const vert = dir === 'down' || dir === 'up'; const rev = dir === 'up' || dir === 'left'; const ch = [];
    const lines = vert ? Array.from({ length: src.c2 - src.c1 + 1 }, (_, i) => src.c1 + i) : Array.from({ length: src.r2 - src.r1 + 1 }, (_, i) => src.r1 + i);
    for (const ln of lines) {
      const from = vert ? src.r1 : src.c1; const to = vert ? src.r2 : src.c2;
      const idx = []; for (let k = from; k <= to; k++) idx.push(k);
      const vals = idx.map((k) => { const el = vert ? at(k, ln) : at(ln, k); return el ? get(el) : ''; });
      if (rev) vals.reverse();
      const targets = []; const lo = vert ? dest.r1 : dest.c1; const hi = vert ? dest.r2 : dest.c2;
      if (rev) for (let k = from - 1; k >= lo; k--) targets.push(k); else for (let k = to + 1; k <= hi; k++) targets.push(k);
      const out = fillValues(vals, targets.length, { series: wantSeries(vals, ctrl) });
      targets.forEach((k, i) => { const el = vert ? at(k, ln) : at(ln, k); if (el) ch.push({ el, value: out[i] }); });
    }
    const n = apply(ch, wantSeries(lineVals(src, dir, lines[0]), ctrl) ? 'เรียงเลข' : 'เติม');
    setSel({ r1: dest.r1, c1: dest.c1, r2: dest.r2, c2: dest.c2 });
    return n;
  };
  const lineVals = (src, dir, ln) => { const vert = dir === 'down' || dir === 'up'; const out = [];
    for (let k = vert ? src.r1 : src.c1; k <= (vert ? src.r2 : src.c2); k++) { const el = vert ? at(k, ln) : at(ln, k); out.push(el ? get(el) : ''); } return out; };
  const fillInside = (dir) => {
    if (!sel) return; const n = norm(sel);
    if (dir === 'down' && n.r1 === n.r2) return toast('เลือกมากกว่า 1 แถวก่อน (ช่องบนสุดจะถูกคัดลอกลงล่าง)', 'err');
    if (dir === 'right' && n.c1 === n.c2) return toast('เลือกมากกว่า 1 คอลัมน์ก่อน (ช่องซ้ายสุดจะถูกคัดลอกไปขวา)', 'err');
    const src = dir === 'down' ? { ...n, r2: n.r1 } : { ...n, c2: n.c1 };
    fill(src, n, dir, false);
  };

  // ---- วาง ----
  const doPaste = (text) => {
    const m = parseClip(text); const h = m.length; const w = Math.max(...m.map((r) => r.length));
    const multi = h > 1 || w > 1;
    let region = null; let start = null;
    if (sel && (count(sel) > 1 || !isField(document.activeElement))) { region = norm(sel); start = { r: region.r1, c: region.c1 }; }
    else { const el = cellFrom(document.activeElement); if (el && multi) start = pos(el); }
    if (!start) return false;
    const { R, C } = size(); const ch = []; let clipped = 0; let dest;
    const rh = region ? region.r2 - region.r1 + 1 : 0; const rw = region ? region.c2 - region.c1 + 1 : 0;
    if (region && !multi && count(sel) > 1) {                      // ค่าเดียวลงทั้งช่วง
      cellsOf(region).forEach((x) => { if (x.el) ch.push({ el: x.el, value: (m[0][0] ?? '').trim() }); });
      dest = region;
    } else if (region && count(sel) > 1 && rh % h === 0 && rw % w === 0) {    // ช่วงเป็นทวีคูณของที่คัดลอก = วางซ้ำเป็นกระเบื้อง
      cellsOf(region).forEach((x) => { const v = m[(x.r - region.r1) % h][(x.c - region.c1) % w] ?? ''; if (x.el) ch.push({ el: x.el, value: v.trim() }); });
      dest = region;
    } else {
      m.forEach((row, i) => row.forEach((v, j) => { const r = start.r + i; const c = start.c + j;
        if (r >= R || c >= C || !at(r, c)) { clipped++; return; } ch.push({ el: at(r, c), value: v.trim() }); }));
      dest = { r1: start.r, c1: start.c, r2: Math.min(R - 1, start.r + h - 1), c2: Math.min(C - 1, start.c + w - 1) };
    }
    apply(ch, 'วาง');
    if (clipped) toast(`เกินขอบตาราง ${clipped} ค่าไม่ได้วาง`, 'err');
    setSel(dest);
    return true;
  };

  // ---- เมาส์: ลากคลุม ----
  let drag = null; let fillDrag = null; let preview = [];
  const onDown = (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const el = cellFrom(e.target); if (!el) return;
    if (e.shiftKey && (sel || cellFrom(document.activeElement))) {
      const a = sel ? { r: sel.r1, c: sel.c1 } : pos(cellFrom(document.activeElement));
      e.preventDefault(); setSel({ r1: a.r, c1: a.c, r2: pos(el).r, c2: pos(el).c }); return;
    }
    if (sel) setSel(null);
    drag = { ...pos(el), el, moved: false };
  };
  const cellAt = (e) => cellFrom(document.elementFromPoint(e.clientX, e.clientY));
  const onMove = (e) => {
    if (!table.isConnected) { cleanup(); return; }
    if (drag) {
      const el = cellAt(e); if (!el || (!drag.moved && el === drag.el)) return;
      if (!drag.moved) { drag.moved = true; table.classList.add('sheet-drag'); document.activeElement?.blur?.(); getSelection()?.removeAllRanges(); }
      const p = pos(el); setSel({ r1: drag.r, c1: drag.c, r2: p.r, c2: p.c });
    } else if (fillDrag) {
      const el = cellAt(e); if (!el) return;
      const p = pos(el); const s = fillDrag.src;
      const dr = p.r > s.r2 ? p.r - s.r2 : p.r < s.r1 ? p.r - s.r1 : 0;
      const dc = p.c > s.c2 ? p.c - s.c2 : p.c < s.c1 ? p.c - s.c1 : 0;
      fillDrag.dest = null;
      if (dr || dc) {
        if (Math.abs(dr) >= Math.abs(dc)) fillDrag.dir = dr > 0 ? 'down' : 'up'; else fillDrag.dir = dc > 0 ? 'right' : 'left';
        fillDrag.dest = { ...s };
        if (fillDrag.dir === 'down') fillDrag.dest.r2 = p.r; else if (fillDrag.dir === 'up') fillDrag.dest.r1 = p.r;
        else if (fillDrag.dir === 'right') fillDrag.dest.c2 = p.c; else fillDrag.dest.c1 = p.c;
      }
      preview = paint(fillDrag.dest ? cellsOf(fillDrag.dest) : [], 'fillprev', preview);
    }
  };
  const onUp = (e) => {
    if (drag) { drag = null; table.classList.remove('sheet-drag'); }
    if (fillDrag) {
      const f = fillDrag; fillDrag = null; table.classList.remove('sheet-drag'); handle.style.pointerEvents = '';
      preview = paint([], 'fillprev', preview);
      if (f.dest) fill(f.src, f.dest, f.dir, e.ctrlKey || e.altKey || e.metaKey);
    }
  };
  const onHandleDown = (e) => {
    if (!sel || !canEdit || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    fillDrag = { src: norm(sel), dest: null, dir: null }; table.classList.add('sheet-drag'); handle.style.pointerEvents = 'none';
  };
  // นิ้วสัมผัส: ลากมุมเติมได้ (ลากคลุมใช้เมาส์ หรือปุ่มในแถบด้านบน)
  handle.style.touchAction = 'none';
  handle.addEventListener('pointerdown', onHandleDown);
  document.addEventListener('pointercancel', () => { fillDrag = null; drag = null; preview = paint([], 'fillprev', preview); table.classList.remove('sheet-drag'); handle.style.pointerEvents = ''; });

  // ---- คีย์บอร์ด / คลิปบอร์ด (ระดับเอกสาร เพราะหลังลากคลุม โฟกัสไม่ได้อยู่ในช่องแล้ว) ----
  const mine = (t) => table.contains(t);
  const onKey = (e) => {
    if (!table.isConnected) { cleanup(); return; }
    const t = e.target; const active = sel || (mine(t) && cellFrom(t));
    if (!active) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape' && sel) { setSel(null); return; }
    if (mod && !e.shiftKey && !e.altKey && sel) {
      if (e.key === 'd' || e.key === 'D') { e.preventDefault(); e.stopPropagation(); fillInside('down'); return; }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); e.stopPropagation(); fillInside('right'); return; }
    }
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && undo.length && !isField(t)) { e.preventDefault(); doUndo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && (count(sel) > 1 || !isField(t))) { e.preventDefault(); e.stopPropagation(); clearSel(); return; }
    const mv = e.shiftKey && !mod && { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (mv && (mv[1] === 0 || sel || !isField(t))) {              // Shift+ลูกศรซ้ายขวาในช่องที่กำลังพิมพ์ = เลือกข้อความตามปกติ
      const base = sel || (() => { const p = pos(cellFrom(t)); return { r1: p.r, c1: p.c, r2: p.r, c2: p.c }; })();
      const { R, C } = size();
      e.preventDefault(); e.stopPropagation();
      setSel({ ...base, r2: Math.max(0, Math.min(R - 1, base.r2 + mv[0])), c2: Math.max(0, Math.min(C - 1, base.c2 + mv[1])) });
    }
  };
  const rangeActive = (t) => sel && (count(sel) > 1 || !isField(t));
  const onCopy = (e) => { if (!rangeActive(e.target)) return; e.preventDefault(); e.clipboardData.setData('text/plain', copyText()); toast(`คัดลอก ${count(sel)} ช่อง`); };
  const onCut = (e) => { if (!rangeActive(e.target)) return; onCopy(e); if (canEdit) clearSel(); };
  const onPaste = (e) => {
    if (!canEdit || !table.isConnected) return;
    const text = e.clipboardData?.getData('text'); if (!text) return;
    if (!sel && !mine(e.target)) return;
    if (doPaste(text)) { e.preventDefault(); e.stopPropagation(); }
  };
  const onOutside = (e) => { if (sel && !table.contains(e.target) && !bar.contains(e.target) && !e.target.closest?.('.modal-wrap')) setSel(null); };

  table.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointerdown', onOutside);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCut, true);
  document.addEventListener('paste', onPaste, true);
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.act; if (!a) return;
    if (a === 'copy') copyNow(); else if (a === 'clear') clearSel(); else if (a === 'undo') doUndo();
    else if (a === 'down') fillInside('down'); else if (a === 'right') fillInside('right');
  });
  window.addEventListener('resize', place);

  function cleanup() {
    document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointerdown', onOutside); document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('copy', onCopy, true); document.removeEventListener('cut', onCut, true);
    document.removeEventListener('paste', onPaste, true); window.removeEventListener('resize', place);
    if (current === api) current = null;
  }
  const api = { clear: () => setSel(null), cleanup };
  updateBar();
  return api;
}
