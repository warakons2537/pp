// =====================================================================
//  ตั้งค่าระบบ → รายวิชา → นำเข้าตัวชี้วัดจากเล่ม ปพ.5-6 เดิม
//  อ่านรหัสวิชา (แผ่น "รายวิชา") + หัวคอลัมน์ตัวชี้วัด (แผ่น "วิชาที่ n" แถว 5) → ตารางตรวจ
//  → เพิ่มลงตัวชี้วัดกลางของรายวิชา (เฉพาะตัวที่ยังไม่มี) แล้วใส่ลงทุกห้องที่เปิดสอนในภาคเรียนนี้
// =====================================================================
import { esc, modal } from '../util.js?v=2569.10.31-6';
import { sheetMatrix } from '../achievement-import.js?v=2569.10.31-6';
import { parseBookIndicators, planBookImport, syncSubject } from '../indicators.js?v=2569.10.31-6';

export async function indicatorImportFlow(ctx, file) {
  if (!window.XLSX) throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้า');
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const want = new Set(['รายวิชา', ...Array.from({ length: 20 }, (_, i) => `วิชาที่ ${i + 1}`)]);
  const sheets = Object.fromEntries(wb.SheetNames.filter((n) => want.has(n)).map((n) => [n, sheetMatrix(window.XLSX, wb.Sheets[n])]));
  const parsed = parseBookIndicators(sheets);
  if (!parsed.subjects.length) throw new Error('ไฟล์นี้ยังไม่มีรายวิชาหรือตัวชี้วัด');

  const master = await ctx.db.select('subject_indicators');
  const bySubject = {};
  for (const m of master) (bySubject[m.subject_id] ??= []).push(m);
  const rows = planBookImport(parsed, ctx.subjects, bySubject);

  const note = (r) => [
    !r.subject && (r.code ? 'ไม่พบรหัสวิชานี้ในระบบ' : 'ไม่มีรหัสวิชา'),
    r.conflict && `รหัสซ้ำกับวิชาที่ ${r.conflict} ในไฟล์ (เลือกได้ทีละแถว)`,
    r.subject && !r.fresh.length && r.codes.length && 'มีครบแล้ว',
    !r.codes.length && 'ไม่มีตัวชี้วัด',
    r.levelWarn.length && `ชั้นไม่ตรงกับวิชา: ${r.levelWarn.join(', ')}`,
    r.dup.length && `ซ้ำในไฟล์ (ข้าม): ${r.dup.join(', ')}`,
  ].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join('');

  const res = await modal('นำเข้าตัวชี้วัดจากเล่ม ปพ.5-6', `
    <p class="small muted" style="margin:0">ไฟล์: ${esc(file.name)} · ${esc(parsed.level)}${parsed.term ? ` ภาคเรียนที่ ${esc(parsed.term)}` : ''}
      · จับคู่ด้วยรหัสวิชา · เพิ่มเฉพาะตัวที่รายวิชายังไม่มี แล้วใส่ลงทุกห้องที่เปิดสอนวิชานั้นในภาคเรียนนี้ · รหัสจัดรูปแบบให้อัตโนมัติ ไม่แตกช่วง</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>นำเข้า</th><th>ในไฟล์</th><th>วิชาในระบบ</th><th class="n">ใหม่ / ทั้งหมด</th><th>หมายเหตุ</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${r.subject && r.fresh.length ? `<input type="checkbox" name="r_${r.n}" aria-label="นำเข้าวิชาที่ ${r.n}" ${r.pick ? 'checked' : ''}>` : ''}</td>
        <td>วิชาที่ ${r.n}<div class="small">${esc(r.code)} ${esc(r.name)}</div></td>
        <td class="small">${r.subject ? `${esc(r.subject.code)} ${esc(r.subject.name)}` : '—'}</td>
        <td class="n">${r.fresh.length} / ${r.codes.length}</td>
        <td class="small">${note(r)}</td></tr>`).join('')}
    </tbody></table></div>`, { okText: 'นำเข้า', wide: true });
  if (!res) return null;

  const picked = rows.filter((r) => res[`r_${r.n}`] && r.subject && r.fresh.length);
  const seen = new Set(); const errors = [];
  let done = 0; let added = 0; let synced = 0; let rooms = 0;
  for (const r of picked) {
    if (seen.has(r.subject.id)) { errors.push(`วิชาที่ ${r.n}: เลือกรหัสวิชาเดียวกันซ้ำ จึงข้าม`); continue; }
    seen.add(r.subject.id);
    try {
      let order = (bySubject[r.subject.id] || []).reduce((m, x) => Math.max(m, x.sort_order || 0), 0);
      await ctx.db.insert('subject_indicators', r.fresh.map((code) => ({ subject_id: r.subject.id, code, title: null, sort_order: ++order })));
      added += r.fresh.length;
      const s = await syncSubject(ctx, r.subject.id); synced += s.added; rooms += s.rooms; done++;
    } catch (err) { errors.push(`วิชาที่ ${r.n} (${r.subject.code}): ${err.message}`); }
  }
  return { subjects: done, added, synced, rooms, errors };
}
