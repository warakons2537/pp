import assert from 'node:assert/strict';
import { createOffline, overlay, matches, isNetworkError } from '../js/offline.js';

const mkKv = () => { const m = new Map(); return { m, get: async (k) => m.get(k), set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, del: async (k) => { m.delete(k); },
  clearPrefix: async (p) => { for (const k of [...m.keys()]) if (k.startsWith(p)) m.delete(k); } }; };

// ฐานข้อมูลจำลอง: online=false → ทุกอย่างโยน "Failed to fetch"
function fakeBase() {
  const b = { online: true, rows: { daily_attendance: [], meal_checks: [] }, calls: [], sessionUser: { id: 'u1', email: 'a@b' }, failWith: null };
  const net = () => { if (!b.online) throw new Error('TypeError: Failed to fetch'); if (b.failWith) throw new Error(b.failWith); };
  b.select = async (t, o = {}) => { net(); return b.rows[t].filter((r) => matches(r, o)).map((r) => ({ ...r })); };
  b.rpc = async (n) => { net(); return [{ n }]; };
  b.upsert = async (t, rows, keys) => { net(); b.calls.push(['upsert', t, rows.length]);
    for (const r of rows) { const k = keys.split(','); const i = b.rows[t].findIndex((x) => k.every((c) => x[c] === r[c])); if (i >= 0) b.rows[t][i] = { ...b.rows[t][i], ...r, updated_at: new Date().toISOString() }; else b.rows[t].push({ id: String(b.rows[t].length), ...r, updated_at: new Date().toISOString() }); } return rows; };
  b.remove = async (t, m) => { net(); b.calls.push(['remove', t]); b.rows[t] = b.rows[t].filter((r) => !Object.entries(m).every(([k, v]) => r[k] === v)); return null; };
  b.insert = async () => { net(); }; b.update = async () => { net(); return []; };
  b.auth = { session: async () => { net(); return b.sessionUser ? { user: b.sessionUser } : null; }, signOut: async () => { b.sessionUser = null; }, signIn: async () => {}, onChange() {} };
  return b;
}
const setup = async () => { const base = fakeBase(); const kv = mkKv(); const ev = [];
  const db = createOffline(base, { kv, probe: async () => base.online, emit: (t, d) => ev.push([t, d]), uuid: (() => { let i = 0; return () => `id${++i}`; })() });
  await db.auth.session(); return { base, kv, db, ev }; };

assert.ok(isNetworkError(new Error('TypeError: Failed to fetch')) && !isNetworkError(new Error('ไม่มีสิทธิ์บันทึกข้อมูลส่วนนี้')));

// 1) อ่านแล้วจำไว้ · เน็ตหลุดตอบจากที่จำ · ยังไม่เคยอ่านเลย = แจ้งชัดเจน
{ const { base, db } = await setup();
  base.rows.daily_attendance.push({ id: '1', student_id: 's1', classroom_id: 'c1', date: '2026-10-01', status: 'present' });
  const q = { eq: { classroom_id: 'c1' }, gte: { date: '2026-10-01' }, lte: { date: '2026-10-31' } };
  assert.equal((await db.select('daily_attendance', q)).length, 1); await db.rpc('x');
  base.online = false;
  assert.equal((await db.select('daily_attendance', q)).length, 1, 'ออฟไลน์ต้องได้ที่จำไว้');
  assert.equal((await db.select('daily_attendance', { eq: { classroom_id: 'zzz' } }).catch((e) => e.message)).includes('ยังไม่มีข้อมูล'), true);
  assert.deepEqual(await db.rpc('x'), [{ n: 'x' }]);
}

// 2) บันทึกตอนออฟไลน์ → เข้าคิว เห็นผลทันที → ส่งเองเมื่อออนไลน์ ตามลำดับ
{ const { base, db, ev } = await setup();
  const q = { eq: { classroom_id: 'c1' }, gte: { date: '2026-10-01' }, lte: { date: '2026-10-31' } };
  await db.select('daily_attendance', q);
  base.online = false;
  const row = { student_id: 's1', classroom_id: 'c1', date: '2026-10-02', status: 'present' };
  const r = await db.upsert('daily_attendance', [row], 'student_id,date'); assert.equal(r.length, 1);
  await db.upsert('daily_attendance', [{ ...row, status: 'sick' }], 'student_id,date');       // แก้ช่องเดิมอีกครั้ง
  await db.upsert('daily_attendance', [{ ...row, student_id: 's2', status: 'late' }], 'student_id,date');
  await db.remove('daily_attendance', { student_id: 's2', date: '2026-10-02' });
  assert.equal(db.offline.pending(), 4);
  const seen = await db.select('daily_attendance', q);
  assert.deepEqual(seen.map((x) => `${x.student_id}:${x.status}`), ['s1:sick'], 'ซ้อนผลในคิว: s1 = ป่วย, s2 ถูกลบ');
  assert.equal(ev.filter(([t]) => t === 'queue').at(-1)[1], 4);
  base.online = true; await db.offline.flush();
  assert.equal(db.offline.pending(), 0);
  assert.deepEqual(base.calls.map((c) => c[0]), ['upsert', 'upsert', 'upsert', 'remove'], 'ส่งตามลำดับเดิม');
  assert.deepEqual(base.rows.daily_attendance.map((x) => `${x.student_id}:${x.status}`), ['s1:sick']);
  assert.equal(ev.at(-1)[0], 'synced'); assert.equal(ev.at(-1)[1].sent, 4);
}

// 3) ตารางที่ไม่อยู่ในคิว ต้องออนไลน์ (ไม่แอบเก็บคิว)
{ const { base, db } = await setup(); base.online = false;
  await assert.rejects(() => db.update('students', { id: 1 }, { first_name: 'x' }), /Failed to fetch/);
  assert.equal(db.offline.pending(), 0);
}

// 4) เซสชัน: เน็ตหลุด+โทเค็นเสีย ใช้ตัวตนที่จำไว้ · ออกจากระบบไม่ได้ถ้ามีคิวค้าง
{ const { base, db, kv } = await setup();
  base.online = false; base.sessionUser = null;                    // ต่ออายุไม่ได้
  const s = await db.auth.session(); assert.equal(s.user.id, 'u1'); assert.equal(s.offline, true);
  await db.upsert('meal_checks', [{ student_id: 's1', classroom_id: 'c1', date: '2026-10-02', status: 'ate' }], 'student_id,date');
  await assert.rejects(() => db.auth.signOut(), /รอส่ง 1 รายการ/);
  base.online = true; base.sessionUser = { id: 'u1', email: 'a@b' };
  await db.offline.flush(); await db.auth.signOut();
  assert.equal(await kv.get('user'), undefined); assert.equal(db.offline.pending(), 0);
  // ออนไลน์จริงแต่ไม่มีเซสชัน = ต้องล็อกอิน (ไม่ใช้ตัวตนที่จำไว้)
  assert.equal(await db.auth.session(), null);
}

// 5) ส่งไม่ผ่านจริง = ทิ้งรายการแล้วแจ้ง · เซสชันหมดอายุ = เก็บคิวไว้
{ const { base, db, ev } = await setup(); base.online = false;
  await db.upsert('daily_attendance', [{ student_id: 's1', classroom_id: 'c1', date: '2026-10-03', status: 'present' }], 'student_id,date');
  base.online = true; base.failWith = 'JWT expired'; await db.offline.flush();
  assert.equal(db.offline.pending(), 1); assert.equal(ev.at(-1)[0], 'auth');
  base.failWith = 'new row violates row-level security'; await db.offline.flush();
  assert.equal(db.offline.pending(), 0); assert.equal(ev.at(-1)[1].failed.length, 1);
}

// 6) ผู้ใช้คนอื่นต้องไม่ส่งคิวของคนก่อน
{ const { base, db } = await setup(); base.online = false;
  await db.upsert('daily_attendance', [{ student_id: 's1', classroom_id: 'c1', date: '2026-10-03', status: 'present' }], 'student_id,date');
  base.online = true; base.sessionUser = { id: 'u2', email: 'c@d' }; await db.auth.session(); await db.offline.flush();
  assert.equal(base.calls.length, 0); assert.equal(db.offline.pending(), 0, 'u2 ไม่เห็นคิวของ u1');
  base.sessionUser = { id: 'u1', email: 'a@b' }; await db.auth.session(); await db.offline.flush();
  assert.equal(base.calls.length, 1, 'กลับมาเป็น u1 แล้วส่งต่อ');
}

// 7) แจ้งเมื่อทับข้อมูลที่ผู้อื่นแก้ระหว่างออฟไลน์
{ const { base, db, ev } = await setup(); base.online = false;
  await db.upsert('daily_attendance', [{ student_id: 's1', classroom_id: 'c1', date: '2026-10-05', status: 'present' }], 'student_id,date');
  base.rows.daily_attendance.push({ id: 'x', student_id: 's1', classroom_id: 'c1', date: '2026-10-05', status: 'absent', updated_at: new Date(Date.now() + 1000).toISOString() });
  base.online = true; await db.offline.flush();
  assert.equal(ev.at(-1)[1].over, 1);
}

// 8) ข้อมูลส่วนบุคคลที่ไม่ได้ล็อกอิน (นักเรียนตรวจผลเอง) ต้องไม่ถูกจำไว้ในเครื่อง
{ const { base, db, kv } = await setup();
  await db.rpc('remedial_lookup', { p_code: '123' }); await db.rpc('x');
  const keys = [...kv.m.keys()].filter((k) => k.startsWith('r:'));
  assert.equal(keys.some((k) => k.includes('remedial_lookup')), false); assert.equal(keys.length, 1);
}

// overlay: ไม่แตะแถวนอกเงื่อนไข
assert.deepEqual(overlay('daily_attendance', [], { eq: { classroom_id: 'c1' } }, [{ table: 'daily_attendance', kind: 'upsert', args: [[{ student_id: 's', classroom_id: 'OTHER', date: 'd' }], 'student_id,date'] }]), []);
console.log('offline ok');
