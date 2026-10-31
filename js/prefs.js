// การแสดงผลที่ผู้ใช้เลือกเอง: ธีม (อัตโนมัติ/สว่าง/มืด) และขนาดตัวอักษร · จำเฉพาะเครื่องนี้ (localStorage)
// index.html ใส่ค่าเหล่านี้ตั้งแต่ก่อนวาดหน้า เพื่อไม่ให้จอกะพริบ
export const THEMES = { auto: 'ตามเครื่อง', light: 'สว่าง', dark: 'มืด' };
export const SIZES = { 1: 'ปกติ', 1.125: 'ใหญ่', 1.25: 'ใหญ่มาก' };
const K = { theme: 'wl-theme', size: 'wl-fs' };

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* เครื่องไม่ให้จำค่า */ } };

export const getPrefs = () => {
  const theme = read(K.theme); const size = read(K.size);
  return { theme: THEMES[theme] && theme !== 'auto' ? theme : 'auto', size: SIZES[size] ? String(size) : '1' };
};

export function applyPrefs({ theme, size } = getPrefs()) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  root.style.setProperty('--fs', SIZES[size] ? size : '1');
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101410' : '#0a4a26');
}

export function setPref(key, value) {
  write(K[key], key === 'theme' && value === 'auto' ? null : String(value));
  applyPrefs();
}

// หน้าต่างตั้งค่าการแสดงผล (เปลี่ยนแล้วเห็นผลทันที)
export function openPrefs() {
  const p = getPrefs();
  const group = (name, label, opts, cur) => `<fieldset class="pref-set"><legend>${label}</legend>
    ${Object.entries(opts).map(([v, t]) => `<label class="pref-opt"><input type="radio" name="${name}" value="${v}" ${String(cur) === String(v) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>`;
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="การแสดงผล">
    <h3>การแสดงผล</h3>
    ${group('theme', 'ธีม', THEMES, p.theme)}
    ${group('size', 'ขนาดตัวอักษร', SIZES, p.size)}
    <p class="small muted" style="margin:0">จำเฉพาะเครื่องนี้ ไม่กระทบเครื่องอื่นหรือผู้ใช้คนอื่น</p>
    <div class="modal-actions"><button type="button" class="btn btn-primary" data-x>เสร็จ</button></div></div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('change', (e) => { if (e.target.name) setPref(e.target.name, e.target.value); });
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
  wrap.querySelector('input:checked')?.focus();
}
