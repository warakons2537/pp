// ชั้นออฟไลน์ของฐานข้อมูล (ใช้เมื่อเชื่อม Supabase จริง) ครอบ API เดิมของ db โดยหน้าจอไม่ต้องแก้
//  1) อ่านข้อมูล: จำผลที่เคยอ่านสำเร็จไว้ในเครื่อง (IndexedDB) ถ้าเน็ตหลุดจะตอบจากที่จำไว้
//  2) เข้าสู่ระบบ: ถ้าเน็ตหลุดและโทเค็นหมดอายุ ใช้ตัวตนที่จำไว้เปิดแอปต่อได้ (ออกจากระบบแล้วจะลบทั้งหมด)
//  3) บันทึก: เช็กชื่อรายวัน/รายคาบ/เช็กอาหาร ถ้าส่งไม่ได้จะเก็บคิวไว้ในเครื่องแล้วส่งเองเมื่อมีสัญญาณ (ค่าล่าสุดชนะ)
//     ส่วนอื่น (คะแนน 0 ร มส ตั้งค่า) ต้องออนไลน์ เพราะมีการตรวจเงื่อนไขมากกว่า
export const QUEUE_TABLES = new Set(['daily_attendance', 'period_attendance', 'meal_checks']);

const NET = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timeout|ขาดการเชื่อมต่อ/i;
export const isNetworkError = (err) => (typeof navigator !== 'undefined' && navigator.onLine === false) || NET.test(String(err?.message || err));
const AUTH = /jwt|token|unauthorized|not authenticated|PGRST30|invalid claim/i;
export const isAuthError = (err) => AUTH.test(String(err?.message || err));

const stable = (v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
export const readKey = (...parts) => `r:${stable(parts)}`;

// ---- แถวตรงกับเงื่อนไขของ select ไหม ----
const same = (a, b) => String(a) === String(b);
export function matches(row, o = {}) {
  return Object.entries(o.eq || {}).every(([k, v]) => same(row[k], v))
    && Object.entries(o.in || {}).every(([k, v]) => v.some((x) => same(row[k], x)))
    && Object.entries(o.gte || {}).every(([k, v]) => row[k] >= v)
    && Object.entries(o.lte || {}).every(([k, v]) => row[k] <= v);
}
const matchAll = (row, m) => Object.entries(m).every(([k, v]) => same(row[k], v));

// ซ้อนการบันทึกที่ยังค้างในคิวทับผลที่อ่านมา (ให้หน้าจอเห็นสิ่งที่เพิ่งกรอกแม้ยังไม่ได้ส่ง)
export function overlay(table, rows, opts, queue) {
  const ops = queue.filter((q) => q.table === table);
  if (!ops.length) return rows;
  let out = rows.map((r) => ({ ...r }));
  for (const op of ops) {
    if (op.kind === 'remove') out = out.filter((r) => !matchAll(r, op.args[0]));
    else if (op.kind === 'update') out.forEach((r) => { if (matchAll(r, op.args[0])) Object.assign(r, op.args[1]); });
    else {
      const keys = op.kind === 'upsert' && op.args[1] ? op.args[1].split(',') : null;
      for (const nr of op.args[0]) {
        const i = keys ? out.findIndex((r) => keys.every((k) => same(r[k], nr[k]))) : -1;
        const merged = i >= 0 ? { ...out[i], ...nr } : { ...nr };
        if (i >= 0) out.splice(i, 1);
        if (matches(merged, opts)) out.push(merged);
      }
    }
  }
  return out;
}

export function createOffline(base, { kv, probe, emit = () => {}, uuid = () => crypto.randomUUID() }) {
  let queue = []; let currentUid = null; let flushing = false; let timer = null;
  const ready = (async () => { try { queue = (await kv.get('q')) || []; } catch { queue = []; } emit('queue', queue.length); })();
  const persist = async () => { try { await kv.set('q', queue); } catch { /* พื้นที่เต็ม: คิวยังอยู่ในหน่วยความจำ */ } emit('queue', queue.length); };
  const mine = () => queue.filter((q) => q.uid === currentUid);

  // ---- อ่าน ----
  const cached = async (key, load, table, opts) => {
    await ready;
    try { const rows = await load(); kv.set(key, rows).catch(() => {}); return table ? overlay(table, rows, opts, queue) : rows; }
    catch (err) {
      if (!isNetworkError(err)) throw err;
      const hit = await kv.get(key).catch(() => null);
      if (hit) return table ? overlay(table, hit, opts, queue) : hit;
      throw new Error('ออฟไลน์ และยังไม่มีข้อมูลหน้านี้เก็บไว้ในเครื่อง — ต้องเปิดหน้านี้ตอนมีอินเทอร์เน็ตก่อนหนึ่งครั้ง');
    }
  };

  // ---- ส่งคิว ----
  async function overwrites(op) {
    if (op.kind !== 'upsert' || !QUEUE_TABLES.has(op.table)) return 0;
    const rows = op.args[0]; const keys = (op.args[1] || '').split(',').filter(Boolean);
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    if (!keys.length || !dates.length) return 0;
    const ex = await base.select(op.table, { in: { student_id: [...new Set(rows.map((r) => r.student_id))] }, gte: { date: dates[0] }, lte: { date: dates.at(-1) } });
    const at = new Date(op.at).toISOString();
    return rows.filter((r) => ex.some((e) => keys.every((k) => same(e[k], r[k])) && e.status !== r.status && e.updated_at > at)).length;
  }
  async function flush() {
    await ready;
    if (flushing || !currentUid) return;
    flushing = true; let sent = 0; let over = 0; const failed = [];
    try {
      for (;;) {
        const op = queue.find((q) => q.uid === currentUid); if (!op) break;
        try { over += await overwrites(op); await base[op.kind](op.table, ...op.args); sent++; }
        catch (err) {
          if (isNetworkError(err)) break;
          if (isAuthError(err)) { emit('auth', mine().length); break; }     // เซสชันหมดอายุ: เก็บคิวไว้ ส่งต่อหลังเข้าสู่ระบบใหม่
          failed.push(err.message);                                        // ถูกปฏิเสธจริง (สิทธิ์/ข้อมูลไม่ถูกต้อง): ทิ้งรายการนั้นแล้วแจ้ง
        }
        queue.splice(queue.indexOf(op), 1); await persist();
      }
    } finally { flushing = false; }
    if (sent || failed.length) emit('synced', { sent, over, failed });
    if (mine().length) schedule(20000);
  }
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); };

  // ---- เขียน ----
  const result = (kind, args) => (kind === 'update' ? [] : kind === 'remove' ? null : JSON.parse(JSON.stringify(args[0])));
  const write = (kind) => async (table, ...args) => {
    if (!QUEUE_TABLES.has(table)) return base[kind](table, ...args);
    await ready;
    if (!mine().length) {
      try { return await base[kind](table, ...args); } catch (err) { if (!isNetworkError(err)) throw err; }
    }
    queue.push({ id: uuid(), at: Date.now(), uid: currentUid, kind, table, args: JSON.parse(JSON.stringify(args)) });
    await persist(); schedule(mine().length > 1 ? 4000 : 1500);
    return result(kind, args);
  };

  const auth = {
    ...base.auth,
    async session() {
      let s = null;
      // เน็ตหลุด + โทเค็นหมดอายุ: supabase-js จะลองต่ออายุซ้ำนานเกือบ 30 วินาที จึงรอแค่ไม่กี่วินาทีแล้วใช้ตัวตนที่จำไว้
      const wait = new Promise((r) => setTimeout(() => r('timeout'), (typeof navigator !== 'undefined' && navigator.onLine === false) ? 1200 : 6000));
      try { const r = await Promise.race([base.auth.session(), wait]); s = r === 'timeout' ? null : r; } catch { /* เน็ตหลุด */ }
      if (s) {
        const prev = await kv.get('user').catch(() => null);
        if (prev && prev.id !== s.user.id) await kv.clearPrefix('r:').catch(() => {});
        currentUid = s.user.id; kv.set('user', { id: s.user.id, email: s.user.email }).catch(() => {});
        schedule(1500);
        return s;
      }
      const u = await kv.get('user').catch(() => null);
      if (u && !(await probe())) { currentUid = u.id; return { user: { id: u.id, email: u.email }, offline: true }; }
      return null;
    },
    async signOut() {
      await ready; await flush().catch(() => {});
      if (mine().length) throw new Error(`ยังมีข้อมูลที่รอส่ง ${mine().length} รายการ ต้องมีอินเทอร์เน็ตเพื่อส่งก่อนออกจากระบบ`);
      await base.auth.signOut();
      currentUid = null; await kv.del('user').catch(() => {}); await kv.clearPrefix('r:').catch(() => {});
    },
  };

  return {
    ...base, auth,
    select: (table, opts = {}) => cached(readKey('s', table, opts), () => base.select(table, opts), table, opts),
    rpc: (name, args) => cached(readKey('rpc', name, args || {}), () => base.rpc(name, args), null),
    insert: write('insert'), upsert: write('upsert'), update: write('update'), remove: write('remove'),
    offline: { flush, pending: () => mine().length, queue: () => queue.slice() },
  };
}

// ---- ที่เก็บในเบราว์เซอร์ (IndexedDB) ----
export function idbKv(name = 'wl-offline', timeoutMs = 2500) {
  let dbp = null; let broken = false;                   // ที่เก็บค้าง/ใช้ไม่ได้ (เช่น โหมดส่วนตัว) = ข้ามไป ไม่ให้แอปรอ
  const open = () => (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => {
    if (broken) return Promise.reject(new Error('ที่เก็บข้อมูลในเครื่องใช้ไม่ได้'));
    const work = (async () => { const d = await open();
      return new Promise((res, rej) => { const t = d.transaction('kv', mode); const out = fn(t.objectStore('kv')); t.oncomplete = () => res(out?.result); t.onerror = () => rej(t.error); }); })();
    let timer;
    const limit = new Promise((_, rej) => { timer = setTimeout(() => { broken = true; rej(new Error('ที่เก็บข้อมูลในเครื่องไม่ตอบสนอง')); }, timeoutMs); });
    return Promise.race([work, limit]).finally(() => clearTimeout(timer));
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
    clearPrefix: (p) => tx('readwrite', (s) => s.delete(IDBKeyRange.bound(p, `${p}\uffff`))),
  };
}
