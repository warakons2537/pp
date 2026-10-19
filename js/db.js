// =====================================================================
//  ชั้นข้อมูล: ใช้ Supabase จริง หรือ "โหมดทดลอง" (เก็บในเบราว์เซอร์)
//  หน้าจอทุกหน้าเรียกผ่าน API ชุดเดียวกัน จึงสลับได้โดยไม่ต้องแก้หน้าจอ
// =====================================================================
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { seedDemo } from './demo-data.js';

const thaiError = (e) => {
  const m = String(e?.message || e);
  if (/row-level security|permission denied/i.test(m)) return new Error('ไม่มีสิทธิ์บันทึกข้อมูลส่วนนี้');
  if (/duplicate key/i.test(m)) return new Error('ข้อมูลซ้ำกับที่มีอยู่แล้ว');
  if (/Invalid login credentials/i.test(m)) return new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  if (/Email not confirmed/i.test(m)) return new Error('ยังไม่ได้ยืนยันอีเมล กรุณาเปิดลิงก์ในอีเมลก่อน');
  if (/Invalid path specified/i.test(m)) return new Error(`ที่อยู่ฐานข้อมูลไม่ถูกต้อง (แอปกำลังใช้ ${String(SUPABASE_URL).trim() || '(ว่าง)'}) ต้องเป็น https://xxxx.supabase.co เท่านั้น ถ้าแก้ config.js แล้ว ให้รอ 10 นาทีแล้วกด Ctrl+F5`);
  return e instanceof Error ? e : new Error(m);
};

// ---------------------------------------------------------------------
//  Supabase
// ---------------------------------------------------------------------
function supabaseDb() {
  if (/^sb_secret_/.test(SUPABASE_KEY)) throw new Error('js/config.js ใส่ Secret key ผิดช่อง ต้องใช้ Publishable key (sb_publishable_...) เท่านั้น');
  if (!window.supabase) throw new Error('โหลดไลบรารี supabase-js ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต แล้วรีเฟรชหน้า');
  // ใช้เฉพาะ https://xxxx.supabase.co — ตัด /rest/v1/ หรือ / ท้ายที่มักติดมาตอนคัดลอก
  let base;
  try { base = new URL(SUPABASE_URL.trim()).origin; } catch { throw new Error('SUPABASE_URL ใน js/config.js ไม่ใช่ที่อยู่เว็บที่ถูกต้อง ต้องเป็นแบบ https://xxxx.supabase.co'); }
  if (/(^|\.)supabase\.com$/.test(new URL(base).hostname)) throw new Error('SUPABASE_URL ใน js/config.js เป็นลิงก์หน้า Dashboard ต้องใช้ Project URL แบบ https://xxxx.supabase.co (ดูที่ Project Settings → Data API)');
  const client = window.supabase.createClient(base, SUPABASE_KEY.trim());
  const run = async (p) => { const { data, error } = await p; if (error) throw thaiError(error); return data; };
  const applyMatch = (q, match) => { for (const [k, v] of Object.entries(match)) q = q.eq(k, v); return q; };

  return {
    mode: 'supabase',
    auth: {
      async session() { const { data } = await client.auth.getSession(); return data.session ? { user: data.session.user } : null; },
      async signIn(email, password) { return run(client.auth.signInWithPassword({ email, password })); },
      async signUp(email, password, full_name) {
        return run(client.auth.signUp({ email, password, options: { data: { full_name } } }));
      },
      async signOut() { await client.auth.signOut(); },
      onChange(cb) { client.auth.onAuthStateChange((_e, s) => cb(s)); },
    },
    async select(table, { cols = '*', eq = {}, in: inn = {}, gte = {}, lte = {}, order } = {}) {
      const out = [];
      for (let from = 0; ; from += 1000) {           // Supabase คืนครั้งละไม่เกิน 1000 แถว
        let q = client.from(table).select(cols);
        for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
        for (const [k, v] of Object.entries(inn)) q = q.in(k, v.length ? v : ['00000000-0000-0000-0000-000000000000']);
        for (const [k, v] of Object.entries(gte)) q = q.gte(k, v);
        for (const [k, v] of Object.entries(lte)) q = q.lte(k, v);
        if (order) q = q.order(order[0], { ascending: order[1] !== 'desc' });
        const rows = await run(q.range(from, from + 999));
        out.push(...rows);
        if (rows.length < 1000) return out;
      }
    },
    insert: (t, rows) => run(client.from(t).insert(rows).select()),
    upsert: (t, rows, onConflict) => run(client.from(t).upsert(rows, { onConflict }).select()),
    update: (t, match, patch) => run(applyMatch(client.from(t).update(patch), match).select()),
    remove: (t, match) => run(applyMatch(client.from(t).delete(), match)),
    rpc: (name, args) => run(client.rpc(name, args)),
    subscribe(table, filter, cb) {
      const ch = client.channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table, ...(filter ? { filter: `${filter.col}=eq.${filter.val}` } : {}) },
          (p) => cb({ type: p.eventType, new: p.new, old: p.old }))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table },   // การลบกรองไม่ได้ จึงฟังแยก
          (p) => filter && cb({ type: 'DELETE', new: {}, old: p.old }))
        .subscribe();
      return () => client.removeChannel(ch);
    },
  };
}

// ---------------------------------------------------------------------
//  โหมดทดลอง: ข้อมูลอยู่ในเบราว์เซอร์นี้ + ส่งการเปลี่ยนแปลงข้ามแท็บแบบเรียลไทม์
// ---------------------------------------------------------------------
const DEMO_KEY = 'pp-demo-v4';

function demoDb() {
  let state;
  try { state = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { state = null; }
  if (!state) state = seedDemo();
  let sessionUser = null;
  try { sessionUser = JSON.parse(sessionStorage.getItem(DEMO_KEY + '-user') || 'null'); } catch { /* ไม่มี storage */ }

  const listeners = new Set();
  let bc = null;
  try { bc = new BroadcastChannel(DEMO_KEY); } catch { /* เบราว์เซอร์ไม่รองรับ */ }

  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch { /* เต็ม/ปิดไว้ */ } };
  const T = (t) => (state[t] ??= []);
  const emit = (table, type, row, remote = false) => {
    for (const l of listeners) if (l.table === table) l.fn({ table, type, row });
    if (!remote && bc) bc.postMessage({ table, type, row });
  };
  const applyRemote = ({ table, type, row }) => {
    const rows = T(table);
    const i = rows.findIndex((r) => sameRow(table, r, row));
    if (type === 'DELETE') { if (i >= 0) rows.splice(i, 1); } else if (i >= 0) rows[i] = row; else rows.push(row);
    emit(table, type, row, true);
  };
  if (bc) bc.onmessage = (e) => applyRemote(e.data);

  // คีย์หลักของแต่ละตาราง (ตารางที่ไม่มี id)
  const PK = {
    school_settings: ['id'], classroom_teachers: ['classroom_id', 'teacher_id'],
    course_teachers: ['course_id', 'teacher_id'], student_private: ['student_id'],
    item_scores: ['item_id', 'student_id'], course_results: ['course_id', 'student_id'],
    trait_scores: ['term_id', 'student_id', 'kind', 'item_no'], activity_results: ['term_id', 'student_id', 'activity'],
    homeroom_comments: ['term_id', 'student_id'], assess_detail: ['term_id', 'student_id', 'form', 'code'], growth_reference: ['ref_set', 'sex', 'basis', 'key', 'measure'],
  };
  const pk = (t) => PK[t] || ['id'];
  const sameRow = (t, a, b) => pk(t).every((k) => a[k] === b[k]);
  const match = (r, m) => Object.entries(m).every(([k, v]) => String(r[k]) === String(v));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const clone = (x) => JSON.parse(JSON.stringify(x));

  const withDefaults = (t, r) => {
    const row = { ...r };
    if (pk(t).includes('id') && !row.id) row.id = uuid();
    if ('updated_at' in row || ['daily_attendance', 'period_attendance', 'item_scores'].includes(t)) row.updated_at = new Date().toISOString();
    if (['daily_attendance', 'period_attendance', 'behavior_notes'].includes(t) && !row.recorded_by) row.recorded_by = sessionUser?.id;
    return row;
  };

  const write = (t, row, keys) => {
    const rows = T(t);
    const i = rows.findIndex((r) => keys.every((k) => String(r[k]) === String(row[k])));
    if (i >= 0) { rows[i] = { ...rows[i], ...row, id: rows[i].id ?? row.id }; emit(t, 'UPDATE', rows[i]); return rows[i]; }
    rows.push(row); emit(t, 'INSERT', row); return row;
  };

  // ฟังก์ชันสรุปผล (เหมือนใน schema.sql)
  const RPC = {
    daily_attendance_summary({ cid, d_from, d_to }) {
      const att = T('daily_attendance').filter((a) => a.classroom_id === cid && a.date >= d_from && a.date <= d_to);
      const days = new Set(att.map((a) => a.date)).size;
      return T('enrollments').filter((e) => e.classroom_id === cid).map((e) => {
        const mine = att.filter((a) => a.student_id === e.student_id);
        const c = (s) => mine.filter((a) => a.status === s).length;
        const came = c('present') + c('late');
        return { student_id: e.student_id, present: c('present'), late: c('late'), sick: c('sick'), leave: c('leave'),
          absent: c('absent'), school_days: days, pct: days ? Math.round(10000 * came / days) / 100 : null };
      });
    },
    course_attendance_summary({ crs }) {
      const course = T('courses').find((c) => c.id === crs);
      const att = T('period_attendance').filter((a) => a.course_id === crs);
      const slots = new Set(att.map((a) => a.date + '#' + a.period)).size;
      return T('enrollments').filter((e) => e.classroom_id === course?.classroom_id).map((e) => {
        const came = att.filter((a) => a.student_id === e.student_id && ['present', 'late'].includes(a.status)).length;
        const pct = slots ? Math.round(10000 * came / slots) / 100 : null;
        return { student_id: e.student_id, attended: came, total_periods: slots, pct, below_80: slots ? pct < 80 : false };
      });
    },
  };

  return {
    mode: 'demo',
    auth: {
      async session() { return sessionUser ? { user: sessionUser } : null; },
      async signIn(userId) {
        const p = T('profiles').find((x) => x.id === userId);
        sessionUser = { id: p.id, email: p.email };
        try { sessionStorage.setItem(DEMO_KEY + '-user', JSON.stringify(sessionUser)); } catch { /* */ }
      },
      async signUp() { throw new Error('โหมดทดลองไม่มีการสมัครสมาชิก'); },
      async signOut() { sessionUser = null; try { sessionStorage.removeItem(DEMO_KEY + '-user'); } catch { /* */ } },
      onChange() {},
      demoUsers: () => clone(T('profiles')),
    },
    async select(t, { eq = {}, in: inn = {}, gte = {}, lte = {}, order } = {}) {
      let rows = T(t).filter((r) => match(r, eq)
        && Object.entries(inn).every(([k, v]) => v.map(String).includes(String(r[k])))
        && Object.entries(gte).every(([k, v]) => r[k] >= v)
        && Object.entries(lte).every(([k, v]) => r[k] <= v));
      if (order) rows = [...rows].sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] === 'desc' ? -1 : 1));
      return clone(rows);
    },
    async insert(t, rows) { const out = rows.map((r) => write(t, withDefaults(t, r), pk(t))); save(); return clone(out); },
    async upsert(t, rows, onConflict) {
      const keys = onConflict ? onConflict.split(',').map((s) => s.trim()) : pk(t);
      const out = rows.map((r) => write(t, withDefaults(t, r), keys)); save(); return clone(out);
    },
    async update(t, m, patch) {
      const out = T(t).filter((r) => match(r, m)).map((r) => { Object.assign(r, patch); emit(t, 'UPDATE', r); return r; });
      save(); return clone(out);
    },
    async remove(t, m) {
      const rows = T(t); const gone = rows.filter((r) => match(r, m));
      state[t] = rows.filter((r) => !match(r, m));
      gone.forEach((r) => emit(t, 'DELETE', r)); save();
    },
    async rpc(name, args) { return clone(RPC[name](args)); },
    subscribe(table, filter, cb) {
      const l = { table, fn: ({ type, row }) => {
        if (filter && type !== 'DELETE' && String(row[filter.col]) !== String(filter.val)) return;
        cb({ type, new: type === 'DELETE' ? {} : row, old: type === 'DELETE' ? row : {} });
      } };
      listeners.add(l);
      return () => listeners.delete(l);
    },
    resetDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* */ } state = seedDemo(); save(); },
  };
}

function make() {
  if (!(SUPABASE_URL && SUPABASE_KEY)) return demoDb();
  try { return supabaseDb(); } catch (err) {
    document.getElementById('app').innerHTML = `<div class="login"><div class="card"><h2>เชื่อมต่อฐานข้อมูลไม่ได้</h2><p>${String(err.message).replace(/</g, '&lt;')}</p></div></div>`;
    throw err;
  }
}
export const db = make();
