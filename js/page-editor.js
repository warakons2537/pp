// =====================================================================
//  จัดหน้าแบบ Office บนหน้ากระดาษจริง — ใช้ร่วมกันในแท็บ "ปพ.5 ครบชุด" และ "เล่ม ปพ."
//  - พรีวิวทุกหน้าเลื่อนลงต่อเนื่อง · คลิกหน้าเพื่อเลือกหน้าที่จะแก้ · ริบบอนแบ่ง 3 แท็บ: หน้ากระดาษ / จัดตาราง-ข้อความ / ลากปรับ
//  - หน้ากระดาษ: แนวตั้ง-นอน ขอบ (พรีเซ็ต) กึ่งกลาง ย่อ/ขยาย ขนาดตัวอักษร · จัดตาราง: เลือกช่วงเซลล์แล้วจัดแนวข้อความ ตัวหนา/เอียง/ขีดเส้นใต้ ขนาด สี พื้น หมุน ตัดบรรทัด
//  - ลากปรับ: ลากเส้นขอบกระดาษ/คอลัมน์/แถว ย้ายตำแหน่ง ลากมุมย่อขยาย · ย้อนกลับ/ทำซ้ำ · เห็นผลทันที
//  ตัวแสดงผลส่งข้อมูลตำแหน่งของหน้า (info) มาให้: ขอบ · จุดวางเนื้อหา · คอลัมน์/แถวที่เห็นในหน้านั้น (หน่วย pt บนกระดาษ)
// =====================================================================
import { esc } from './util.js?v=2569.11.1-39';
import { adjText } from './page-adjust.js?v=2569.11.1-39';

const MM = 25.4 / 72;                       // pt → มม.
const PT = 72 / 25.4;                       // มม. → pt
const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const colName = (n) => { let s = ''; for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };

const CSS = `
.pe-wrap{position:fixed;inset:0;background:rgba(15,23,32,.6);z-index:1200;display:flex;align-items:center;justify-content:center}
.pe{width:min(1240px,98vw);height:min(95vh,1000px);background:var(--surface,#fff);color:var(--ink,#1c2833);border-radius:12px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.pe-top{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:8px 12px 0;background:var(--surface-2,#f4f6f8)}
.pe-top h3{margin:0;font-size:1rem}
.pe-tabs{display:flex;gap:2px;margin-left:8px}
.pe-tabs button{border:0;border-bottom:3px solid transparent;background:transparent;padding:6px 14px;cursor:pointer;font:inherit;font-size:.9rem;color:var(--ink-soft,#5b6770)}
.pe-tabs button.on{border-bottom-color:var(--green,#0f5132);color:var(--ink,#1c2833);font-weight:600}
.pe-sp{flex:1}
.pe-rib{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:stretch;padding:8px 12px;border-bottom:1px solid var(--rule-strong,#cfd6dd);background:var(--surface-2,#f4f6f8);min-height:58px}
.pe-g{display:flex;flex-direction:column;gap:3px;padding-right:14px;border-right:1px solid var(--rule,#dde3e8)}
.pe-g:last-child{border-right:0}
.pe-g>.pe-gl{font-size:.7rem;color:var(--ink-soft,#5b6770);order:2;text-align:center}
.pe-gr{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.pe-seg{display:inline-flex;border:1px solid var(--rule-strong,#cfd6dd);border-radius:8px;overflow:hidden}
.pe-seg button,.pe-b{border:0;background:var(--surface,#fff);padding:4px 9px;cursor:pointer;font:inherit;font-size:.85rem;color:inherit;min-width:30px}
.pe-b{border:1px solid var(--rule-strong,#cfd6dd);border-radius:6px}
.pe-seg button+button{border-left:1px solid var(--rule-strong,#cfd6dd)}
.pe-seg button.on,.pe-b.on{background:var(--green,#0f5132);color:#fff}
.pe-b:disabled,.pe-seg button:disabled{opacity:.45;cursor:not-allowed}
.pe-n{width:58px;padding:3px 4px;border:1px solid var(--rule-strong,#cfd6dd);border-radius:6px;font:inherit;font-size:.85rem;background:var(--surface,#fff);color:inherit}
.pe-col{width:34px;height:28px;padding:0;border:1px solid var(--rule-strong,#cfd6dd);border-radius:6px;background:none;cursor:pointer}
.pe-lab{font-size:.8rem;display:flex;gap:4px;align-items:center}
.pe-read{font-size:.8rem;color:var(--ink-soft,#5b6770);padding:4px 12px;border-bottom:1px solid var(--rule,#e3e8ec);min-height:1.6em}
.pe-stage{flex:1;overflow:auto;background:#6b7580;padding:14px 14px 40px}
.pe-list{display:flex;flex-direction:column;align-items:center;gap:18px;min-width:min-content}
.pe-card{position:relative}
.pe-cap{position:absolute;left:22px;top:-15px;font-size:11px;color:#e9edf1;white-space:nowrap}
.pe-grid{display:grid;grid-template-columns:22px auto;grid-template-rows:22px auto;gap:0}
.pe-ruler{background:#e9edf1;position:relative;overflow:hidden;font-size:9px;color:#444;user-select:none}
.pe-paper{position:relative;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.4)}
.pe-card:not(.act) .pe-paper{opacity:.92;cursor:pointer}
.pe-card.act .pe-paper{outline:3px solid #2563eb}
.pe-paper .pe-pg{position:absolute;inset:0;pointer-events:none}
.pe-paper .pe-pg .pv-inner{position:absolute;left:0;top:0;transform-origin:0 0;display:block}
.pe-ov{position:absolute;inset:0;touch-action:none}
.pe-ov.cell{cursor:cell}
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
.pe-sel{position:absolute;pointer-events:none;background:rgba(37,99,235,.16);outline:2px solid #2563eb}
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

const MARGIN_PRESETS = [['แคบ 5', 5], ['ปานกลาง 10', 10], ['ปกติ 20', 20], ['กว้าง 25.4', 25.4]];
const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
const ico = (t) => t;

/**
 * @param title   ชื่อแผ่น
 * @param render  (adj, orient) => [{ w, h, html, info }]  วาดทุกหน้าของแผ่นด้วยค่าปรับ adj (ขอบเป็นมม.) และแนวกระดาษ orient ('portrait'|'landscape'|null = ตามแบบ)
 * @param adj     ค่าปรับที่เก็บไว้ก่อนหน้า (หรือ undefined)
 * @param orient  แนวกระดาษที่ตั้งไว้ก่อนหน้า (หรือ null)
 * @param canApplyOthers  แสดงช่อง "ใช้กับแผ่นอื่นที่เลือกด้วย"
 * @returns null (ยกเลิก) | { adj: object|null (null = ล้างค่า), orient: string|null, others: boolean }
 */
export function openPageEditor({ title, render, adj, orient: orient0 = null, canApplyOthers = false }) {
  return new Promise((resolve) => {
    if (!cssDone) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); cssDone = true; }
    let cur = JSON.parse(JSON.stringify(adj || {}));
    let orient = orient0 || null;
    const undo = []; const redo = [];
    let pages = []; let pi = 0; let tab = 'page'; let mode = 'margin'; let zoomK = 1; let drag = null; let raf = 0; let hot = null;
    let sel = null;                       // { pi, r1, c1, r2, c2 } ช่วงเซลล์ที่เลือก (ในแผ่นเดียวกัน)
    let sig = ''; let z0 = 1;
    const doRender = () => { try { pages = render(cur, orient) || []; } catch (err) { console.error(err); pages = pages.length ? pages : []; } if (pi >= pages.length) pi = Math.max(0, pages.length - 1); };

    const wrap = document.createElement('div'); wrap.className = 'pe-wrap';
    wrap.innerHTML = `<div class="pe" role="dialog" aria-modal="true" aria-label="จัดหน้า">
      <div class="pe-top"><h3>จัดหน้า — ${esc(title)}</h3>
        <span class="pe-tabs" id="pe-tabs"><button data-t="page" class="on">หน้ากระดาษ</button><button data-t="cell">จัดตาราง / ข้อความ</button><button data-t="drag">ลากปรับ</button></span>
        <span class="pe-sp"></span>
        <span class="pe-gr"><button class="pe-b" id="pe-undo" title="ย้อนกลับ (Ctrl+Z)">↶</button><button class="pe-b" id="pe-redo" title="ทำซ้ำ (Ctrl+Shift+Z)">↷</button>
          <span class="pe-seg"><button id="pe-prev" title="หน้าก่อนหน้า">‹</button><button id="pe-pn" disabled style="cursor:default">1/1</button><button id="pe-next" title="หน้าถัดไป">›</button></span>
          <label class="pe-lab">ซูม <input type="range" id="pe-zoom" min="40" max="300" value="100" style="width:100px"></label></span></div>
      <div class="pe-rib" id="pe-rib"></div>
      <div class="pe-read" id="pe-read"></div>
      <div class="pe-stage" id="pe-stage"><div class="pe-list" id="pe-list"></div></div>
      <div class="pe-tip" id="pe-tip"></div>
      <div class="pe-foot"><span>${canApplyOthers ? '<label class="small"><input type="checkbox" id="pe-others"> ใช้ขอบ/แนวกระดาษ/ขนาด/ตำแหน่งนี้กับแผ่นอื่นที่เลือกด้วย (เลือกแผ่นในขั้นต่อไป · การจัดรูปแบบเซลล์ใช้เฉพาะแผ่นนี้)</label>' : ''}</span>
        <span class="row" style="gap:8px"><button type="button" class="btn btn-ghost" id="pe-reset" title="ล้างทุกค่าที่ปรับ กลับเป็นตามแบบพิมพ์เดิม">ล้างทั้งหมด</button><button type="button" class="btn btn-ghost" id="pe-cancel">ยกเลิก</button><button type="button" class="btn btn-primary" id="pe-ok">ใช้ค่านี้</button></span></div></div>`;
    document.body.appendChild(wrap);
    const $ = (q) => wrap.querySelector(q);
    const stage = $('#pe-stage'); const list = $('#pe-list'); const rib = $('#pe-rib');
    const ov = document.createElement('div'); ov.className = 'pe-ov'; const hd = document.createElement('div'); ov.appendChild(hd);

    const TIPS = {
      page: 'เลื่อนลงดูทุกหน้า · คลิกหน้าที่ต้องการเพื่อเลือกเป็นหน้าที่กำลังแก้ (กรอบน้ำเงิน) · ค่าในแท็บนี้ใช้กับทั้งแผ่น',
      cell: 'คลิกหรือลากบนหน้าเพื่อเลือกช่วงเซลล์ (Shift+คลิก = ขยายช่วง) แล้วกดปุ่มจัดรูปแบบ · ตั้งค่าได้เฉพาะเซลล์ที่เลือก ไม่กระทบเซลล์อื่น',
      margin: 'ลากเส้นประสีน้ำเงินที่ขอบกระดาษ (บน/ล่าง/ซ้าย/ขวา) พื้นที่แรเงา = ขอบที่ไม่พิมพ์',
      col: 'ลากเส้นแบ่งคอลัมน์สีแดงไปซ้าย/ขวาเพื่อปรับความกว้างของคอลัมน์นั้น (ซูมเข้าให้จับง่ายขึ้น)',
      row: 'ลากเส้นแบ่งแถวสีแดงขึ้น/ลงเพื่อปรับความสูงของแถวนั้น',
      move: 'ลากตารางเพื่อย้ายตำแหน่ง · ลากจุดน้ำเงินมุมขวาล่างเพื่อย่อ/ขยายทั้งหน้า · ลูกศรบนแป้นพิมพ์ขยับทีละ 0.5 มม.',
    };

    const snapshot = () => { undo.push(JSON.stringify({ cur, orient })); if (undo.length > 80) undo.shift(); redo.length = 0; };
    const kOf = () => ({ z: z0 * zoomK, k: z0 * zoomK * 4 / 3 });
    const fmtRules = () => (Array.isArray(cur.fmt) ? cur.fmt : []);
    // ค่าที่ตั้งไว้ของเซลล์ (ตามกฎที่ผู้ใช้ตั้ง กฎหลังทับกฎก่อน)
    const effFmt = (r, c) => { let o = {}; for (const f of fmtRules()) if (r >= f.r1 && r <= f.r2 && c >= f.c1 && c <= f.c2) o = { ...o, ...f }; return o; };

    const read = (extra = '') => {
      const pg = pages[pi]; if (!pg) { $('#pe-read').textContent = 'ไม่มีหน้าให้แสดง'; return; }
      const m = pg.info.margins;
      $('#pe-read').textContent = `หน้า ${pi + 1}/${pages.length} · ${pg.w > pg.h ? 'แนวนอน' : 'แนวตั้ง'} · ขอบ (มม.) บน ${r1(m.top * MM)} ล่าง ${r1(m.bottom * MM)} ซ้าย ${r1(m.left * MM)} ขวา ${r1(m.right * MM)} · ย่อ/ขยาย ${Math.round(pg.info.scale * 100)}%${extra ? ` · ${extra}` : ''}${adjText(cur) ? ` | ปรับไว้: ${adjText(cur)}` : ''}`;
    };

    // ---- ริบบอน ----
    const seg = (id, items, on) => `<span class="pe-seg" id="${id}">${items.map(([v, l, t]) => `<button data-v="${v}" class="${on === v ? 'on' : ''}" title="${esc(t || l)}">${l}</button>`).join('')}</span>`;
    const grp = (label, inner) => `<div class="pe-g"><div class="pe-gr">${inner}</div><div class="pe-gl">${label}</div></div>`;
    const ribbon = () => {
      const pg = pages[pi]; const m = pg?.info.margins;
      const mv = (k, key) => (Number.isFinite(cur[key]) ? cur[key] : m ? r1(m[k] * MM) : '');
      if (tab === 'page') {
        rib.innerHTML = grp('แนวกระดาษ', seg('r-ori', [['', 'ตามแบบ', 'ตามแบบพิมพ์โรงเรียน'], ['portrait', '▯ แนวตั้ง'], ['landscape', '▭ แนวนอน']], orient || ''))
          + grp('ขอบกระดาษ (มม.)', `<label class="pe-lab">บน<input class="pe-n" data-mg="mt" type="number" min="0" max="80" step="0.5" value="${mv('top', 'mt')}"></label><label class="pe-lab">ล่าง<input class="pe-n" data-mg="mb" type="number" min="0" max="80" step="0.5" value="${mv('bottom', 'mb')}"></label><label class="pe-lab">ซ้าย<input class="pe-n" data-mg="ml" type="number" min="0" max="80" step="0.5" value="${mv('left', 'ml')}"></label><label class="pe-lab">ขวา<input class="pe-n" data-mg="mr" type="number" min="0" max="80" step="0.5" value="${mv('right', 'mr')}"></label>
            <span class="pe-seg" id="r-pre">${MARGIN_PRESETS.map(([l, v]) => `<button data-v="${v}">${l}</button>`).join('')}</span>`)
          + grp('จัดกึ่งกลางหน้า', `<label class="pe-lab"><input type="checkbox" id="r-hc" ${cur.hCenter ? 'checked' : ''}>แนวนอน</label><label class="pe-lab"><input type="checkbox" id="r-vc" ${cur.vCenter ? 'checked' : ''}>แนวตั้ง</label><button class="pe-b" id="r-ctr" title="จัดกึ่งกลางทั้งสองแนว และล้างตำแหน่งที่ลากย้ายไว้">ทั้งสองแนว</button>`)
          + grp('ขนาด', `<label class="pe-lab">ย่อ/ขยาย<input class="pe-n" id="r-sc" type="number" min="10" max="400" step="1" value="${cur.scale || (pg ? Math.round(pg.info.scale * 100) : '')}">%</label><label class="pe-lab">ตัวอักษร<input class="pe-n" id="r-ft" type="number" min="30" max="300" step="5" value="${cur.font || 100}">%</label><label class="pe-lab" title="ทุกหน้าของแผ่นขนาดเท่ากัน กึ่งกลาง ขอบเท่ากัน"><input type="checkbox" id="r-af" ${cur.autoFit ? 'checked' : ''}>อัตโนมัติ</label>`);
      } else if (tab === 'cell') {
        const e = sel ? effFmt(sel.r1, sel.c1) : {};
        const has = !!sel;
        const b = (id, label, t, on) => `<button class="pe-b ${on ? 'on' : ''}" id="${id}" title="${esc(t)}" ${has ? '' : 'disabled'}>${label}</button>`;
        const sg = (id, items, on) => `<span class="pe-seg" id="${id}">${items.map(([v, l, t]) => `<button data-v="${v}" class="${on === v ? 'on' : ''}" title="${esc(t)}" ${has ? '' : 'disabled'}>${l}</button>`).join('')}</span>`;
        rib.innerHTML = grp('เลือกช่วง', `<button class="pe-b" id="c-row" title="เลือกทุกคอลัมน์ในแถวที่เลือก">ทั้งแถว</button><button class="pe-b" id="c-col" title="เลือกทุกแถวในคอลัมน์ที่เลือก">ทั้งคอลัมน์</button><button class="pe-b" id="c-all" title="เลือกทุกเซลล์ของหน้านี้">ทั้งหน้า</button>`)
          + grp('จัดแนวข้อความ (ซ้าย-ขวา)', sg('c-h', [['left', '⇤', 'ชิดซ้าย'], ['center', '↔', 'กึ่งกลาง'], ['right', '⇥', 'ชิดขวา'], ['justify', '☰', 'กระจายเต็มความกว้าง']], e.h))
          + grp('จัดแนวข้อความ (บน-ล่าง)', sg('c-v', [['top', '⤒', 'ชิดบน'], ['center', '↕', 'กึ่งกลาง'], ['bottom', '⤓', 'ชิดล่าง']], e.v))
          + grp('ตัวอักษร', `<select class="pe-n" id="c-sz" ${has ? '' : 'disabled'} style="width:68px"><option value="">ขนาด</option>${SIZES.map((x) => `<option value="${x}" ${e.sz === x ? 'selected' : ''}>${x}</option>`).join('')}</select>${b('c-szm', 'A−', 'ลดขนาด 1 pt')}${b('c-szp', 'A+', 'เพิ่มขนาด 1 pt')}${b('c-b', '<b>B</b>', 'ตัวหนา (Ctrl+B)', e.b)}${b('c-i', '<i>I</i>', 'ตัวเอียง (Ctrl+I)', e.i)}${b('c-u', '<u>U</u>', 'ขีดเส้นใต้ (Ctrl+U)', e.u)}
            <label class="pe-lab" title="สีตัวอักษร">A<input class="pe-col" type="color" id="c-fc" value="#${e.color || '000000'}" ${has ? '' : 'disabled'}></label><label class="pe-lab" title="สีพื้นเซลล์">▧<input class="pe-col" type="color" id="c-bg" value="#${e.fill || 'ffffff'}" ${has ? '' : 'disabled'}></label>`)
          + grp('ข้อความในช่อง', `${b('c-wr', 'ตัดบรรทัด', 'ข้อความยาวขึ้นบรรทัดใหม่ในช่อง', e.wrap)}${b('c-sh', 'ย่อให้พอดี', 'ย่อข้อความให้พอดีความกว้างช่อง', e.shrink)}${sg('c-rot', [['0', 'ปกติ', 'ข้อความแนวนอน'], ['90', '↺ 90°', 'หมุนข้อความ 90° (หัวตารางแคบ)'], ['255', 'เรียงตั้ง', 'เรียงตัวอักษรในแนวตั้ง']], e.rot !== undefined ? String(e.rot) : '')}`)
          + grp('ล้าง', `${b('c-clr', 'ล้างรูปแบบช่วงนี้', 'ลบการจัดรูปแบบที่ตั้งไว้ในช่วงที่เลือก (กลับเป็นตามแบบพิมพ์เดิม)')}<button class="pe-b" id="c-clrall" title="ลบการจัดรูปแบบเซลล์ที่ตั้งไว้ทั้งแผ่น" ${fmtRules().length ? '' : 'disabled'}>ล้างทั้งแผ่น</button>`);
      } else {
        rib.innerHTML = grp('ลากบนหน้ากระดาษ', seg('r-mode', [['margin', 'ขอบกระดาษ', 'ลากเส้นประสีน้ำเงินเพื่อปรับขอบ'], ['col', 'คอลัมน์', 'ลากเส้นแบ่งคอลัมน์'], ['row', 'แถว', 'ลากเส้นแบ่งแถว'], ['move', 'ย้าย / ขนาด', 'ลากย้ายตาราง · ลากมุมย่อขยาย']], mode))
          + grp('จัดให้', '<button class="pe-b" id="r-ctr2" title="จัดตารางกึ่งกลางหน้าทั้งแนวนอนและแนวตั้ง ล้างตำแหน่งที่ลากไว้">กึ่งกลางหน้า</button>');
      }
    };

    // ---- วาด ----
    const buildCards = () => {
      list.innerHTML = '';
      pages.forEach((pg, i) => {
        const c = document.createElement('div'); c.className = 'pe-card'; c.dataset.i = String(i);
        c.innerHTML = `<div class="pe-cap">หน้า ${i + 1}</div><div class="pe-grid"><div class="pe-ruler" style="grid-area:1/1"></div><div class="pe-ruler pe-rt" style="grid-area:1/2"></div><div class="pe-ruler pe-rl" style="grid-area:2/1"></div><div class="pe-paper" style="grid-area:2/2"><div class="pe-pg"></div></div></div>`;
        list.appendChild(c);
      });
    };
    const selRect = (pg) => {
      if (!sel || sel.pi !== pi) return '';
      const f = pg.info; const s = f.scale; const k = kOf().k;
      const cs = f.cols.filter((x) => x.c >= sel.c1 && x.c <= sel.c2); const rs = f.rows.filter((x) => x.r >= sel.r1 && x.r <= sel.r2);
      if (!cs.length || !rs.length) return '';
      const x = f.ox + cs[0].x * s; const w = (cs[cs.length - 1].x + cs[cs.length - 1].w - cs[0].x) * s;
      const y = f.oy + rs[0].y * s; const h = (rs[rs.length - 1].y + rs[rs.length - 1].h - rs[0].y) * s;
      return `<div class="pe-sel" style="left:${x * k}px;top:${y * k}px;width:${w * k}px;height:${h * k}px"></div>`;
    };
    const drawOverlay = () => {
      const pg = pages[pi]; if (!pg) { hd.innerHTML = ''; return; }
      const { k } = kOf(); const f = pg.info; const s = f.scale; const px = (v) => `${v * k}px`;
      const cx0 = f.ox; const cy0 = f.oy; const cw = f.contentW * s; const chh = f.contentH * s;
      ov.classList.toggle('cell', tab === 'cell');
      let h = '';
      if (tab === 'cell') h = selRect(pg);
      else if (tab === 'page' || (tab === 'drag' && mode === 'margin')) {
        if (tab === 'drag') {
          const m = f.margins; const L = m.left; const T = m.top; const R = pg.w - m.right; const B = pg.h - m.bottom;
          h += `<div class="pe-shade" style="left:0;top:0;width:${px(pg.w)};height:${px(T)}"></div><div class="pe-shade" style="left:0;top:${px(B)};width:${px(pg.w)};height:${px(pg.h - B)}"></div>
          <div class="pe-shade" style="left:0;top:${px(T)};width:${px(L)};height:${px(B - T)}"></div><div class="pe-shade" style="left:${px(R)};top:${px(T)};width:${px(pg.w - R)};height:${px(B - T)}"></div>
          <div class="pe-m h" data-h="mt" style="left:0;width:${px(pg.w)};top:${px(T)}"></div><div class="pe-m h" data-h="mb" style="left:0;width:${px(pg.w)};top:${px(B)}"></div>
          <div class="pe-m v" data-h="ml" style="top:0;height:${px(pg.h)};left:${px(L)}"></div><div class="pe-m v" data-h="mr" style="top:0;height:${px(pg.h)};left:${px(R)}"></div>`;
        }
      } else if (mode === 'col') {
        for (const c of f.cols) h += `<div class="pe-h v${hot === `c${c.c}` ? ' act' : ''}" data-h="col" data-k="${c.c}" title="คอลัมน์ ${colName(c.c)} · ${r1(c.w * MM)} มม." style="left:${px(cx0 + (c.x + c.w) * s)};top:${px(cy0)};height:${px(chh)}"></div>`;
      } else if (mode === 'row') {
        for (const r of f.rows) h += `<div class="pe-h h${hot === `r${r.r}` ? ' act' : ''}" data-h="row" data-k="${r.r}" title="แถว ${r.r} · ${r1(r.h * MM)} มม." style="top:${px(cy0 + (r.y + r.h) * s)};left:${px(cx0)};width:${px(cw)}"></div>`;
      } else {
        h += `<div class="pe-move" data-h="move" style="left:${px(cx0)};top:${px(cy0)};width:${px(cw)};height:${px(chh)}"></div><div class="pe-corner" data-h="size" style="left:${px(cx0 + cw)};top:${px(cy0 + chh)}"></div>`;
      }
      hd.innerHTML = h;
    };
    const draw = (full = true) => {
      $('#pe-undo').disabled = !undo.length; $('#pe-redo').disabled = !redo.length;
      $('#pe-pn').textContent = `${pages.length ? pi + 1 : 0}/${pages.length}`;
      $('#pe-tip').textContent = TIPS[tab === 'drag' ? mode : tab];
      wrap.querySelectorAll('#pe-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      if (!pages.length) { list.innerHTML = ''; read(); return; }
      const p0 = pages[0]; z0 = Math.max(0.15, Math.min((stage.clientWidth - 70) / (p0.w * 4 / 3), (stage.clientHeight - 60) / (p0.h * 4 / 3)));
      const { z, k } = kOf();
      const ns = `${pages.length}|${pages.map((p) => `${p.w}x${p.h}`).join(',')}`;
      if (ns !== sig) { sig = ns; const st = stage.scrollTop; buildCards(); stage.scrollTop = st; }
      pages.forEach((pg, i) => {
        const card = list.children[i]; if (!card) return;
        const act = i === pi; card.classList.toggle('act', act);
        const W = pg.w * k; const H = pg.h * k; const paper = card.querySelector('.pe-paper');
        paper.style.width = `${W}px`; paper.style.height = `${H}px`;
        card.querySelector('.pe-pg').innerHTML = `<span class="pv-inner" style="transform:scale(${z})">${pg.html}</span>`;
        const rt = card.querySelector('.pe-rt'); const rl = card.querySelector('.pe-rl');
        rt.style.width = `${W}px`; rl.style.height = `${H}px`;
        if (act) { if (full || !rt.firstChild) { rt.innerHTML = rulerSvg(pg.w, k, true); rl.innerHTML = rulerSvg(pg.h, k, false); } paper.appendChild(ov); } else { rt.innerHTML = ''; rl.innerHTML = ''; }
      });
      drawOverlay(); read();
    };
    const redraw = (full = true) => { doRender(); draw(full); };
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; redraw(false); ribbonMaybe(); }); };
    const ribbonMaybe = () => { if (tab === 'page' && !drag) ribbon(); };
    const setTab = (t) => { tab = t; ribbon(); draw(); };
    const go = (i) => { pi = clamp(i, 0, pages.length - 1); draw(); list.children[pi]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); ribbon(); };

    // ---- เลือกเซลล์ ----
    const cellAt = (e) => {
      const pg = pages[pi]; if (!pg) return null; const f = pg.info; const rect = ov.getBoundingClientRect(); const { k } = kOf();
      const u = ((e.clientX - rect.left) / k - f.ox) / f.scale; const v = ((e.clientY - rect.top) / k - f.oy) / f.scale;
      const c = f.cols.find((x) => u >= x.x && u < x.x + x.w); const r = f.rows.find((x) => v >= x.y && v < x.y + x.h);
      return c && r ? { r: r.r, c: c.c } : null;
    };
    const growMerges = (a) => {       // ขยายช่วงให้ครอบเซลล์ผสานที่ทับกัน
      const ms = pages[pi]?.info.merges || []; let ch = true; const o = { ...a };
      while (ch) { ch = false; for (const m of ms) if (m.r1 <= o.r2 && m.r2 >= o.r1 && m.c1 <= o.c2 && m.c2 >= o.c1 && (m.r1 < o.r1 || m.r2 > o.r2 || m.c1 < o.c1 || m.c2 > o.c2)) { o.r1 = Math.min(o.r1, m.r1); o.r2 = Math.max(o.r2, m.r2); o.c1 = Math.min(o.c1, m.c1); o.c2 = Math.max(o.c2, m.c2); ch = true; } }
      return o;
    };
    let anchor = null;
    const setSel = (a, b) => { sel = { pi, ...growMerges({ r1: Math.min(a.r, b.r), r2: Math.max(a.r, b.r), c1: Math.min(a.c, b.c), c2: Math.max(a.c, b.c) }) }; };
    const applyFmt = (props, label) => {
      if (!sel) return; snapshot();
      const keys = Object.keys(props); const inside = (f) => f.r1 >= sel.r1 && f.r2 <= sel.r2 && f.c1 >= sel.c1 && f.c2 <= sel.c2;
      const rules = fmtRules().map((f) => { if (!inside(f)) return f; const g = { ...f }; for (const k of keys) delete g[k]; return g; }).filter((f) => Object.keys(f).some((k) => !['r1', 'r2', 'c1', 'c2'].includes(k)));
      rules.push({ r1: sel.r1, c1: sel.c1, r2: sel.r2, c2: sel.c2, ...props });
      cur = { ...cur, fmt: rules }; redraw(false); ribbon(); void label;
    };

    // ---- ลาก/คลิกบนหน้า ----
    list.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.pe-card'); if (!card) return;
      const i = Number(card.dataset.i);
      if (i !== pi) { pi = i; if (sel && sel.pi !== pi) sel = null; draw(false); ribbon(); return; }
      if (!e.target.closest('.pe-ov')) return;
      if (tab === 'cell') {
        const c = cellAt(e); if (!c) return; e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch { /* */ }
        if (e.shiftKey && anchor && sel) setSel(anchor, c); else { anchor = c; setSel(c, c); }
        drag = { type: 'sel' }; drawOverlay(); ribbon(); return;
      }
      const t = e.target.closest('[data-h]'); if (!t || !pages[pi]) return;
      e.preventDefault(); try { ov.setPointerCapture(e.pointerId); } catch { /* */ } snapshot();
      drag = { type: t.dataset.h, key: t.dataset.k ? Number(t.dataset.k) : null, x0: e.clientX, y0: e.clientY, base: JSON.parse(JSON.stringify(cur)), info: pages[pi].info, k: kOf().k };
      if (drag.type === 'col') hot = `c${drag.key}`; if (drag.type === 'row') hot = `r${drag.key}`;
    });
    list.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.type === 'sel') { const c = cellAt(e); if (c && anchor) { setSel(anchor, c); drawOverlay(); } return; }
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
    const endDrag = () => { if (!drag) return; const was = drag.type; drag = null; hot = null; if (was !== 'sel') { schedule(); ribbon(); } };
    list.addEventListener('pointerup', endDrag); list.addEventListener('pointercancel', endDrag);

    // ---- ปุ่ม/ช่องในริบบอน ----
    const setCur = (patch, del = []) => { snapshot(); cur = { ...cur, ...patch }; for (const k of del) delete cur[k]; redraw(false); ribbon(); };
    rib.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const id = t.id; const seg0 = t.parentElement?.id; const v = t.dataset.v;
      if (seg0 === 'r-ori') { snapshot(); orient = v || null; redraw(true); ribbon(); return; }
      if (seg0 === 'r-pre') { const mm = Number(v); setCur({ mt: mm, mb: mm, ml: mm, mr: mm }); return; }
      if (seg0 === 'r-mode') { mode = v; draw(false); ribbon(); return; }
      if (id === 'r-ctr' || id === 'r-ctr2') { snapshot(); cur = { ...cur, hCenter: true, vCenter: true }; delete cur.ox; delete cur.oy; redraw(false); ribbon(); return; }
      if (tab !== 'cell') return;
      const e0 = sel ? effFmt(sel.r1, sel.c1) : {};
      if (id === 'c-row' || id === 'c-col' || id === 'c-all') {
        const pg = pages[pi]; if (!pg) return; const f = pg.info; const cs = f.cols.map((x) => x.c); const rs = f.rows.map((x) => x.r);
        const a = sel && sel.pi === pi ? sel : { r1: rs[0], r2: rs[0], c1: cs[0], c2: cs[0] };
        const n = id === 'c-row' ? { r1: a.r1, r2: a.r2, c1: Math.min(...cs), c2: Math.max(...cs) } : id === 'c-col' ? { r1: Math.min(...rs), r2: Math.max(...rs), c1: a.c1, c2: a.c2 } : { r1: Math.min(...rs), r2: Math.max(...rs), c1: Math.min(...cs), c2: Math.max(...cs) };
        sel = { pi, ...growMerges(n) }; anchor = { r: sel.r1, c: sel.c1 }; drawOverlay(); ribbon(); return;
      }
      if (!sel) return;
      if (seg0 === 'c-h') applyFmt({ h: v }); else if (seg0 === 'c-v') applyFmt({ v });
      else if (seg0 === 'c-rot') applyFmt({ rot: Number(v) });
      else if (id === 'c-b') applyFmt({ b: !e0.b }); else if (id === 'c-i') applyFmt({ i: !e0.i }); else if (id === 'c-u') applyFmt({ u: !e0.u });
      else if (id === 'c-wr') applyFmt({ wrap: !e0.wrap }); else if (id === 'c-sh') applyFmt({ shrink: !e0.shrink });
      else if (id === 'c-szm' || id === 'c-szp') applyFmt({ sz: clamp((e0.sz || 11) + (id === 'c-szp' ? 1 : -1), 4, 72) });
      else if (id === 'c-clr') {
        snapshot(); const inside = (f) => f.r1 >= sel.r1 && f.r2 <= sel.r2 && f.c1 >= sel.c1 && f.c2 <= sel.c2;
        cur = { ...cur, fmt: fmtRules().filter((f) => !inside(f)) }; if (!cur.fmt.length) delete cur.fmt; redraw(false); ribbon();
      }
    });
    rib.addEventListener('click', (e) => { if (e.target.id === 'c-clrall') { snapshot(); delete cur.fmt; redraw(false); ribbon(); } });
    rib.addEventListener('change', (e) => {
      const t = e.target; const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
      if (t.dataset.mg) { const n = num(t.value); if (n !== null) setCur({ [t.dataset.mg]: clamp(n, 0, 80) }); return; }
      if (t.id === 'r-hc') { setCur({ hCenter: t.checked }); return; }
      if (t.id === 'r-vc') { setCur({ vCenter: t.checked }); return; }
      if (t.id === 'r-af') { if (t.checked) setCur({ autoFit: true }); else setCur({}, ['autoFit']); return; }
      if (t.id === 'r-sc') { const n = num(t.value); if (n) setCur({ scale: clamp(Math.round(n), 10, 400) }); return; }
      if (t.id === 'r-ft') { const n = num(t.value); if (n && n !== 100) setCur({ font: clamp(Math.round(n), 30, 300) }); else setCur({}, ['font']); return; }
      if (t.id === 'c-sz') { const n = num(t.value); if (n && sel) applyFmt({ sz: n }); return; }
      if (t.id === 'c-fc') { if (sel) applyFmt({ color: t.value.slice(1).toUpperCase() }); return; }
      if (t.id === 'c-bg') { if (sel) applyFmt({ fill: t.value.slice(1).toUpperCase() }); }
    });

    // ---- ปุ่มบนหัว/ท้าย ----
    const close = (v) => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', schedule); cancelAnimationFrame(raf); wrap.remove(); resolve(v); };
    const cleaned = () => {
      const o = JSON.parse(JSON.stringify(cur));
      for (const k of ['cw', 'rh', 'fmt']) if (o[k] && !Object.keys(o[k]).length) delete o[k];
      for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null || (typeof o[k] === 'number' && !Number.isFinite(o[k]))) delete o[k];
      return Object.keys(o).length ? o : null;
    };
    const stepUndo = (from, to) => { if (!from.length) return; to.push(JSON.stringify({ cur, orient })); const st = JSON.parse(from.pop()); cur = st.cur; orient = st.orient; redraw(true); ribbon(); };
    $('#pe-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) setTab(b.dataset.t); });
    $('#pe-prev').addEventListener('click', () => go(pi - 1)); $('#pe-next').addEventListener('click', () => go(pi + 1));
    $('#pe-zoom').addEventListener('input', (e) => { zoomK = Number(e.target.value) / 100; draw(true); });
    $('#pe-undo').addEventListener('click', () => stepUndo(undo, redo)); $('#pe-redo').addEventListener('click', () => stepUndo(redo, undo));
    $('#pe-reset').addEventListener('click', () => { snapshot(); cur = {}; orient = null; sel = null; redraw(true); ribbon(); });
    $('#pe-cancel').addEventListener('click', () => close(null));
    $('#pe-ok').addEventListener('click', () => close({ adj: cleaned(), orient, others: !!$('#pe-others')?.checked }));
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(null); });
    const onKey = (e) => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) stepUndo(redo, undo); else stepUndo(undo, redo); return; }
      if (tab === 'cell' && sel && (e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase()) && !typing) { e.preventDefault(); rib.querySelector(`#c-${e.key.toLowerCase()}`)?.click(); return; }
      if (tab === 'drag' && mode === 'move' && !typing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault(); snapshot(); const d = e.shiftKey ? 2 : 0.5;
        cur = { ...cur, ox: r1((cur.ox || 0) + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0)), oy: r1((cur.oy || 0) + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)) };
        schedule();
      }
    };
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', schedule);
    ribbon(); redraw(true); ribbon();
  });
}
