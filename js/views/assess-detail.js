// =====================================================================
//  แบบประเมินละเอียด (คุณลักษณะรายพฤติกรรม / สมรรถนะรายข้อ)
//  บันทึกคะแนนรายข้อใน assess_detail แล้วเขียนผลสรุปรายข้อลง trait_scores ให้อัตโนมัติ
//  (ปพ.6 และแท็บสรุปเดิมจึงได้ผลเดียวกัน)
// =====================================================================
import { esc, $, toast, modal, fullName, levelName, roomName } from '../util.js?v=2569.10.31-3';
import { tabGroups, wireTabGroups } from '../tabs.js?v=2569.10.31-3';
import { attachGrid } from '../grid.js?v=2569.10.31-3';
import { TRAITS, SUBS, subResult, traitResult, traitOverall, LV4, COMPETENCIES, compResult, compOverall, COMP_LV, FORMS } from '../assess-forms.js?v=2569.10.31-3';
import { traitWorkbook, competencyWorkbook } from '../assess-export.js?v=2569.10.31-3';
import { buildXlsx, downloadBytes } from '../xlsx-write.js?v=2569.10.31-3';
import { sheetName as stuName } from '../achievement.js?v=2569.10.31-3';

const pref = { trait8: '1.1', competency5: '1' };
const chip = (label, lv) => `<span class="chip ${lv === 0 ? 'chip-bad' : lv === 3 ? 'chip-ok' : 'chip-info'}">${esc(label)}</span>`;

let active = null;   // ตัวยกเลิกการติดตามของหน้าที่แสดงก่อนหน้า (สลับแผ่นย่อยโดยไม่โหลดทั้งหน้า)
export async function detailPane(pane, ctx, room, roster, ids, canEdit, form) {
  if (active) { try { active(); } catch { /* */ } active = null; }
  const done = (fn) => { active = fn; return fn; };
  const isTrait = form === 'trait8';
  const term = ctx.term.id;
  const rows = await ctx.db.select('assess_detail', { eq: { term_id: term, form }, in: { student_id: ids } });
  const val = new Map(rows.map((r) => [`${r.student_id}|${r.code}`, r.score]));
  const getter = (sid) => (code) => val.get(`${sid}|${code}`) ?? null;

  // แผ่นที่เลือก: ตัวชี้วัด/ด้าน หรือ "sum"
  const sheets = isTrait
    ? SUBS.map((s) => ({ key: s.code, label: s.code, title: `ข้อที่ ${s.trait} ${s.traitName} · ${s.code} ${s.title}`, items: s.items.map((t, i) => ({ code: `${s.code}.${i + 1}`, text: t })), sub: s }))
    : COMPETENCIES.map((c) => ({ key: String(c.no), label: `${c.no}. ${c.name.replace('ความสามารถในการ', '')}`, title: `สมรรถนะที่ ${c.no} ${c.name}`, items: c.items.map((t, i) => ({ code: `${c.no}.${i + 1}`, text: t })), comp: c }));
  if (pref[form] !== 'sum' && !sheets.some((s) => s.key === pref[form])) pref[form] = sheets[0].key;
  const cur = sheets.find((s) => s.key === pref[form]) || null;
  const filledOf = (sh) => roster.reduce((n, s) => n + sh.items.filter((it) => val.has(`${s.id}|${it.code}`)).length, 0);
  const min = FORMS[form].min; const max = FORMS[form].max;

  pane.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center">
      <div class="small muted">${esc(FORMS[form].label)} · กรอก ${min}–${max} ${isTrait ? '(0 = ไม่ผ่าน, 1 = ผ่าน, 2 = ดี, 3 = ดีเยี่ยม)' : '(1 = พอใช้, 2 = ดี, 3 = ดีเยี่ยม)'} · ผลสรุปจะไปอยู่ในแท็บ "${isTrait ? 'คุณลักษณะฯ' : 'สมรรถนะ'}" และ ปพ.6 อัตโนมัติ</div>
      <div class="row">${canEdit && cur ? '<button class="btn btn-sm" id="fill">เติมช่องว่าง…</button>' : ''}<button class="btn btn-sm btn-primary" id="xls">ส่งออก Excel</button></div>
    </div>
    ${tabGroups([{ label: 'แผ่นประเมิน', icon: 'excel', tabs: [...sheets.map((s) => { const f = filledOf(s); const all = s.items.length * roster.length;
      return { key: s.key, title: s.title, label: `${esc(s.label)} <span class="small" style="opacity:.75">${f === all ? '✓' : f ? `${Math.round((f * 100) / all)}%` : ''}</span>` }; }),
      { key: 'sum', label: 'สรุปผล' }] }], pref[form], 'sheet')}
    <div id="dview"></div>`;
  pane.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => { pref[form] = b.dataset.sheet; detailPane(pane, ctx, room, roster, ids, canEdit, form); }));
  wireTabGroups(pane);
  $('#xls', pane).addEventListener('click', () => exportForm(ctx, room, roster, form, getter));
  const view = $('#dview', pane);

  // ---------------- สรุปผล ----------------
  if (!cur) {
    if (isTrait) {
      const ovs = roster.map((s) => traitOverall(getter(s.id)));
      view.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">ที่</th><th>ชื่อ-สกุล</th>
        ${TRAITS.map((t) => `<th class="n" title="${esc(t.name)}">${t.no}</th>`).join('')}<th class="n">เฉลี่ย</th><th>ผลการประเมิน</th><th class="n">กรอกแล้ว</th></tr></thead>
        <tbody>${roster.map((s, i) => { const o = ovs[i]; return `<tr><td class="n">${s.number ?? ''}</td><td>${esc(fullName(s))}</td>
          ${o.per.map((p) => `<td class="n">${p.filled ? p.avg.toFixed(2) : '<span class="muted">–</span>'}</td>`).join('')}
          <td class="n"><b>${o.filled ? o.avg.toFixed(2) : ''}</b></td><td>${o.filled ? chip(LV4[o.level], o.level) : '<span class="muted">–</span>'}</td>
          <td class="n small ${o.filled < o.total ? 'muted' : ''}">${o.filled}/${o.total}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="small muted">ค่าเฉลี่ยแต่ละข้อ = คะแนนรวมทุกพฤติกรรมของข้อนั้น ÷ จำนวนพฤติกรรม · เกณฑ์: มากกว่า 2.5 ดีเยี่ยม · 1.5–2.5 ดี · 1–1.49 ผ่าน · ต่ำกว่า 1 ไม่ผ่าน · ช่องที่ยังว่างนับเป็น 0 เหมือนไฟล์ Excel</p>
        ${countTable(TRAITS.map((t, k) => [t.name, ovs.map((o) => (o.per[k].filled ? o.per[k].level : null))]), LV4, ['ภาพรวม', ovs.map((o) => (o.filled ? o.level : null))])}`;
    } else {
      const ovs = roster.map((s) => compOverall(getter(s.id)));
      view.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="n">ที่</th><th>ชื่อ-สกุล</th>
        ${COMPETENCIES.map((c) => `<th class="n" title="${esc(c.name)}">${c.no}</th>`).join('')}<th class="n">รวม</th><th>แปลผล</th><th class="n">กรอกแล้ว</th></tr></thead>
        <tbody>${roster.map((s, i) => { const o = ovs[i]; return `<tr><td class="n">${s.number ?? ''}</td><td>${esc(fullName(s))}</td>
          ${o.per.map((p) => `<td class="n">${p.filled ? p.level : '<span class="muted">–</span>'}</td>`).join('')}
          <td class="n"><b>${o.filled ? o.sum : ''}</b></td><td>${o.filled ? chip(o.label, o.level) : '<span class="muted">–</span>'}</td>
          <td class="n small ${o.filled < o.total ? 'muted' : ''}">${o.filled}/${o.total}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="small muted">ผลแต่ละด้าน = คะแนนที่ได้บ่อยที่สุด (ถ้าเท่ากันใช้ค่าต่ำกว่า) · แปลผลจากผลรวม 5 ด้าน (เต็ม 15): ร้อยละ 75 ขึ้นไป ดีเยี่ยม · 40–74 ดี · ต่ำกว่า 40 พอใช้ · 0 ปรับปรุง</p>
        ${countTable(COMPETENCIES.map((c, k) => [c.name, ovs.map((o) => (o.per[k].filled ? o.per[k].level : null))]), COMP_LV, ['ภาพรวม', ovs.map((o) => (o.filled ? o.level : null))])}`;
    }
    return done(off(ctx, term, form, ids, () => { if (pane.isConnected) detailPane(pane, ctx, room, roster, ids, canEdit, form); }));
  }

  // ---------------- ตารางกรอกคะแนน ----------------
  const calc = (sid) => (isTrait ? subResult(cur.sub, getter(sid)) : compResult(cur.comp, getter(sid)));
  const resCells = (sid) => {
    const r = calc(sid); const any = r.filled > 0;
    if (isTrait) {
      const lv = LV4.indexOf(r.label);
      return `<td class="calc c-a">${any ? r.sum : ''}</td><td class="calc c-b">${any ? r.avg.toFixed(2) : ''}</td><td class="c-c">${any ? chip(r.label, lv) : '<span class="muted">–</span>'}</td>`;
    }
    return `<td class="calc c-a">${any ? r.sum : ''}</td><td class="calc c-b">${any ? r.level : ''}</td><td class="c-c">${any ? chip(r.label, ['ไม่ผ่าน', 'ผ่าน', 'ดี', 'ดีเยี่ยม'].indexOf(r.label)) : '<span class="muted">–</span>'}</td>`;
  };
  view.innerHTML = `
    <h3 style="margin:4px 0 8px">${esc(cur.title)}</h3>
    <div class="tbl-wrap"><table class="reg sheet" id="dgrid">
      <thead><tr><th class="no">ที่</th><th class="name">ชื่อ-สกุล</th>
        ${cur.items.map((it) => `<th class="ih" title="${esc(`${it.code} ${it.text}`)}" style="min-width:64px;max-width:150px;white-space:normal;font-weight:500;font-size:.78rem;line-height:1.3">${esc(it.code)}<br><span style="font-weight:400">${esc(it.text.length > 46 ? `${it.text.slice(0, 44)}…` : it.text)}</span></th>`).join('')}
        ${isTrait ? '<th>รวม</th><th>เฉลี่ย</th><th>ผลการประเมิน</th>' : '<th>คะแนน</th><th>สรุปผล</th><th>แปลผล</th>'}</tr></thead>
      <tbody>${roster.map((s, r) => `<tr data-sid="${s.id}"><td class="no">${s.number ?? ''}</td><td class="name">${esc(fullName(s))}</td>
        ${cur.items.map((it, c) => `<td><input class="gc sc" data-r="${r}" data-c="${c}" data-code="${it.code}" data-sid="${s.id}" inputmode="numeric" maxlength="1"
          value="${val.get(`${s.id}|${it.code}`) ?? ''}" ${canEdit ? '' : 'readonly'} aria-label="${esc(it.code)} ${esc(s.first_name)}" style="width:40px"></td>`).join('')}
        ${resCells(s.id)}</tr>`).join('')}</tbody>
    </table></div>
    ${isTrait ? `<p class="small muted">เกณฑ์ข้อ ${cur.key} (ตามไฟล์เดิม): รวมมากกว่า ${cur.sub.cut[0]} ดีเยี่ยม · ${cur.sub.cut[1]}–${cur.sub.cut[0]} ดี · ${cur.sub.cut[2]}–${cur.sub.cut[1] - 1} ผ่าน · ต่ำกว่า ${cur.sub.cut[2]} ไม่ผ่าน</p>`
      : '<p class="small muted">สรุปผล = คะแนนที่ได้บ่อยที่สุด (ถ้าเท่ากันใช้ค่าต่ำกว่า) · แปลผลจากคะแนนรวม: 13–15 ดีเยี่ยม · 9–12 ดี · 1–8 ผ่าน</p>'}`;
  const grid = $('#dgrid', view);
  const refresh = (sid, flash) => {
    const tr = grid.querySelector(`tr[data-sid="${sid}"]`); if (!tr) return;
    const tmp = document.createElement('tr'); tmp.innerHTML = resCells(sid);
    ['.c-a', '.c-b', '.c-c'].forEach((k) => { tr.querySelector(k).innerHTML = tmp.querySelector(k).innerHTML; });
    if (flash) { tr.classList.add('flash'); setTimeout(() => tr.classList.remove('flash'), 1300); }
  };

  // ---- บันทึก: คะแนนรายข้อ + ผลสรุปรายข้อใน trait_scores ----
  let up = []; let del = []; const touched = new Set(); let timer;
  const summaryRows = (sid) => {
    const get = getter(sid);
    if (isTrait) {
      const t = TRAITS.find((x) => x.no === cur.sub.trait); const r = traitResult(t, get);
      return [{ item_no: t.no, score: r.filled ? r.level : null }];
    }
    const r = compResult(cur.comp, get);
    return [{ item_no: cur.comp.no, score: r.filled ? r.level : null }];
  };
  const flush = async () => {
    const u = up; const d = del; const sids = [...touched]; up = []; del = []; touched.clear();
    try {
      if (u.length) await ctx.db.upsert('assess_detail', u, 'term_id,student_id,form,code');
      for (const k of d) await ctx.db.remove('assess_detail', k);
      const sum = []; const sumDel = [];
      for (const sid of sids) for (const x of summaryRows(sid)) {
        const key = { term_id: term, student_id: sid, kind: form, item_no: x.item_no };
        if (x.score === null) sumDel.push(key); else sum.push({ ...key, score: x.score });
      }
      if (sum.length) await ctx.db.upsert('trait_scores', sum, 'term_id,student_id,kind,item_no');
      for (const k of sumDel) await ctx.db.remove('trait_scores', k);
    } catch (err) { toast(err.message, 'err'); }
  };
  const put = (sid, code, v) => {
    const key = { term_id: term, student_id: sid, form, code };
    up = up.filter((q) => !(q.student_id === sid && q.code === code));
    del = del.filter((q) => !(q.student_id === sid && q.code === code));
    if (v === null) { val.delete(`${sid}|${code}`); del.push(key); } else { val.set(`${sid}|${code}`, v); up.push({ ...key, score: v }); }
    touched.add(sid);
    clearTimeout(timer); timer = setTimeout(flush, 300);
  };
  const ok = (v) => Number.isInteger(v) && v >= min && v <= max;
  const commit = (inp, raw) => {
    const t = String(raw).trim();
    const v = t === '' ? null : Number(t);
    if (v !== null && !ok(v)) { inp.classList.add('bad'); toast(`"${t}" ไม่ถูกต้อง กรอกได้ ${min}–${max}`, 'err'); return false; }
    inp.classList.remove('bad'); inp.value = v ?? '';
    if ((val.get(`${inp.dataset.sid}|${inp.dataset.code}`) ?? null) === v) return true;
    put(inp.dataset.sid, inp.dataset.code, v); refresh(inp.dataset.sid);
    return true;
  };
  if (canEdit) {
    attachGrid(grid, commit);
    grid.addEventListener('input', (e) => {           // พิมพ์ตัวเลขแล้วเลื่อนไปช่องถัดไป
      const inp = e.target.closest('input.gc');
      if (inp && new RegExp(`^[${min}-${max}]$`).test(inp.value) && commit(inp, inp.value)) {
        const next = grid.querySelector(`input.gc[data-r="${inp.dataset.r}"][data-c="${Number(inp.dataset.c) + 1}"]`)
          || grid.querySelector(`input.gc[data-r="${Number(inp.dataset.r) + 1}"][data-c="0"]`);
        next?.focus();
      }
    });
    $('#fill', pane)?.addEventListener('click', async () => {
      const r = await modal('เติมช่องว่างในแผ่นนี้', `<label>เติมด้วยค่า<select name="v">${Array.from({ length: max - min + 1 }, (_, i) => min + i).map((v) => `<option value="${v}" ${v === max ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <p class="small muted">เฉพาะช่องที่ยังว่างในแผ่น ${esc(cur.label)} ช่องที่กรอกแล้วไม่เปลี่ยน</p>`, { okText: 'เติม' });
      if (!r) return;
      let n = 0;
      roster.forEach((s) => cur.items.forEach((it) => { if (!val.has(`${s.id}|${it.code}`)) {
        put(s.id, it.code, Number(r.v)); n++;
        const inp = grid.querySelector(`input.gc[data-sid="${s.id}"][data-code="${it.code}"]`); if (inp) inp.value = r.v;
      } }));
      roster.forEach((s) => refresh(s.id));
      toast(`เติมแล้ว ${n} ช่อง`);
    });
  }
  const unsub = ctx.db.subscribe('assess_detail', null, (ev) => {
    const x = ev.type === 'DELETE' ? ev.old : ev.new;
    if ((x.form && x.form !== form) || (x.term_id && x.term_id !== term) || !ids.includes(x.student_id)) return;
    const k = `${x.student_id}|${x.code}`;
    if (ev.type === 'DELETE') { if (!val.has(k)) return; val.delete(k); } else { if (val.get(k) === x.score) return; val.set(k, x.score); }
    const inp = grid.querySelector(`input.gc[data-sid="${x.student_id}"][data-code="${x.code}"]`);
    if (inp && document.activeElement !== inp) inp.value = val.get(k) ?? '';
    refresh(x.student_id, true);
  });
  return done(() => { flush(); unsub(); });
}

function off(ctx, term, form, ids, rerender) {
  let t;
  return ctx.db.subscribe('assess_detail', null, (ev) => {
    const x = ev.type === 'DELETE' ? ev.old : ev.new;
    if ((x.form && x.form !== form) || (x.term_id && x.term_id !== term) || !ids.includes(x.student_id)) return;
    clearTimeout(t); t = setTimeout(rerender, 600);
  });
}

// ตารางนับจำนวน/ร้อยละตามระดับ
function countTable(rows, labels, overall) {
  const pct = (n, all) => (all ? ((n * 100) / all).toFixed(2) : '0.00');
  const line = ([name, lvs], bold) => {
    const have = lvs.filter((x) => x !== null);
    return `<tr><td>${bold ? `<b>${esc(name)}</b>` : esc(name)}</td>${labels.map((_, k) => { const n = have.filter((x) => x === k).length; return `<td class="n">${n}</td><td class="n small muted">${pct(n, have.length)}</td>`; }).join('')}<td class="n">${have.length}</td></tr>`;
  };
  return `<h3 style="margin-top:18px">สรุปจำนวนนักเรียนตามระดับคุณภาพ</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th rowspan="2">รายการ</th>${labels.map((l) => `<th colspan="2" class="n">${esc(l)}</th>`).join('')}<th rowspan="2" class="n">ประเมินแล้ว</th></tr>
      <tr>${labels.map(() => '<th class="n small">คน</th><th class="n small">ร้อยละ</th>').join('')}</tr></thead>
      <tbody>${rows.map((r) => line(r)).join('')}${line(overall, true)}</tbody></table></div>`;
}

// ---------------------------------------------------------------------
//  ส่งออก
// ---------------------------------------------------------------------
async function exportForm(ctx, room, roster, form, getter) {
  try {
    const sameLevel = ctx.classrooms.filter((c) => c.level === room.level).length;
    const info = {
      line2: `ชั้น${levelName(room.level)}${sameLevel > 1 ? ` ห้อง ${room.room}` : ''} ภาคเรียนที่ ${ctx.term.term} ปีการศึกษา ${ctx.term.academic_year}`,
      schoolName: ctx.settings.school_name ? `โรงเรียน${ctx.settings.school_name}` : '',
      area: ctx.settings.area_office || '',
      homeroom: ctx.homeroomTeachers(room.id).map((t) => t.full_name).filter(Boolean),
    };
    const students = roster.map((s, i) => ({ no: s.number ?? i + 1, name: stuName(s), get: getter(s.id) }));
    const isTrait = form === 'trait8';
    const sheets = isTrait ? traitWorkbook(info, students) : competencyWorkbook(info, students);
    const name = `${isTrait ? 'แบบประเมินคุณลักษณะอันพึงประสงค์' : 'แบบประเมินสมรรถนะสำคัญของผู้เรียน'} ${roomName(room)} ภาค${ctx.term.term}-${ctx.term.academic_year}.xlsx`;
    downloadBytes(buildXlsx(sheets, { title: name.replace(/\.xlsx$/, '') }), name.replace(/[\\/:*?"<>|]+/g, '-'));
    toast(`ดาวน์โหลดแล้ว: ${name}`);
  } catch (err) { toast(err.message, 'err'); }
}
