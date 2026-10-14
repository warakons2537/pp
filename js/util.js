// ---------- ตัวช่วยทั่วไป ----------
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const THAI_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// วันที่ในรูป 'YYYY-MM-DD' (ค.ศ.) โดยไม่เพี้ยนตามเขตเวลา
export const iso = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayIso = () => iso(new Date());

export const thaiDate = (s, short = false) => {
  if (!s) return '';
  const d = typeof s === 'string' ? fromIso(s.slice(0, 10)) : s;
  return `${d.getDate()} ${(short ? THAI_MONTHS_SHORT : THAI_MONTHS)[d.getMonth()]} ${d.getFullYear() + 543}`;
};

export const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();

// สถานะเวลาเรียน
export const STATUS = {
  present: { label: 'มา', mark: '/', cls: 'st-present' },
  late: { label: 'สาย', mark: 'ส', cls: 'st-late' },
  sick: { label: 'ป่วย', mark: 'ป', cls: 'st-sick' },
  leave: { label: 'ลา', mark: 'ล', cls: 'st-leave' },
  absent: { label: 'ขาด', mark: 'ข', cls: 'st-absent' },
};
export const STATUS_CYCLE = [null, 'present', 'late', 'sick', 'leave', 'absent'];
export const nextStatus = (s) => STATUS_CYCLE[(STATUS_CYCLE.indexOf(s ?? null) + 1) % STATUS_CYCLE.length];

export const LEVELS = ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
export const levelName = (lv) => ({
  'อ': 'อนุบาลปีที่ ', 'ป': 'ประถมศึกษาปีที่ ', 'ม': 'มัธยมศึกษาปีที่ ',
}[lv[0]] + lv.split('.')[1]);
export const roomName = (c) => (c ? `${c.level}/${c.room}` : '');

export const fullName = (s) => `${s.prefix ?? ''}${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();

export const sortByNumber = (a, b) =>
  (a.number ?? 999) - (b.number ?? 999) || String(a.first_name).localeCompare(String(b.first_name), 'th');

// ---------- แจ้งเตือน / กล่องโต้ตอบ ----------
export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, kind === 'err' ? 5000 : 2500);
}

export function modal(title, bodyHtml, { okText = 'บันทึก', cancelText = 'ยกเลิก', wide = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <form class="modal-body">${bodyHtml}
          <div class="modal-actions">
            ${cancelText ? `<button type="button" class="btn btn-ghost" data-x>${esc(cancelText)}</button>` : ''}
            <button type="submit" class="btn btn-primary">${esc(okText)}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const form = $('form', wrap);
    const close = (v) => { wrap.remove(); resolve(v); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      close(Object.fromEntries(new FormData(form).entries()));
    });
    $('[data-x]', wrap)?.addEventListener('click', () => close(null));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    setTimeout(() => $('input,select,textarea', form)?.focus(), 30);
  });
}

export const confirmBox = (msg, okText = 'ตกลง') =>
  modal('ยืนยัน', `<p>${esc(msg)}</p>`, { okText }).then((r) => r !== null);

export const options = (list, value, labelFn = (x) => x.label, valueFn = (x) => x.id) =>
  list.map((x) => `<option value="${esc(valueFn(x))}" ${String(valueFn(x)) === String(value ?? '') ? 'selected' : ''}>${esc(labelFn(x))}</option>`).join('');

export const groupBy = (arr, key) => arr.reduce((m, x) => ((m[x[key]] ??= []).push(x), m), {});
export const indexBy = (arr, key = 'id') => Object.fromEntries(arr.map((x) => [x[key], x]));
