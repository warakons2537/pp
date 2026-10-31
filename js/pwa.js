// ลงทะเบียน service worker + แถบ "มีเวอร์ชันใหม่" (กดแล้วค่อยอัปเดต จะได้ไม่รีเฟรชกลางการกรอกข้อมูล)
import { esc } from './util.js?v=2569.10.31-12';

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !/[?&]sw=1/.test(location.search)) return;            // ตอนพัฒนา/ทดสอบบนเครื่อง ไม่ใช้แคช (เว้นแต่ใส่ ?sw=1)
  let asked = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (asked) location.reload(); });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (w) => showUpdate(() => { asked = true; w.postMessage('skip'); });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => { /* ใช้งานต่อได้ตามปกติ แค่ไม่มีแคช */ });
}

function showUpdate(apply) {
  if (document.getElementById('update-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar'; bar.className = 'update-bar no-print'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<span>${esc('มีเวอร์ชันใหม่ของแอป')}</span><button class="btn btn-sm" type="button">อัปเดตตอนนี้</button>`;
  bar.querySelector('button').addEventListener('click', () => { bar.querySelector('button').disabled = true; apply(); });
  document.body.appendChild(bar);
}
