// =====================================================================
//  ตั้งค่าระบบ → รายวิชา → นำเข้าจากไฟล์คะแนน (หลายไฟล์)
//  อ่านไฟล์ → ตารางตรวจ (แก้รหัส/ชื่อ/ห้อง · เลือกทีละไฟล์เมื่อซ้ำ · ปุ่มดูเพื่อเทียบ) → สร้างวิชา + เปิดสอน + นำเข้าคะแนน
// =====================================================================
import { esc, toast, roomName, fullName } from '../util.js?v=2569.10.31-10';
import { getRoster } from '../data.js?v=2569.10.31-10';
import { sheetMatrix, findAchievementSheet, parseAchievement, nameKey } from '../achievement-import.js?v=2569.10.31-10';
import { planImport, applyImport } from '../achievement-io.js?v=2569.10.31-10';
import { inheritedOrder } from '../course-order.js?v=2569.10.31-10';
import { buildRows, rowStatus, defaultAction, courseRatio } from '../subject-import.js?v=2569.10.31-10';

async function readFiles(files) {
  if (!window.XLSX) throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า');
  const ok = []; const skipped = [];
  for (const file of files) {
    try {
      const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const name = findAchievementSheet(wb);
      if (!name) { skipped.push({ fileName: file.name, reason: 'ไม่ใช่ไฟล์คะแนนเก็บ (ไม่มีแผ่นงาน "ผลสัมฤทธิ์")' }); continue; }
      const m = sheetMatrix(window.XLSX, wb.Sheets[name]);
      ok.push({ fileName: file.name, parsed: parseAchievement(m), d2: m[1]?.[3] ?? null });
    } catch (err) { skipped.push({ fileName: file.name, reason: err.message }); }
  }
  return { ok, skipped };
}

const overlay = (html) => {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  return wrap;
};

const sumScores = (arr) => arr.reduce((a, v) => a + (v ?? 0), 0);
const fmt = (n) => (n === null || n === undefined ? '–' : Math.round(n * 100) / 100);

// ---------- ปุ่ม "ดู": เทียบไฟล์นี้กับวิชาเดิมในระบบ หรือกับไฟล์ที่ซ้ำกันในชุด ----------
async function compare(ctx, row, st, rows) {
  const file = row.parsed;
  let left; let leftTitle;
  if (st.kind === 'dup') {
    const o = rows[st.dupOf].parsed;
    leftTitle = `ไฟล์ ${rows[st.dupOf].fileName}`;
    left = { items: o.items, ratio: `${o.midRatio}:${o.finalRatio}`, students: o.students.map((s) => ({ key: nameKey(s.name), name: s.name, sum: sumScores(s.scores), final: s.final })) };
  } else {
    const k = st.course;
    leftTitle = `ในระบบ: ${ctx.courseLabel(ctx.courseById[k.id] || k)}`;
    const [items, roster] = await Promise.all([ctx.db.select('assessment_items', { eq: { course_id: k.id } }), getRoster(ctx.db, k.classroom_id)]);
    const sc = items.filter((i) => i.kind === 'score').sort((a, b) => a.sort_order - b.sort_order);
    const fi = items.filter((i) => i.kind === 'final');
    const scores = items.length ? await ctx.db.select('item_scores', { in: { item_id: items.map((i) => i.id) } }) : [];
    const by = (ids, sid) => { const xs = scores.filter((x) => ids.includes(x.item_id) && x.student_id === sid && x.score !== null); return xs.length ? sumScores(xs.map((x) => Number(x.score))) : null; };
    left = { items: sc.map((i) => ({ title: i.title || i.code || '', max: Number(i.max_score) })), ratio: `${k.midterm_ratio}:${k.final_ratio}`,
      students: roster.map((s) => ({ key: nameKey(fullName(s)), name: fullName(s), sum: by(sc.map((i) => i.id), s.id), final: by(fi.map((i) => i.id), s.id) })) };
  }
  const right = file.students.map((s) => ({ key: nameKey(s.name), name: s.name, sum: sumScores(s.scores), final: s.final }));
  const keys = [...new Set([...left.students.map((s) => s.key), ...right.map((s) => s.key)])];
  const L = new Map(left.students.map((s) => [s.key, s])); const R = new Map(right.map((s) => [s.key, s]));
  const diff = (a, b) => (a?.sum ?? null) !== (b?.sum ?? null) || (a?.final ?? null) !== (b?.final ?? null);
  const nDiff = keys.filter((k) => diff(L.get(k), R.get(k))).length;
  const items = (xs) => (xs.length ? esc(xs.map((i) => `${i.title} (${i.max})`).join(', ')) : '<span class="muted">ไม่มี</span>');
  const wrap = overlay(`
    <h3>เทียบก่อนตัดสินใจ</h3>
    <div class="small">
      <p><b>${esc(leftTitle)}</b> · สัดส่วน ${left.ratio}<br>ช่องคะแนนเก็บ: ${items(left.items)}</p>
      <p><b>ไฟล์ ${esc(row.fileName)}</b> · สัดส่วน ${file.midRatio}:${file.finalRatio}<br>ช่องคะแนนเก็บ: ${items(file.items)}</p>
      <p>${nDiff ? `<span class="chip chip-warn">ต่างกัน ${nDiff} คน</span>` : '<span class="chip chip-ok">คะแนนรวมตรงกันทุกคน</span>'}</p>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>นักเรียน</th><th class="n">เก็บ (เดิม)</th><th class="n">เก็บ (ไฟล์)</th><th class="n">ปลายภาค (เดิม)</th><th class="n">ปลายภาค (ไฟล์)</th></tr></thead><tbody>
      ${keys.map((k) => { const a = L.get(k); const b = R.get(k); const d = diff(a, b);
        return `<tr${d ? ' style="background:var(--amber-wash)"' : ''}><td>${esc((a || b).name)}</td><td class="n">${fmt(a?.sum)}</td><td class="n">${fmt(b?.sum)}</td><td class="n">${fmt(a?.final)}</td><td class="n">${fmt(b?.final)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="modal-actions"><button type="button" class="btn btn-primary" data-x>ปิด</button></div>`);
  wrap.querySelector('[data-x]').addEventListener('click', () => wrap.remove());
}

// ---------- ตารางตรวจ ----------
export async function subjectImportFlow(ctx, fileList) {
  if (!ctx.term) throw new Error('ยังไม่ได้ตั้งภาคเรียนปัจจุบัน');
  const { ok, skipped } = await readFiles([...fileList]);
  if (!ok.length) throw new Error(skipped.length ? `ไม่มีไฟล์คะแนนที่อ่านได้: ${skipped.map((s) => `${s.fileName} (${s.reason})`).join(', ')}` : 'ไม่ได้เลือกไฟล์');
  const rows = buildRows(ok, ctx);
  const state = () => rows.map((_, i) => rowStatus(rows, i, ctx));
  const rosters = new Map();
  const roster = (id) => { if (!rosters.has(id)) rosters.set(id, getRoster(ctx.db, id)); return rosters.get(id); };

  return new Promise((resolve) => {
    const wrap = overlay(`
      <h3>นำเข้าจากไฟล์คะแนน · ภาคเรียนที่ ${ctx.term.term}/${ctx.term.academic_year}</h3>
      <p class="small muted" style="margin:0">ตรวจรหัสวิชา ชื่อวิชา และห้องก่อนนำเข้า · วิชาที่ยังไม่มีจะถูกสร้างเป็นวิชาพื้นฐาน (แก้ทีหลังได้ที่ตารางรายวิชา) · สัดส่วนคะแนนตามไฟล์</p>
      ${skipped.length ? `<div class="small"><b>ข้าม ${skipped.length} ไฟล์:</b><ul style="margin:4px 0">${skipped.map((s) => `<li>${esc(s.fileName)} — ${esc(s.reason)}</li>`).join('')}</ul></div>` : ''}
      <div class="tbl-wrap"><table class="tbl tbl-card"><thead><tr><th>ไฟล์</th><th>ห้อง</th><th>รหัสวิชา</th><th>ชื่อวิชา</th><th class="n">สัดส่วน</th><th class="n">นักเรียน</th><th>การทำงาน</th></tr></thead><tbody id="si-body"></tbody></table></div>
      <div class="modal-actions"><span class="small muted" id="si-sum" style="margin-right:auto"></span>
        <button type="button" class="btn btn-ghost" data-x>ยกเลิก</button><button type="button" class="btn btn-primary" id="si-go">นำเข้า</button></div>`);
    const body = wrap.querySelector('#si-body');
    const roomOpts = (sel) => `<option value="">— เลือกห้อง —</option>${ctx.classrooms.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(roomName(c))}</option>`).join('')}`;
    const actLabel = (st) => (st.kind === 'new' ? 'สร้างวิชาและนำเข้า' : st.kind === 'exists' ? 'แทนคะแนนเดิมด้วยไฟล์นี้' : 'นำเข้าไฟล์นี้ด้วย');
    const chip = (st, i) => (st.kind === 'exists' ? '<span class="chip chip-warn">มีวิชานี้ในห้องแล้ว</span>'
      : st.kind === 'dup' ? `<span class="chip chip-warn">ซ้ำกับแถว ${st.dupOf + 1}</span>` : rows[i].matchedBy ? '<span class="chip chip-ok">พบวิชาในระบบ</span>' : '<span class="chip">วิชาใหม่</span>');

    let sts = [];
    function draw() {
      sts = state();
      sts.forEach((st, i) => { const r = rows[i]; if (r.kindSeen !== st.kind) { r.kindSeen = st.kind; r.action = defaultAction(st); } });
      body.innerHTML = rows.map((r, i) => { const st = sts[i]; const bad = (f) => (st.missing.includes(f) && r.action === 'import' ? ' style="border-color:var(--red)"' : '');
        return `<tr data-i="${i}">
          <td class="tc-ttl"><span class="small">${i + 1}. ${esc(r.fileName)}</span> ${chip(st, i)}
            ${r.warnings.length ? `<div class="small" style="color:var(--red);font-weight:400">${r.warnings.map(esc).join('<br>')}</div>` : ''}</td>
          <td data-l="ห้อง"><select data-f="classroomId"${bad('ห้อง')}>${roomOpts(r.classroomId)}</select></td>
          <td data-l="รหัส"><input type="text" data-f="code" value="${esc(r.code)}" placeholder="เช่น ท22101" style="width:110px"${bad('รหัสวิชา')}></td>
          <td data-l="ชื่อ"><input type="text" data-f="name" value="${esc(r.name)}" style="min-width:150px"${bad('ชื่อวิชา')}></td>
          <td class="n" data-l="สัดส่วน">${r.parsed.midRatio}:${r.parsed.finalRatio}<div class="small muted">${r.parsed.items.length} ช่อง</div></td>
          <td class="n" data-l="นักเรียน" data-m="${i}">…</td>
          <td class="tc-act"><select data-f="action"><option value="import" ${r.action === 'import' ? 'selected' : ''}>${actLabel(st)}</option><option value="skip" ${r.action === 'skip' ? 'selected' : ''}>ข้าม</option></select>
            ${st.kind !== 'new' ? `<button type="button" class="btn btn-sm" data-view="${i}">ดู</button>` : ''}</td></tr>`; }).join('');
      const go = rows.filter((r) => r.action === 'import').length;
      wrap.querySelector('#si-sum').textContent = `นำเข้า ${go} · ข้าม ${rows.length - go} ไฟล์`;
      rows.forEach(async (r, i) => {
        const td = body.querySelector(`[data-m="${i}"]`); if (!td) return;
        if (!r.classroomId) { td.textContent = '–'; return; }
        try { const p = planImport(r.parsed, await roster(r.classroomId), fullName);
          td.innerHTML = `<span style="${p.matched.length < r.parsed.students.length ? 'color:var(--red)' : ''}">${p.matched.length}/${r.parsed.students.length}</span>`;
        } catch { td.textContent = '?'; }
      });
    }
    body.addEventListener('change', (e) => {
      const f = e.target.dataset.f; if (!f) return;
      const r = rows[Number(e.target.closest('tr').dataset.i)];
      r[f] = f === 'code' ? e.target.value.replace(/\s/g, '') : e.target.value;
      draw();
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]'); if (!b) return;
      const i = Number(b.dataset.view);
      compare(ctx, rows[i], sts[i], rows).catch((err) => toast(err.message, 'err'));
    });
    const close = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-x]').addEventListener('click', () => close(null));
    wrap.querySelector('#si-go').addEventListener('click', async () => {
      const todo = rows.map((r, i) => ({ r, st: sts[i], i })).filter((x) => x.r.action === 'import');
      if (!todo.length) return toast('ไม่ได้เลือกไฟล์ที่จะนำเข้า');
      const miss = todo.filter((x) => x.st.missing.length);
      if (miss.length) return toast(`กรอกให้ครบก่อน: ${miss.map((x) => `แถว ${x.i + 1} (${x.st.missing.join(', ')})`).join(' · ')}`, 'err');
      wrap.querySelectorAll('button, select, input').forEach((el) => { el.disabled = true; });
      const sum = wrap.querySelector('#si-sum');
      resolve(await save(ctx, todo.map((x) => x.r), (t) => { sum.textContent = t; }).finally(() => wrap.remove()));
    });
    draw();
  });
}

// ---------- บันทึก: ทีละไฟล์ตามลำดับ (แถวหลังที่เป็นวิชา/ห้องเดียวกันจะแทนคะแนนของแถวก่อน) ----------
async function save(ctx, rows, progress) {
  const subjects = [...ctx.subjects]; const courses = [...ctx.courses];
  const out = { created: 0, opened: 0, imported: 0, errors: [] };
  for (const [n, r] of rows.entries()) {
    progress(`กำลังนำเข้า ${n + 1}/${rows.length}: ${r.name}`);
    try {
      const room = ctx.classroomById[r.classroomId];
      let subject = subjects.find((s) => s.code === r.code);
      if (!subject) {
        [subject] = await ctx.db.insert('subjects', [{ code: r.code, name: r.name.trim(), subject_type: 'พื้นฐาน', level: room.level }]);
        subjects.push(subject); out.created++;
      }
      let course = courses.find((k) => k.subject_id === subject.id && k.classroom_id === room.id);
      if (!course) {
        const [mid, fin] = courseRatio(r.parsed);
        const order = (await inheritedOrder(ctx, room, ctx.term.id, subject.id)) ?? courses.filter((k) => k.classroom_id === room.id).reduce((m, k) => Math.max(m, k.sort_order || 0), 0) + 1;
        [course] = await ctx.db.insert('courses', [{ subject_id: subject.id, classroom_id: room.id, term_id: ctx.term.id, midterm_ratio: mid, final_ratio: fin, sort_order: order }]);
        courses.push(course); out.opened++;
      }
      const plan = planImport(r.parsed, await getRoster(ctx.db, room.id), fullName);
      if (plan.matched.length) {
        const items = await ctx.db.select('assessment_items', { eq: { course_id: course.id } });
        await applyImport(ctx, course, plan, items);
        course.midterm_ratio = r.parsed.midRatio; course.final_ratio = r.parsed.finalRatio;
        out.imported++;
      } else out.errors.push(`${r.fileName}: สร้างวิชาแล้ว แต่ไม่พบนักเรียนที่ตรงกับห้อง ${roomName(room)} จึงยังไม่นำเข้าคะแนน`);
    } catch (err) { out.errors.push(`${r.fileName}: ${err.message}`); }
  }
  return out;
}
