import { esc, levelName, roomName, fullName, LEVELS } from '../util.js?v=2569.11.1-46';
import { head, signs, termText } from './report-common.js?v=2569.11.1-46';

// ---------- รายชื่อนักเรียน + ช่องว่าง (ใช้ทำกิจกรรม เก็บคะแนน เช็กส่งงาน ฯลฯ) ----------
// ขอบเขต: ห้องเดียว / ทั้งระดับชั้น / ทุกระดับชั้น · ทั้งระดับจะแยกหน้าละห้อง หรือรวมทั้งชั้นเป็นรายการเดียวก็ได้
// ค่าที่เลือกจำไว้ในเครื่องนี้ (localStorage) ไม่ลงฐานข้อมูล
const KEY = 'wl-list-opts';
export const LIST_DEFAULTS = {
  scope: 'room',          // 'room' | 'all' | 'lv:ป.1'
  group: 'room',          // 'room' = หน้าละห้อง · 'level' = รวมทั้งชั้นเป็นรายการเดียว
  title: 'รายชื่อนักเรียน',
  note: '',               // ชื่อกิจกรรม/วิชา (บรรทัดใต้หัวเรื่อง)
  cols: 8,                // จำนวนช่องว่าง
  labels: '',             // หัวช่อง คั่นด้วย , (ว่าง = ไม่มีหัว)
  side: 'left',           // ช่องว่างอยู่ 'left' = ซ้ายของรายชื่อ · 'right' = ขวาของรายชื่อ
  total: false,           // ช่อง "รวม" ท้ายสุด
  code: true,             // เลขประจำตัว
  gender: false,          // ช่องเพศ
  rowH: 7,                // ความสูงแถว (มม.)
  land: false,            // แนวนอน
  sign: 'ครูประจำชั้น',   // ช่องลงชื่อ (ว่าง = ไม่มี)
  pick: false,            // พิมพ์เฉพาะนักเรียนที่เลือก
  picked: [],             // id นักเรียนที่เลือก (จำข้ามขอบเขต ใช้เฉพาะคนที่อยู่ในขอบเขตปัจจุบัน)
  renum: false,           // เรียงเลขที่ใหม่ 1, 2, 3… (เหมาะกับตอนเลือกบางคน)
};
const ROW_H = { 6: 'แน่น', 7: 'ปกติ', 8.5: 'สูง (เขียนสะดวก)', 10: 'สูงมาก' };

export function loadListOpts() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ใช้ค่าเริ่มต้น */ }
  return { ...LIST_DEFAULTS, ...o };
}
export const saveListOpts = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* เครื่องไม่ให้จำค่า */ } };

// หัวช่องว่าง: ใช้ชื่อที่พิมพ์ไว้ก่อน ที่เหลือเว้นว่าง · พิมพ์ชื่อเกินจำนวนช่อง = เพิ่มช่องให้
export function blankHeads(o) {
  const names = String(o.labels || '').split(/[,\n]/).map((s) => s.trim());
  while (names.length && !names.at(-1)) names.pop();
  const n = Math.max(0, Math.min(40, Math.max(Number(o.cols) || 0, names.length)));
  return Array.from({ length: n }, (_, i) => names[i] || '');
}

// ห้องที่จะพิมพ์ตามขอบเขต (rooms เรียงตามระดับ/ห้องแล้ว)
export function roomsInScope(rooms, scope, roomId) {
  if (scope === 'all') return rooms;
  if (String(scope).startsWith('lv:')) return rooms.filter((r) => r.level === scope.slice(3));
  return rooms.filter((r) => r.id === roomId);
}

// คัดเฉพาะนักเรียนที่เลือก (ปิดตัวเลือก = ทุกคน)
export function applyPick(entries, o) {
  if (!o.pick) return entries;
  const ids = new Set(o.picked || []);
  return entries.map((e) => ({ ...e, roster: e.roster.filter((s) => ids.has(s.id)) }));
}

// จัดเป็นหน้า: [{ room|null, level, students:[{...s, room}] }]
export function listGroups(entries, o) {
  if (o.scope === 'room' || o.group !== 'level') return entries.map(({ room, roster }) => ({ room, level: room.level, students: roster.map((s) => ({ ...s, room })) }));
  const by = new Map();
  for (const { room, roster } of entries) {
    if (!by.has(room.level)) by.set(room.level, { room: null, level: room.level, rooms: [], students: [] });
    const g = by.get(room.level); g.rooms.push(room); g.students.push(...roster.map((s) => ({ ...s, room })));
  }
  return [...by.values()].map((g) => (g.rooms.length === 1 ? { room: g.rooms[0], level: g.level, students: g.students } : g));
}

// HTML ของทุกหน้า
export function listPages(ctx, groups, o) {
  if (o.pick && !groups.some((g) => g.students.length)) return '<div class="empty">ยังไม่ได้เลือกนักเรียน · ติ๊กชื่อในรายการ "เลือกนักเรียน" ด้านบน</div>';
  if (o.scope !== 'room' || o.pick) groups = groups.filter((g) => g.students.length);   // หลายห้อง: ข้ามห้องที่ไม่มีนักเรียน ไม่ให้เป็นหน้าว่าง
  if (!groups.length) return '<div class="empty">ไม่มีนักเรียนในขอบเขตที่เลือก</div>';
  const heads = blankHeads(o);
  const withRoom = (g) => !g.room;
  const pageW = o.land ? 269 : 182;   // ความกว้างเนื้อที่พิมพ์ (มม.)
  return groups.map((g) => {
    const showRoom = withRoom(g);
    const fixed = 9 + (showRoom ? 13 : 0) + (o.code ? 20 : 0) + (o.gender ? 9 : 0) + (o.total ? 12 : 0);
    const nameW = 56;
    const w = heads.length ? Math.max(5, Math.min(40, (pageW - fixed - nameW) / heads.length)) : 0;
    const blankTh = heads.map((h) => `<th class="blank" style="width:${w.toFixed(1)}mm">${esc(h)}</th>`).join('') + (o.total ? '<th style="width:12mm">รวม</th>' : '');
    const blankTd = '<td></td>'.repeat(heads.length + (o.total ? 1 : 0));
    const info = (s) => `<td>${s.number ?? ''}</td>${showRoom ? `<td>${esc(roomName(s.room))}</td>` : ''}${o.code ? `<td>${esc(s.student_code ?? '')}</td>` : ''}<td class="l nm">${esc(fullName(s))}</td>${o.gender ? `<td>${esc(s.gender ?? '')}</td>` : ''}`;
    const infoTh = `<th style="width:9mm">${showRoom ? 'ลำดับ' : 'ที่'}</th>${showRoom ? '<th style="width:13mm">ห้อง</th>' : ''}${o.code ? '<th style="width:20mm">เลขประจำตัว</th>' : ''}<th class="l">ชื่อ-สกุล</th>${o.gender ? '<th style="width:9mm">เพศ</th>' : ''}`;
    const left = o.side === 'left';
    const rows = g.students.map((s, i) => {
      const cells = showRoom || o.renum ? info({ ...s, number: i + 1 }) : info(s);
      return `<tr>${left ? blankTd + cells : cells + blankTd}</tr>`;
    }).join('');
    const boys = g.students.filter((s) => s.gender === 'ช').length;
    const where = g.room ? `ชั้น${levelName(g.level)}/${g.room.room}` : `ชั้น${levelName(g.level)}`;
    const sub = [o.note, termText(ctx)].filter(Boolean).join(' · ');
    const signHtml = !o.sign ? '' : o.sign === 'ครูประจำชั้น' && g.room ? signs(ctx, g.room) : signs(null, null, [{ name: '', role: o.sign }]);
    return `<div class="a4 ${o.land ? 'land' : ''} blank-list" style="--rh:${Number(o.rowH) || 7}mm">
      ${head(ctx, `${o.title || 'รายชื่อนักเรียน'} ${where}`, sub)}
      <table><thead><tr>${left ? blankTh + infoTh : infoTh + blankTh}</tr></thead><tbody>${rows || `<tr><td colspan="99">ยังไม่มีนักเรียน</td></tr>`}</tbody></table>
      <div class="legend">ชาย ${boys} คน · หญิง ${g.students.length - boys} คน · รวม ${g.students.length} คน</div>
      ${signHtml}
    </div>`;
  }).join('');
}

// แผงตั้งค่า (ไม่พิมพ์)
export function listControls(rooms, o) {
  const levels = LEVELS.filter((lv) => rooms.some((r) => r.level === lv));
  const sel = (v, cur) => (String(v) === String(cur) ? 'selected' : '');
  const chk = (k, label) => `<label class="lo-chk"><input type="checkbox" data-o="${k}" ${o[k] ? 'checked' : ''}> ${label}</label>`;
  return `<div class="card no-print list-opts">
    <div class="row">
      <label class="field">ขอบเขต<select data-o="scope">
        <option value="room" ${sel('room', o.scope)}>ห้องเดียว (เลือกห้องด้านบน)</option>
        <option value="all" ${sel('all', o.scope)}>ทุกระดับชั้น (${rooms.length} ห้อง)</option>
        ${levels.map((lv) => `<option value="lv:${esc(lv)}" ${sel(`lv:${lv}`, o.scope)}>ทั้งชั้น ${esc(lv)}</option>`).join('')}
      </select></label>
      ${o.scope !== 'room' ? `<label class="field">จัดหน้า<select data-o="group">
        <option value="room" ${sel('room', o.group)}>หน้าละห้อง</option>
        <option value="level" ${sel('level', o.group)}>รวมทั้งชั้นเป็นรายการเดียว</option></select></label>` : ''}
      <label class="field">หัวเรื่อง<input data-o="title" value="${esc(o.title)}" placeholder="รายชื่อนักเรียน"></label>
      <label class="field" style="flex:1;min-width:180px">กิจกรรม/วิชา (บรรทัดที่ 2)<input data-o="note" value="${esc(o.note)}" placeholder="เช่น กิจกรรมวันลอยกระทง"></label>
    </div>
    <div class="row">
      <label class="field">จำนวนช่องว่าง<input type="number" min="0" max="40" data-o="cols" value="${esc(o.cols)}" style="width:6em"></label>
      <label class="field" style="flex:1;min-width:220px">หัวช่อง (คั่นด้วย , ไม่ใส่ก็ได้)<input data-o="labels" value="${esc(o.labels)}" placeholder="เช่น 1,2,3,4 หรือ ชิ้นงาน 1, ชิ้นงาน 2, สอบย่อย"></label>
      <label class="field">ช่องว่างอยู่<select data-o="side"><option value="left" ${sel('left', o.side)}>ซ้ายของรายชื่อ</option><option value="right" ${sel('right', o.side)}>ขวาของรายชื่อ</option></select></label>
      <label class="field">ความสูงแถว<select data-o="rowH">${Object.entries(ROW_H).map(([v, t]) => `<option value="${v}" ${sel(v, o.rowH)}>${t}</option>`).join('')}</select></label>
      <label class="field">ช่องลงชื่อ<input data-o="sign" value="${esc(o.sign)}" placeholder="ว่าง = ไม่มีช่องลงชื่อ" list="lo-signs"></label>
      <datalist id="lo-signs"><option value="ครูประจำชั้น"><option value="ครูผู้สอน"><option value="ครูผู้รับผิดชอบกิจกรรม"></datalist>
    </div>
    <div class="row lo-chks">
      ${chk('pick', '<b>เลือกเฉพาะบางคน</b>')}${chk('renum', 'เรียงเลขที่ใหม่ 1, 2, 3…')}${chk('code', 'เลขประจำตัว')}${chk('gender', 'ช่องเพศ')}${chk('total', 'ช่อง "รวม"')}${chk('land', 'กระดาษแนวนอน')}
      <button type="button" class="btn btn-ghost" data-o-reset>ค่าเริ่มต้น</button>
    </div>
    ${o.pick ? '<div class="lo-pick" id="lo-pick"><p class="muted small">กำลังโหลดรายชื่อ…</p></div>' : ''}
  </div>`;
}

// รายการติ๊กเลือกนักเรียน (แยกตามห้อง)
export function pickerHtml(entries, o) {
  const ids = new Set(o.picked || []);
  const all = entries.flatMap((e) => e.roster);
  const n = all.filter((s) => ids.has(s.id)).length;
  return `<div class="lo-pick-bar"><b>เลือกนักเรียน</b> <span class="muted" data-pick-count>เลือกแล้ว ${n} จาก ${all.length} คน</span>
      <input type="search" data-pick-q placeholder="ค้นหาชื่อ / เลขประจำตัว" aria-label="ค้นหานักเรียน">
      <button type="button" class="btn btn-sm" data-pick-all="1">เลือกทั้งหมด</button>
      <button type="button" class="btn btn-sm btn-ghost" data-pick-all="0">ไม่เลือกเลย</button></div>
    ${entries.filter((e) => e.roster.length).map((e) => `<fieldset class="lo-room"><legend>ห้อง ${esc(roomName(e.room))}
        <button type="button" class="btn btn-sm btn-ghost" data-pick-room="${esc(e.room.id)}">ทั้งห้อง</button></legend>
      <div class="lo-names">${e.roster.map((s) => `<label class="lo-name" data-q="${esc(`${fullName(s)} ${s.student_code ?? ''} ${s.number ?? ''}`)}">
        <input type="checkbox" data-sid="${esc(s.id)}" data-room="${esc(e.room.id)}" ${ids.has(s.id) ? 'checked' : ''}> ${s.number ?? ''}. ${esc(fullName(s))}</label>`).join('')}</div>
    </fieldset>`).join('') || '<p class="muted">ไม่มีนักเรียนในขอบเขตนี้</p>'}`;
}

// ผูกรายการติ๊ก: เปลี่ยนแล้วบันทึก o.picked และเรียก onChange()
export function wirePicker(box, o, onChange) {
  const ids = new Set(o.picked || []);
  const boxes = () => [...box.querySelectorAll('[data-sid]')];
  const sync = () => {
    o.picked = [...ids]; saveListOpts(o);
    const all = boxes(); box.querySelector('[data-pick-count]').textContent = `เลือกแล้ว ${all.filter((c) => c.checked).length} จาก ${all.length} คน`;
    onChange();
  };
  const set = (list, on) => { list.forEach((c) => { c.checked = on; on ? ids.add(c.dataset.sid) : ids.delete(c.dataset.sid); }); sync(); };
  box.addEventListener('change', (e) => { if (e.target.dataset.sid) set([e.target], e.target.checked); });
  box.addEventListener('click', (e) => {
    const a = e.target.closest('[data-pick-all]');
    if (a) set(boxes().filter((c) => !c.closest('.lo-name').hidden), a.dataset.pickAll === '1');
    const r = e.target.closest('[data-pick-room]');
    if (r) { const list = boxes().filter((c) => c.dataset.room === r.dataset.pickRoom); set(list, !list.every((c) => c.checked)); }
  });
  box.querySelector('[data-pick-q]')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('.lo-name').forEach((l) => { l.hidden = !!q && !l.dataset.q.toLowerCase().includes(q); });
  });
}

// ผูกแผงตั้งค่า: เปลี่ยนแล้วบันทึกและเรียก onChange(opts, needFull) · needFull = ต้องวาดแผงใหม่ (เปลี่ยนขอบเขต)
export function wireListControls(root, o, onChange) {
  const box = root.querySelector('.list-opts');
  if (!box) return;
  let t = null;
  const apply = (e, typing) => {
    const k = e.target.dataset.o; if (!k) return;
    o[k] = e.target.type === 'checkbox' ? e.target.checked : ['cols', 'rowH'].includes(k) ? Number(e.target.value) : e.target.value;
    saveListOpts(o);
    clearTimeout(t);
    if (typing) t = setTimeout(() => onChange(o, false), 300);
    else onChange(o, k === 'scope' || k === 'pick');
  };
  const isText = (el) => el.tagName === 'INPUT' && el.type !== 'checkbox';
  box.addEventListener('input', (e) => { if (isText(e.target)) apply(e, true); });
  box.addEventListener('change', (e) => { if (!isText(e.target)) apply(e, false); });
  box.querySelector('[data-o-reset]').addEventListener('click', () => { Object.assign(o, LIST_DEFAULTS, { scope: o.scope }); saveListOpts(o); onChange(o, true); });
}
