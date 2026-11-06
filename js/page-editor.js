// =====================================================================
//  ปรับหน้าแบบลากบนหน้ากระดาษจริง (แบบ Word) — ใช้ร่วมกันในแท็บ "ปพ.5 ครบชุด" และ "เล่ม ปพ."
//  - ลากเส้นขอบกระดาษ 4 ด้าน · ลากเส้นแบ่งคอลัมน์/แถวเพื่อปรับความกว้าง/สูงรายคอลัมน์/รายแถว
//  - ลากย้ายตำแหน่งตาราง · ลากมุมขวาล่างเพื่อย่อ/ขยาย · ไม้บรรทัด (มม.) · ย้อนกลับ/ทำซ้ำ · เห็นผลทันทีระหว่างลาก
//  ตัวแสดงผลส่งข้อมูลตำแหน่งของหน้า (info) มาให้: ขอบ · จุดวางเนื้อหา · คอลัมน์/แถวที่เห็นในหน้านั้น (หน่วย pt บนกระดาษ)
// =====================================================================
import { esc } from './util.js?v=2569.11.1-37';
import { adjText } from './page-adjust.js?v=2569.11.1-37';

const MM = 25.4 / 72;                       // pt → มม.
const PT = 72 / 25.4;                       // มม. → pt
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const colName = (n) => { let s = ''; for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };

const CSS = `
.pe-wrap{position:fixed;inset:0;background:rgba(15,23,32,.6);z-index:1200;display:flex;align-items:center;justify-content:center}
.pe{width:min(1180px,98vw);height:min(94vh,980px);background:var(--surface,#fff);color:var(--ink,#1c2833);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.pe-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--rule-strong,#cfd6dd);background:var(--surface-2,#f4f6f8)}
.pe-bar h3{margin:0;font-size:1rem}
.pe-seg{display:inline-flex;border:1px solid var(--rule-strong,#cfd6dd);border-radius:8px;overflow:hidden}
.pe-seg button{border:0;background:transparent;padding:5px 10px;cursor:pointer;font:inherit;font-size:.85rem}
.pe-seg button.on{background:var(--green,#0f5132);color:#fff}
.pe-bar .btn{padding:4px 10px;font-size:.85rem}
.pe-read{font-size:.8rem;color:var(--ink-soft,#5b6770);padding:4px 12px;border-bottom:1px solid var(--rule,#e3e8ec);min-height:1.6em}
.pe-stage{flex:1;overflow:auto;background:#6b7580;padding:14px;display:flex;justify-content:center;align-items:flex-start}
.pe-grid{display:grid;grid-template-columns:22px auto;grid-template-rows:22px auto;gap:0}
.pe-ruler{background:#e9edf1;position:relative;overflow:hidden;font-size:9px;color:#444;user-select:none}
.pe-paper{position:relative;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.4)}
.pe-paper .pe-pg{position:absolute;inset:0;pointer-events:none}
.pe-paper .pe-pg .pv-inner{position:absolute;left:0;top:0;transform-origin:0 0;display:block}
.pe-ov{position:absolute;inset:0;touch-action:none}
.pe-h{position:absolute;touch-action:none}
.pe-h.v{cursor:col-resize;width:9px;margin-left:-4px}
.pe-h.v::after{content:"";position:absolute;left:4px;top:0;bottom:0;border-left:1px dashed rgba(220,38,38,.55)}
.pe-h.v:hover::after,.pe-h.v.act::after{border-left:2px solid #dc2626}
.pe-h.h{cursor:row-resize;height:9px;margin-top:-4px}
.pe-h.h::after{content:"";position:absolute;top:4px;left:0;right:0;border-top:1px dashed rgba(220,38,38,.55)}
.pe-h.h:hover::after,.pe-h.h.act::after{border-top:2px solid #dc2626}
.pe-m{position:absolute;touch-action:none}
.pe-m.v{cursor:col-resize;width:11px;margin-left:-5px}
.pe-m.v::after{content:"";position:absolute;left:5px;top:0;bottom:0;border-left:2px dashed #2563eb}
.pe-m.h{cursor:row-resize;height:11px;margin-top:-5px}
.pe-m.h::after{content:"";position:absolute;top:5px;left:0;right:0;border-top:2px dashed #2563eb}
.pe-shade{position:absolute;background:rgba(37,99,235,.08);pointer-events:none}
.pe-move{position:absolute;cursor:move;outline:2px solid rgba(37,99,235,.55);background:rgba(37,99,235,.05)}
.pe-corner{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;background:#2563eb;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;touch-action:none}
.pe-foot{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--rule-strong,#cfd6dd)}
.pe-tip{font-size:.78rem;color:var(--ink-soft,#5b6770);padding:2px 12px 6px}
`;
let cssDone = false;

const rulerSvg = (lenPt, k, horizontal) => {
  const mmPx = k * PT; const total = Math.floor(lenPt * MM); let ticks = '';
  for (let mm = 0; mm <= total; mm++) {
    const big = mm % 10 === 0; const mid = mm % 5 === 0; const len = big ? 10 : mid ? 7 : 4; const p = mm * mmPx;
    ticks += horizontal ? `<line x1="${p}" y1="${22 - len}" x2="${p}" y2="22" stroke="#555" stroke-width="1"/>${big && mm ? `<text x="${p + 2}" y="9" fill="#444">${mm / 10}</text>` : ''}`
      : `<line x1="${22 - len}" y1="${p}" x2="22" y2="${p}" stroke="#555" stroke-width="1"/>${big && mm ? `<text x="1" y="${p + 9}" fill="#444">${mm / 10}</text>` : ''}`;
  }
  return `<svg width="${horizontal ? lenPt * k : 22}" height="${horizontal ? 22 : lenPt * k}" xmlns="http://www.w3.org/2000/svg" font-size="8">${ticks}</svg>`;
};

/**
 * @param title   ชื่อแผ่น
 * @param render  (adj) => [{ w, h, html, info }]  วาดทุกหน้าของแผ่นด้วยค่าปรับ adj (หน่วยเดียวกับที่เก็บ: ขอบเป็นมม.)
 * @param adj     ค่าปรับที่เก็บไว้ก่อนหน้า (หรือ undefined)
 * @param canApplyOthers  แสดงช่อง "ใช้กับแผ่นอื่นที่เลือกด้วย"
 * @returns null (ยกเลิก) | { adj: object|null (null = ล้างค่า), others: boolean }
 */
export function openPageEditor({ title, render, adj, canApplyOthers = false }) {
  return new Promise((resolve) => {
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    let cur = JSON.parse(JSON.stringify(adj || {}));
    const undo = []; const redo = [];
    let pages = []; let pi = 0; let mode = 'margin'; let zoomK = 1; let drag = null; let raf = 0; let hot = null;
    const doRender = () => { try { pages = render(cur) || []; } catch (err) { console.error(err); pages = pages.length ? pages : []; } if (pi >= pages.length) pi = Math.max(0, pages.length - 1); };

    const wrap = document.createElement('div'); wrap.className = 'pe-wrap';
    wrap.innerHTML = `<div class="pe" role="dialog" aria-modal="true" aria-label="ปรับหน้าแบบลาก">
      <div class="pe-bar"><h3>ปรับหน้าแบบลาก — ${esc(title)}</h3>
        <span class="pe-seg" id="pe-mode"><button data-m="margin" class="on" title="ลากเส้นประสีน้ำเงินเพื่อปรับขอบกระดาษ">ขอบกระดาษ</button><button data-m="col" title="ลากเส้นแบ่งคอลัมน์เพื่อปรับความกว้าง">คอลัมน์</button><button data-m="row" title="ลากเส้นแบ่งแถวเพื่อปรับความสูง">แถว</button><button data-m="move" title="ลากตารางเพื่อย้ายตำแหน่ง · ลากจุดมุมขวาล่างเพื่อย่อ/ขยาย">ย้าย / ขนาด</button></span>
        <span class="pe-seg"><button id="pe-prev" title="หน้าก่อนหน้า">‹</button><button id="pe-pn" disabled style="cursor:default">1/1</button><button id="pe-next" title="หน้าถัดไป">›</button></span>
        <label class="small" style="display:flex;gap:4px;align-items:center">ซูม <input type="range" id="pe-zoom" min="60" max="300" value="100" style="width:110px"></label>
        <button class="btn btn-ghost" id="pe-undo" title="ย้อนกลับ (Ctrl+Z)">↶ ย้อนกลับ</button><button class="btn btn-ghost" id="pe-redo" title="ทำซ้ำ (Ctrl+Shift+Z)">↷ ทำซ้ำ</button>
        <button class="btn btn-ghost" id="pe-center" title="จัดตารางกึ่งกลางหน้าทั้งแนวนอนและแนวตั้ง ล้างตำแหน่งที่ลากไว้">จัดกึ่งกลาง</button>
        <button class="btn btn-ghost" id="pe-reset" title="ล้างทุกค่าที่ปรับ กลับเป็นตามแบบพิมพ์เดิม">ล้างทั้งหมด</button></div>
      <div class="pe-read" id="pe-read"></div>
      <div class="pe-stage" id="pe-stage"><div class="pe-grid"><div class="pe-ruler" style="grid-area:1/1"></div><div class="pe-ruler" id="pe-rt" style="grid-area:1/2"></div>
        <div class="pe-ruler" id="pe-rl" style="grid-area:2/1"></div><div class="pe-paper" id="pe-paper" style="grid-area:2/2"><div class="pe-pg" id="pe-pg"></div><div class="pe-ov" id="pe-ov"><div id="pe-hd"></div></div></div></div></div>
      <div class="pe-tip" id="pe-tip"></div>
      <div class="pe-foot"><span>${canApplyOthers ? '<label class="small"><input type="checkbox" id="pe-others"> ใช้ขอบ/ขนาด/ตำแหน่งนี้กับแผ่นอื่นที่เลือกด้วย (เลือกแผ่นในขั้นต่อไป)</label>' : ''}</span>
        <span class="row" style="gap:8px"><button type="button" class="btn btn-ghost" id="pe-cancel">ยกเลิก</button><button type="button" class="btn btn-primary" id="pe-ok">ใช้ค่านี้</button></span></div></div>`;
    document.body.appendChild(wrap);
    const $ = (s) => wrap.querySelector(s);
    const stage = $('#pe-stage'); const paperEl = $('#pe-paper'); const pgEl = $('#pe-pg'); const ov = $('#pe-ov'); const hd = $('#pe-hd');

    const TIPS = {
      margin: 'ลากเส้นประสีน้ำเงินที่ขอบกระดาษ (บน/ล่าง/ซ้าย/ขวา) พื้นที่แรเงา = ขอบที่ไม่พิมพ์',
      col: 'ลากเส้นแบ่งคอลัมน์สีแดงไปซ้าย/ขวาเพื่อปรับความกว้างของคอลัมน์นั้น (ซูมเข้าให้จับง่ายขึ้น)',
      row: 'ลากเส้นแบ่งแถวสีแดงขึ้น/ลงเพื่อปรับความสูงของแถวนั้น',
      move: 'ลากตารางเพื่อย้ายตำแหน่ง · ลากจุดน้ำเงินมุมขวาล่างเพื่อย่อ/ขยายทั้งหน้า · ลูกศรบนแป้นพิมพ์ขยับทีละ 0.5 มม.',
    };

    const snapshot = () => { undo.push(JSON.stringify(cur)); if (undo.length > 80) undo.shift(); redo.length = 0; };
    const kOf = () => {
      const pg = pages[pi]; if (!pg) return { k: 1, z: 1 };
      const fit = Math.min((stage.clientWidth - 70) / (pg.w * 4 / 3), (stage.clientHeight - 40) / (pg.h * 4 / 3));
      const z = Math.max(0.15, fit) * zoomK; return { z, k: z * 4 / 3 };
    };
    const read = (extra = '') => {
      const pg = pages[pi]; if (!pg) { $('#pe-read').textContent = 'ไม่มีหน้าให้แสดง'; return; }
      const m = pg.info.margins;
      $('#pe-read').textContent = `ขอบ (มม.) บน ${r1(m.top * MM)} · ล่าง ${r1(m.bottom * MM)} · ซ้าย ${r1(m.left * MM)} · ขวา ${r1(m.right * MM)} | ย่อ/ขยาย ${Math.round(pg.info.scale * 100)}%${extra ? ` | ${extra}` : ''}${adjText(cur) ? ` | ปรับไว้: ${adjText(cur)}` : ''}`;
    };

    const draw = () => {
      const pg = pages[pi]; const { z, k } = kOf();
      $('#pe-pn').textContent = `${pages.length ? pi + 1 : 0}/${pages.length}`;
      $('#pe-undo').disabled = !undo.length; $('#pe-redo').disabled = !redo.length;
      $('#pe-tip').textContent = TIPS[mode];
      wrap.querySelectorAll('#pe-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
      if (!pg) { pgEl.innerHTML = ''; hd.innerHTML = ''; read(); return; }
      const W = pg.w * k; const H = pg.h * k;
      paperEl.style.width = `${W}px`; paperEl.style.height = `${H}px`;
      pgEl.innerHTML = `<span class="pv-inner" style="transform:scale(${z})">${pg.html}</span>`;
      $('#pe-rt').style.width = `${W}px`; $('#pe-rt').innerHTML = rulerSvg(pg.w, k, true);
      $('#pe-rl').style.height = `${H}px`; $('#pe-rl').innerHTML = rulerSvg(pg.h, k, false);
      const f = pg.info; const s = f.scale; const px = (v) => `${v * k}px`;
      const cx0 = f.ox; const cy0 = f.oy; const cw = f.contentW * s; const chh = f.contentH * s;
      let h = '';
      if (mode === 'margin') {
        const m = f.margins; const L = m.left; const T = m.top; const R = pg.w - m.right; const B = pg.h - m.bottom;
        h += `<div class="pe-shade" style="left:0;top:0;width:${px(pg.w)};height:${px(T)}"></div><div class="pe-shade" style="left:0;top:${px(B)};width:${px(pg.w)};height:${px(pg.h - B)}"></div>
          <div class="pe-shade" style="left:0;top:${px(T)};width:${px(L)};height:${px(B - T)}"></div><div class="pe-shade" style="left:${px(R)};top:${px(T)};width:${px(pg.w - R)};height:${px(B - T)}"></div>
          <div class="pe-m h" data-h="mt" style="left:0;width:${px(pg.w)};top:${px(T)}"></div><div class="pe-m h" data-h="mb" style="left:0;width:${px(pg.w)};top:${px(B)}"></div>
          <div class="pe-m v" data-h="ml" style="top:0;height:${px(pg.h)};left:${px(L)}"></div><div class="pe-m v" data-h="mr" style="top:0;height:${px(pg.h)};left:${px(R)}"></div>`;
      } else if (mode === 'col') {
        for (const c of f.cols) h += `<div class="pe-h v${hot === `c${c.c}` ? ' act' : ''}" data-h="col" data-k="${c.c}" title="คอลัมน์ ${colName(c.c)} · ${r1(c.w * MM)} มม." style="left:${px(cx0 + (c.x + c.w) * s)};top:${px(cy0)};height:${px(chh)}"></div>`;
      } else if (mode === 'row') {
        for (const r of f.rows) h += `<div class="pe-h h${hot === `r${r.r}` ? ' act' : ''}" data-h="row" data-k="${r.r}" title="แถว ${r.r} · ${r1(r.h * MM)} มม." style="top:${px(cy0 + (r.y + r.h) * s)};left:${px(cx0)};width:${px(cw)}"></div>`;
      } else {
        h += `<div class="pe-move" data-h="move" style="left:${px(cx0)};top:${px(cy0)};width:${px(cw)};height:${px(chh)}"></div><div class="pe-corner" data-h="size" style="left:${px(cx0 + cw)};top:${px(cy0 + chh)}"></div>`;
      }
      hd.innerHTML = h; read();
    };
    const redraw = () => { doRender(); draw(); };
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };

    // ---- ลาก ----
    ov.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-h]'); if (!t || !pages[pi]) return;
      e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch { /* */ } snapshot();
      drag = { type: t.dataset.h, key: t.dataset.k ? Number(t.dataset.k) : null, x0: e.clientX, y0: e.clientY, base: JSON.parse(JSON.stringify(cur)), info: pages[pi].info, k: kOf().k };
      if (drag.type === 'col') hot = `c${drag.key}`; if (drag.type === 'row') hot = `r${drag.key}`;
    });
    ov.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x0) / drag.k; const dy = (e.clientY - drag.y0) / drag.k; const f = drag.info; const s = f.scale; const b = drag.base;
      const next = { ...b };
      switch (drag.type) {
        case 'mt': next.mt = clamp(r1((f.margins.top + dy) * MM), 0, 80); break;
        case 'mb': next.mb = clamp(r1((f.margins.bottom - dy) * MM), 0, 80); break;
        case 'ml': next.ml = clamp(r1((f.margins.left + dx) * MM), 0, 80); break;
        case 'mr': next.mr = clamp(r1((f.margins.right - dx) * MM), 0, 80); break;
        case 'col': { const c = f.cols.find((x) => x.c === drag.key); if (c) next.cw = { ...(b.cw || {}), [drag.key]: Math.max(2, r1(c.w + dx / s)) }; break; }
        case 'row': { const r = f.rows.find((x) => x.r === drag.key); if (r) next.rh = { ...(b.rh || {}), [drag.key]: Math.max(2, r1(r.h + dy / s)) }; break; }
        case 'move': next.ox = r1((b.ox || 0) + dx * MM); next.oy = r1((b.oy || 0) + dy * MM); break;
        case 'size': { const w0 = f.contentW * s; next.scale = clamp(Math.round(s * 100 * Math.max(0.1, (w0 + dx) / w0)), 10, 400); break; }
        default: break;
      }
      cur = next; schedule();
    });
    const endDrag = () => { if (!drag) return; drag = null; hot = null; schedule(); };
    ov.addEventListener('pointerup', endDrag); ov.addEventListener('pointercancel', endDrag);

    // ---- ปุ่ม ----
    const close = (v) => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', schedule); cancelAnimationFrame(raf); wrap.remove(); resolve(v); };
    const cleaned = () => {
      const o = JSON.parse(JSON.stringify(cur));
      for (const k of ['cw', 'rh']) if (o[k] && !Object.keys(o[k]).length) delete o[k];
      for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || (typeof o[k] === 'number' && !Number.isFinite(o[k]))) delete o[k];
      return Object.keys(o).length ? o : null;
    };
    const stepUndo = (from, to) => { if (!from.length) return; to.push(JSON.stringify(cur)); cur = JSON.parse(from.pop()); redraw(); };
    $('#pe-mode').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) { mode = b.dataset.m; draw(); } });
    $('#pe-prev').addEventListener('click', () => { if (pi > 0) { pi--; draw(); } });
    $('#pe-next').addEventListener('click', () => { if (pi < pages.length - 1) { pi++; draw(); } });
    $('#pe-zoom').addEventListener('input', (e) => { zoomK = Number(e.target.value) / 100; draw(); });
    $('#pe-undo').addEventListener('click', () => stepUndo(undo, redo)); $('#pe-redo').addEventListener('click', () => stepUndo(redo, undo));
    $('#pe-center').addEventListener('click', () => { snapshot(); cur = { ...cur, hCenter: true, vCenter: true }; delete cur.ox; delete cur.oy; redraw(); });
    $('#pe-reset').addEventListener('click', () => { snapshot(); cur = {}; redraw(); });
    $('#pe-cancel').addEventListener('click', () => close(null));
    $('#pe-ok').addEventListener('click', () => close({ adj: cleaned(), others: !!$('#pe-others')?.checked }));
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(null); });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) stepUndo(redo, undo); else stepUndo(undo, redo); return; }
      if (mode === 'move' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); snapshot(); const d = e.shiftKey ? 2 : 0.5;
        cur = { ...cur, ox: r1((cur.ox || 0) + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0)), oy: r1((cur.oy || 0) + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)) };
        schedule();
      }
    };
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', schedule);
    redraw();
  });
}
