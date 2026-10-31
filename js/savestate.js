// ติดตามการบันทึกทุกครั้งของแอป เพื่อแสดง "กำลังบันทึก… / บันทึกแล้ว / บันทึกไม่สำเร็จ" ที่มุมบน
let pending = 0; let failed = false; let savedAt = 0; let queued = 0;
window.addEventListener('wl-queue', (e) => { queued = e.detail; window.dispatchEvent(new CustomEvent('wl-save')); });
const emit = () => window.dispatchEvent(new CustomEvent('wl-save'));
export const saveState = () => ({ pending, failed, queued, justSaved: Date.now() - savedAt < 2000 });

export function trackWrites(db) {
  for (const m of ['insert', 'upsert', 'update', 'remove']) {
    const f = db[m]; if (typeof f !== 'function') continue;
    db[m] = (...args) => {
      pending++; emit();
      let p;
      try { p = Promise.resolve(f.apply(db, args)); } catch (err) { pending--; emit(); throw err; }
      return p.then((r) => { pending--; failed = false; savedAt = Date.now(); emit(); setTimeout(emit, 2100); return r; },
        (err) => { pending--; failed = true; emit(); throw err; });
    };
  }
}
