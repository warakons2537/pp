// =====================================================================
//  รหัสผ่าน: เปลี่ยนรหัสของตัวเอง · ลืมรหัสผ่าน (ส่งลิงก์ทางอีเมล) · ผู้ดูแลตั้งรหัสใหม่ให้ครู
//  บัญชีชุดเดียวกับแอปในเครือทุกตัว (Supabase โครงการเดียวกัน) เปลี่ยนที่นี่ใช้ได้ทุกแอป
// =====================================================================
import { esc, modal, toast } from './util.js?v=2569.11.1-46';

const fields = `<label>รหัสผ่านใหม่<input type="password" name="pw" minlength="6" maxlength="72" autocomplete="new-password" required></label>
  <label>ยืนยันรหัสผ่านใหม่<input type="password" name="pw2" minlength="6" maxlength="72" autocomplete="new-password" required></label>`;

// ถามรหัสใหม่ 2 ครั้งจนตรงกัน แล้วส่งให้ save() · ยกเลิก → false
async function askNew(title, note, save, { cancelText } = {}) {
  for (;;) {
    const r = await modal(title, `${note ? `<p class="small muted" style="margin:0">${note}</p>` : ''}${fields}`,
      { okText: 'บันทึกรหัสผ่าน', ...(cancelText !== undefined ? { cancelText } : {}) });
    if (!r) return false;
    if (r.pw !== r.pw2) { toast('รหัสผ่านทั้ง 2 ช่องไม่ตรงกัน', 'err'); continue; }
    try { await save(r.pw); return true; } catch (err) { toast(err.message, 'err'); }
  }
}

export async function changeOwnPassword(db) {
  const done = await askNew('เปลี่ยนรหัสผ่าน', 'ใช้กับแอปในเครือ WL ทุกตัว (บัญชีเดียวกัน)', (pw) => db.auth.updatePassword(pw));
  if (done) toast('เปลี่ยนรหัสผ่านแล้ว');
}

// เปิดจากลิงก์ในอีเมล: ต้องตั้งรหัสใหม่ก่อนใช้งานต่อ
export async function finishRecovery(db) {
  const done = await askNew('ตั้งรหัสผ่านใหม่', 'คุณเปิดจากลิงก์ "ลืมรหัสผ่าน" กรุณาตั้งรหัสผ่านใหม่', (pw) => db.auth.updatePassword(pw), { cancelText: '' });
  if (done) toast('ตั้งรหัสผ่านใหม่แล้ว');
}

export async function forgotPassword(db, email = '') {
  const r = await modal('ลืมรหัสผ่าน', `<p class="small muted" style="margin:0">กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ (ถ้าไม่ได้รับอีเมล ให้ดูในจดหมายขยะ หรือขอให้ผู้ดูแลระบบตั้งรหัสให้)</p>
    <label>อีเมล<input type="email" name="email" autocomplete="username" required value="${esc(email)}"></label>`, { okText: 'ส่งลิงก์' });
  if (!r) return;
  try { await db.auth.resetPassword(r.email.trim()); toast('ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว กรุณาเปิดอีเมล'); }
  catch (err) { toast(err.message, 'err'); }
}

export async function adminSetPassword(db, p) {
  const done = await askNew(`ตั้งรหัสผ่านให้ ${p.full_name || p.email || ''}`.trim(),
    `บัญชี ${esc(p.email || '')} · แจ้งรหัสใหม่ให้เจ้าของบัญชีเอง แล้วให้เปลี่ยนเป็นรหัสของตัวเองหลังเข้าสู่ระบบ`,
    (pw) => db.rpc('admin_set_password', { p_user: p.id, p_password: pw }));
  if (done) toast('ตั้งรหัสผ่านใหม่แล้ว');
}
