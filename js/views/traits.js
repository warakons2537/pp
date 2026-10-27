import { esc, $, toast, modal, options, roomName, fullName } from '../util.js?v=2569.10.27-5';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.10.27-5';
import { getRoster } from '../data.js?v=2569.10.27-5';
import { attachGrid } from '../grid.js?v=2569.10.27-5';
import { TRAIT_KINDS, ACTIVITIES, modeSummary } from '../assess.js?v=2569.10.27-5';
import { detailPane } from './assess-detail.js?v=2569.10.27-5';
import { FORMS } from '../assess-forms.js?v=2569.10.27-5';

const pref = { room: null, tab: 'trait8' };
const TABS = { ...Object.fromEntries(Object.entries(TRAIT_KINDS).map(([k, v]) => [k, v.short])),
  ...Object.fromEntries(Object.entries(FORMS).map(([k, v]) => [`d_${k}`, v.short])), activities: 'กิจกรรมพัฒนาผู้เรียน', comments: 'ความเห็นครูประจำชั้น' };

export async function render(el, ctx) {
  const rooms = ctx.isAdmin ? ctx.classrooms : [...ctx.myClassrooms, ...ctx.classrooms.filter((c) => !ctx.myClassrooms.includes(c))];
  if (!rooms.length || !ctx.term) { el.innerHTML = '<h1>คุณลักษณะและกิจกรรม</h1><div class="empty">ยังไม่มีห้องเรียนหรือภาคเรียน</div>'; return; }
  if (!rooms.some((r) => r.id === pref.room)) pref.room = (ctx.myClassrooms[0] || rooms[0]).id;
  const room = ctx.classroomById[pref.room];
  const canEdit = ctx.isAdmin || ctx.classroomTeacherRows.some((x) => x.classroom_id === room.id && x.teacher_id === ctx.me.id);
  const roster = await getRoster(ctx.db, room.id);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>คุณลักษณะและกิจกรรม</h1><p>ประเมินคุณลักษณะ การอ่านคิดวิเคราะห์ สมรรถนะ และกิจกรรมรายห้อง · ภาคเรียนที่ ${ctx.term.term}/${ctx.term.academic_year} · ${canEdit ? '<span class="live">อัปเดตทันที</span>' : 'ดูอย่างเดียว (ครูประจำชั้นเป็นผู้บันทึก)'}</p></div>
      <div class="row"><label class="field">ห้อง<select id="room">${options(rooms, room.id, (r) => `ห้อง ${roomName(r)}`)}</select></label></div>
    </div>
    ${tabGroups([['ผลการประเมิน', 'traits', Object.keys(TRAIT_KINDS)], ['แบบประเมินละเอียด', 'reports', Object.keys(FORMS).map((k) => `d_${k}`)], ['กิจกรรมและความเห็น', 'students', ['activities', 'comments']]]
    .map(([label, ic, keys]) => ({ label, icon: ic, tabs: keys.map((k) => ({ key: k, label: esc(TABS[k]) })) })), pref.tab)}
    <div id="pane"></div>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { pref.tab = b.dataset.tab; render(el, ctx); }));
  wireTabGroups(el);
  $('#room', el).addEventListener('change', (e) => { pref.room = e.target.value; render(el, ctx); });
  const pane = $('#pane', el);
  if (!roster.length) { pane.innerHTML = '<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'; return; }
  const ids = roster.map((s) => s.id);
  if (pref.tab.startsWith('d_')) return detailPane(pane, ctx, room, roster, ids, canEdit, pref.tab.slice(2));
  if (pref.tab === 'activities') return activities(pane, ctx, roster, ids, canEdit);
  if (pref.tab === 'comments') return comments(pane, ctx, roster, ids, canEdit);
  return traitGrid(pane, ctx, roster, ids, canEdit, pref.tab);
}

// ---------------------------------------------------------------------
async function traitGrid(pane, ctx, roster, ids, canEdit, kind) {
  const K = TRAIT_KINDS[kind];
  const term = ctx.term.id;
  const rows = (await ctx.db.select('trait_scores', { eq: { term_id: term, kind }, in: { student_id: ids } }));
  const val = new Map(rows.map((r) => [`${r.student_id}|${r.item_no}`, r.score]));
  const summary = (sid) => modeSummary(K.items.map((_, i) => val.get(`${sid}|${i + 1}`)));
  const sumChip = (v) => (v === null || v === undefined ? '<span class="muted">–</span>'
    : `<span class="chip ${v === 0 ? 'chip-bad' : v === 3 ? 'chip-ok' : 'chip-info'}">${esc(K.levels[v])}</span>`);

  pane.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <div class="small muted">${esc(K.label)} · กรอก 0–3 (${K.levels.map((l, i) => `${i} = ${l}`).join(', ')}) · ผลสรุปใช้ฐานนิยม ถ้าซ้ำเท่ากันใช้ค่าสูงกว่า</div>
      ${canEdit ? '<button class="btn btn-sm" id="fill">เติมช่องว่างทั้งหมด…</button>' : ''}
    </div>
    <div class="tbl-wrap"><table class="reg sheet" id="tgrid">
      <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th>${K.items.map((t, i) => `<th class="ih" title="${esc(t)}">${i + 1}<br><span style="font-weight:400">${esc(t.length > 14 ? t.slice(0, 13) + '…' : t)}</span></th>`).join('')}<th>สรุป</th></tr></thead>
      <tbody>${roster.map((s, r) => `<tr data-sid="${s.id}"><td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td>
        ${K.items.map((_, i) => `<td><input class="gc sc" data-r="${r}" data-c="${i}" data-item="${i + 1}" data-sid="${s.id}" inputmode="numeric" maxlength="1"
          value="${val.get(`${s.id}|${i + 1}`) ?? ''}" ${canEdit ? '' : 'readonly'} aria-label="ข้อ ${i + 1} ${esc(s.first_name)}" style="width:38px"></td>`).join('')}
        <td class="c-sum" style="padding:0 6px">${sumChip(summary(s.id))}</td></tr>`).join('')}</tbody>
    </table></div>`;

  const grid = $('#tgrid', pane);
  const refresh = (sid, flash) => {
    const tr = grid.querySelector(`tr[data-sid="${sid}"]`); if (!tr) return;
    tr.querySelector('.c-sum').innerHTML = sumChip(summary(sid));
    if (flash) { tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1300); }
  };
  let queue = []; let dels = []; let timer;
  const flush = async () => {
    const up = queue; const del = dels; queue = []; dels = [];
    try {
      if (up.length) await ctx.db.upsert('trait_scores', up, 'term_id,student_id,kind,item_no');
      for (const d of del) await ctx.db.remove('trait_scores', d);
    } catch (err) { toast(err.message, 'err'); }
  };
  const put = (sid, item, v) => {
    const key = { term_id: term, student_id: sid, kind, item_no: item };
    queue = queue.filter((q) => !(q.student_id === sid && q.item_no === item));
    dels = dels.filter((q) => !(q.student_id === sid && q.item_no === item));
    if (v === null) { val.delete(`${sid}|${item}`); dels.push(key); } else { val.set(`${sid}|${item}`, v); queue.push({ ...key, score: v }); }
    clearTimeout(timer); timer = setTimeout(flush, 250);
  };
  const commit = (inp, raw) => {
    const t = String(raw).trim();
    const v = t === '' ? null : Number(t);
    if (v !== null && ![0, 1, 2, 3].includes(v)) { inp.classList.add('bad'); toast(`"${t}" ไม่ถูกต้อง กรอกได้เฉพาะ 0, 1, 2, 3`, 'err'); return false; }
    inp.classList.remove('bad'); inp.value = v ?? '';
    const item = Number(inp.dataset.item);
    if ((val.get(`${inp.dataset.sid}|${item}`) ?? null) === v) return true;
    put(inp.dataset.sid, item, v); refresh(inp.dataset.sid);
    return true;
  };
  if (canEdit) {
    attachGrid(grid, commit);
    grid.addEventListener('input', (e) => {           // พิมพ์ตัวเลขแล้วเลื่อนไปช่องขวาทันที (กรอกเร็ว)
      const inp = e.target.closest('input.gc');
      if (inp && /^[0-3]$/.test(inp.value) && commit(inp, inp.value)) {
        const next = grid.querySelector(`input.gc[data-r="${inp.dataset.r}"][data-c="${Number(inp.dataset.c) + 1}"]`)
          || grid.querySelector(`input.gc[data-r="${Number(inp.dataset.r) + 1}"][data-c="0"]`);
        next?.focus();
      }
    });
    $('#fill', pane).addEventListener('click', async () => {
      const r = await modal('เติมช่องว่างทั้งหมด', `<label>เติมด้วยค่า<select id="fill-v" name="v">${K.levels.map((l, i) => `<option value="${i}" ${i === 3 ? 'selected' : ''}>${i} = ${l}</option>`).join('')}</select></label>
        <p class="small muted">ช่องที่กรอกไว้แล้วจะไม่ถูกเปลี่ยน จากนั้นค่อยปรับรายคน</p>`, { okText: 'เติม' });
      if (!r) return;
      let n = 0;
      roster.forEach((s) => K.items.forEach((_, i) => { if (!val.has(`${s.id}|${i + 1}`)) {
        put(s.id, i + 1, Number(r.v)); n++;
        const inp = grid.querySelector(`input.gc[data-sid="${s.id}"][data-item="${i + 1}"]`); if (inp) inp.value = r.v;
      } }));
      roster.forEach((s) => refresh(s.id));
      toast(`เติมแล้ว ${n} ช่อง`);
    });
  }
  const off = ctx.db.subscribe('trait_scores', null, (ev) => {
    const x = ev.type === 'DELETE' ? ev.old : ev.new;
    if (x.kind && x.kind !== kind) return;
    if (x.term_id && x.term_id !== term) return;
    if (!ids.includes(x.student_id)) return;
    const k = `${x.student_id}|${x.item_no}`;
    if (ev.type === 'DELETE') { if (!val.has(k)) return; val.delete(k); }
    else { if (val.get(k) === x.score) return; val.set(k, x.score); }
    const inp = grid.querySelector(`input.gc[data-sid="${x.student_id}"][data-item="${x.item_no}"]`);
    if (inp && document.activeElement !== inp) inp.value = val.get(k) ?? '';
    refresh(x.student_id, true);
  });
  return () => { flush(); off(); };
}

// ---------------------------------------------------------------------
async function activities(pane, ctx, roster, ids, canEdit) {
  const term = ctx.term.id;
  const rows = await ctx.db.select('activity_results', { eq: { term_id: term }, in: { student_id: ids } });
  const data = new Map(rows.map((r) => [`${r.student_id}|${r.activity}`, r]));
  const sel = (s, a) => { const p = data.get(`${s.id}|${a}`)?.passed;
    return `<select class="act" data-sid="${s.id}" data-a="${a}" ${canEdit ? '' : 'disabled'} aria-label="${esc(ACTIVITIES[a])} ${esc(s.first_name)}">
      <option value=""></option><option value="1" ${p === true ? 'selected' : ''}>ผ่าน</option><option value="0" ${p === false ? 'selected' : ''}>ไม่ผ่าน</option></select>`; };
  pane.innerHTML = `
    <div class="small muted">ผ่าน (ผ) / ไม่ผ่าน (มผ) · กดปุ่มใต้ชื่อกิจกรรมเพื่อให้ทุกคนที่ยังว่าง "ผ่าน"</div>
    <div class="tbl-wrap"><table class="tbl" id="agrid"><thead><tr><th class="n">ที่</th><th>ชื่อ-สกุล</th>
      ${Object.entries(ACTIVITIES).map(([k, v]) => `<th>${esc(v)}${canEdit ? `<br><button class="btn btn-sm" data-all="${k}">ผ่านทุกคน</button>` : ''}</th>`).join('')}<th>ชื่อชุมนุม</th></tr></thead>
      <tbody>${roster.map((s) => `<tr data-sid="${s.id}"><td class="n">${s.number ?? ''}</td><td>${esc(fullName(s))}</td>
        ${Object.keys(ACTIVITIES).map((a) => `<td>${sel(s, a)}</td>`).join('')}
        <td><input type="text" class="club" data-sid="${s.id}" value="${esc(data.get(`${s.id}|club`)?.club_name ?? '')}" ${canEdit ? '' : 'readonly'} style="width:140px" aria-label="ชื่อชุมนุม ${esc(s.first_name)}"></td></tr>`).join('')}</tbody></table></div>`;
  const save = async (list) => {
    try { await ctx.db.upsert('activity_results', list.map((r) => ({ term_id: term, ...r })), 'term_id,student_id,activity'); }
    catch (err) { toast(err.message, 'err'); }
  };
  const row = (sid, a, patch) => { const cur = data.get(`${sid}|${a}`) || { student_id: sid, activity: a, passed: null, club_name: null };
    const next = { student_id: sid, activity: a, passed: cur.passed ?? null, club_name: cur.club_name ?? null, ...patch }; data.set(`${sid}|${a}`, next); return next; };
  if (canEdit) {
    pane.addEventListener('change', (e) => {
      const s = e.target.closest('select.act');
      if (s) save([row(s.dataset.sid, s.dataset.a, { passed: s.value === '' ? null : s.value === '1' })]);
      const c = e.target.closest('input.club');
      if (c) save([row(c.dataset.sid, 'club', { club_name: c.value.trim() || null })]);
    });
    pane.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.all;
      const list = roster.filter((s) => data.get(`${s.id}|${a}`)?.passed == null).map((s) => row(s.id, a, { passed: true }));
      list.forEach((r) => { const el = pane.querySelector(`select.act[data-sid="${r.student_id}"][data-a="${a}"]`); if (el) el.value = '1'; });
      if (list.length) { save(list); toast(`ผ่าน ${list.length} คน`); }
    }));
  }
  return ctx.db.subscribe('activity_results', { col: 'term_id', val: term }, (ev) => {
    if (ev.type === 'DELETE') return;
    const r = ev.new; if (!ids.includes(r.student_id)) return;
    data.set(`${r.student_id}|${r.activity}`, r);
    const s = pane.querySelector(`select.act[data-sid="${r.student_id}"][data-a="${r.activity}"]`);
    if (s && document.activeElement !== s) s.value = r.passed === true ? '1' : r.passed === false ? '0' : '';
    const c = r.activity === 'club' && pane.querySelector(`input.club[data-sid="${r.student_id}"]`);
    if (c && document.activeElement !== c) c.value = r.club_name ?? '';
  });
}

// ---------------------------------------------------------------------
async function comments(pane, ctx, roster, ids, canEdit) {
  const term = ctx.term.id;
  const rows = await ctx.db.select('homeroom_comments', { eq: { term_id: term }, in: { student_id: ids } });
  const data = Object.fromEntries(rows.map((r) => [r.student_id, r.comment]));
  pane.innerHTML = `<div class="small muted">ความเห็นนี้จะพิมพ์ลงใน ปพ.6 ของนักเรียนแต่ละคน · บันทึกเมื่อออกจากช่อง</div>
    <div class="roll">${roster.map((s) => `<div class="roll-row" style="grid-template-columns:34px minmax(0,1fr)"><span class="muted tabular">${s.number ?? ''}</span>
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span>${esc(fullName(s))}</span>
      <textarea class="cm" data-sid="${s.id}" rows="2" ${canEdit ? '' : 'readonly'} aria-label="ความเห็น ${esc(s.first_name)}">${esc(data[s.id] ?? '')}</textarea></div></div>`).join('')}</div>`;
  if (canEdit) pane.addEventListener('change', async (e) => {
    const t = e.target.closest('textarea.cm'); if (!t) return;
    try { await ctx.db.upsert('homeroom_comments', [{ term_id: term, student_id: t.dataset.sid, comment: t.value.trim() || null }], 'term_id,student_id'); toast('บันทึกความเห็นแล้ว'); }
    catch (err) { toast(err.message, 'err'); }
  });
  return ctx.db.subscribe('homeroom_comments', { col: 'term_id', val: term }, (ev) => {
    if (ev.type === 'DELETE') return;
    const t = pane.querySelector(`textarea.cm[data-sid="${ev.new.student_id}"]`);
    if (t && document.activeElement !== t) t.value = ev.new.comment ?? '';
  });
}
