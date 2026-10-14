import { db } from './db.js';
import { esc, $, $$, toast, indexBy, roomName } from './util.js';
import { icon } from './icons.js';
import * as home from './views/home.js';
import * as students from './views/students.js';
import * as daily from './views/daily.js';
import * as period from './views/period.js';
import * as reports from './views/reports.js';
import * as setup from './views/setup.js';
import * as scores from './views/scores.js';
import * as health from './views/health.js';
import * as traits from './views/traits.js';
import * as print from './views/print.js';

const VIEWS = { home, students, daily, period, reports, setup, scores, health, traits, print };
const root = document.getElementById('app');
let cleanup = null;

// ---------------------------------------------------------------------
// ข้อมูลกลางที่ทุกหน้าจอใช้ร่วมกัน
// ---------------------------------------------------------------------
async function loadContext(userId) {
  const [profiles, settingsRows, terms] = await Promise.all([
    db.select('profiles', { order: ['full_name'] }),
    db.select('school_settings'),
    db.select('terms', { order: ['academic_year', 'desc'] }),
  ]);
  const me = profiles.find((p) => p.id === userId) || { id: userId, role: 'pending', full_name: '' };
  const ctx = { db, me, isAdmin: me.role === 'admin', profiles, profileById: indexBy(profiles),
    settings: settingsRows[0] || {}, terms };
  if (me.role === 'pending') return ctx;

  ctx.term = terms.find((t) => t.is_current) || terms[0] || null;
  const year = ctx.term?.academic_year;
  const [classrooms, ct, subjects, courses, cteach] = await Promise.all([
    year ? db.select('classrooms', { eq: { academic_year: year } }) : [],
    db.select('classroom_teachers'),
    db.select('subjects', { order: ['code'] }),
    ctx.term ? db.select('courses', { eq: { term_id: ctx.term.id } }) : [],
    db.select('course_teachers'),
  ]);
  const order = (c) => ['อ', 'ป', 'ม'].indexOf(c.level[0]) * 100 + Number(c.level.split('.')[1]) * 10 + c.room;
  ctx.classrooms = classrooms.sort((a, b) => order(a) - order(b));
  ctx.classroomById = indexBy(ctx.classrooms);
  ctx.homeroomTeachers = (cid) => ct.filter((x) => x.classroom_id === cid).map((x) => ctx.profileById[x.teacher_id]).filter(Boolean);
  ctx.classroomTeacherRows = ct;
  ctx.myClassrooms = ctx.isAdmin ? ctx.classrooms
    : ctx.classrooms.filter((c) => ct.some((x) => x.classroom_id === c.id && x.teacher_id === me.id));
  ctx.subjects = subjects; ctx.subjectById = indexBy(subjects);
  ctx.courseTeacherRows = cteach;
  ctx.courses = courses.filter((k) => ctx.classroomById[k.classroom_id])
    .map((k) => ({ ...k, subject: ctx.subjectById[k.subject_id], classroom: ctx.classroomById[k.classroom_id],
      teachers: cteach.filter((x) => x.course_id === k.id).map((x) => ctx.profileById[x.teacher_id]).filter(Boolean) }))
    .sort((a, b) => order(a.classroom) - order(b.classroom) || a.sort_order - b.sort_order);
  ctx.courseById = indexBy(ctx.courses);
  ctx.myCourses = ctx.isAdmin ? ctx.courses : ctx.courses.filter((k) => k.teachers.some((t) => t.id === me.id));
  ctx.courseLabel = (k) => `${k.subject?.code ?? ''} ${k.subject?.name ?? ''} — ${roomName(k.classroom)}`;
  ctx.refresh = async () => { Object.assign(ctx, await loadContext(userId)); };
  ctx.go = (view, params = {}) => { ctx.params = params; location.hash = view; };
  return ctx;
}

// ---------------------------------------------------------------------
// หน้าเข้าสู่ระบบ
// ---------------------------------------------------------------------
function loginCover(sub) {
  return `<div class="login-cover">
    <div class="plate"><b>สมุดประจำชั้น</b><span>ธุรการชั้นเรียน และ ปพ.5 / ปพ.6</span></div>
    <ul><li>เช็กชื่อรายวันและรายคาบ เห็นพร้อมกันทุกเครื่อง</li><li>กรอกคะแนน ตัดเกรด คิด มส ให้อัตโนมัติ</li>
      <li>น้ำหนัก-ส่วนสูงตามเกณฑ์กรมอนามัย</li><li>พิมพ์ ปพ.6 ทั้งห้องในครั้งเดียว</li></ul>
    <small style="opacity:.75">${sub}</small></div>`;
}

function renderLogin() {
  if (db.mode === 'demo') {
    const users = db.auth.demoUsers();
    const roleText = { admin: 'ฝ่ายวิชาการ', teacher: 'ครู', pending: 'รออนุมัติ' };
    root.innerHTML = `
      <div class="login"><div class="login-book">${loginCover('โหมดทดลอง · ข้อมูลตัวอย่าง ชื่อสมมติ')}
        <div class="login-form">
          <h1>เข้าใช้งาน</h1>
          <p class="muted small" style="margin:0">เลือกบทบาทที่ต้องการทดลอง แล้วลองเปิดอีกแท็บเป็นอีกคน เพื่อดูข้อมูลอัปเดตพร้อมกัน</p>
          <div class="who-pick">
            ${users.map((u) => `<button class="btn" data-u="${esc(u.id)}"><span>${esc(u.full_name)}</span>
              <span class="chip ${u.role === 'admin' ? 'chip-info' : u.role === 'pending' ? 'chip-warn' : ''}">${esc(roleText[u.role])}</span></button>`).join('')}
          </div>
        </div></div></div>`;
    $$('[data-u]', root).forEach((b) => b.addEventListener('click', async () => { await db.auth.signIn(b.dataset.u); boot(); }));
    return;
  }
  let mode = 'in';
  const draw = () => {
    root.innerHTML = `
      <div class="login"><div class="login-book">${loginCover('ข้อมูลทุกห้องอยู่ในฐานข้อมูลกลางของโรงเรียน')}
        <div class="login-form">
          <h1>${mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครใช้งาน'}</h1>
          <div class="tabs"><button data-m="in" class="${mode === 'in' ? 'on' : ''}">เข้าสู่ระบบ</button>
            <button data-m="up" class="${mode === 'up' ? 'on' : ''}">สมัครใช้งาน (ครู)</button></div>
          <form id="f-login">
            ${mode === 'up' ? '<label>ชื่อ-นามสกุล<input type="text" id="l-name" name="name" required></label>' : ''}
            <label>อีเมล<input type="email" id="l-email" name="email" autocomplete="username" required></label>
            <label>รหัสผ่าน<input type="password" id="l-pass" name="password" minlength="6" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" required></label>
            <button class="btn btn-primary" type="submit" style="justify-content:center;padding-block:10px">${mode === 'in' ? 'เข้าสู่ระบบ' : 'สมัครใช้งาน'}</button>
            ${mode === 'up' ? '<p class="muted small" style="margin:0">สมัครแล้วต้องรอฝ่ายวิชาการอนุมัติก่อนจึงจะเห็นข้อมูล ผู้สมัครคนแรกของระบบจะเป็นผู้ดูแลระบบอัตโนมัติ</p>' : ''}
          </form>
        </div></div></div>`;
    $$('[data-m]', root).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; draw(); }));
    $('#f-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      try {
        if (mode === 'in') { await db.auth.signIn(f.email, f.password); boot(); }
        else {
          const r = await db.auth.signUp(f.email, f.password, f.name);
          if (r.session) boot();
          else { toast('สมัครแล้ว กรุณายืนยันอีเมลจากกล่องจดหมาย แล้วกลับมาเข้าสู่ระบบ'); mode = 'in'; draw(); }
        }
      } catch (err) { toast(err.message, 'err'); }
    });
  };
  draw();
}

// ---------------------------------------------------------------------
// โครงหน้าหลัก (ปกสมุด + หน้ากระดาษ)
// ---------------------------------------------------------------------
function renderShell(ctx) {
  const item = (v, label) => `<a href="#${v}" data-v="${v}">${icon(v)}<span>${label}</span></a>`;
  const name = ctx.me.full_name || ctx.me.email || '';
  root.innerHTML = `
    <div class="shell">
      <aside class="side no-print">
        <div class="brand"><span class="mark">ปพ.</span><b>สมุดประจำชั้น</b>
          <small>${ctx.settings.school_name ? `โรงเรียน${esc(ctx.settings.school_name)}` : 'ยังไม่ได้ตั้งชื่อโรงเรียน'}</small>
          <small>${ctx.term ? `ภาคเรียนที่ ${ctx.term.term} ปีการศึกษา ${ctx.term.academic_year}` : 'ยังไม่ได้ตั้งภาคเรียน'}</small></div>
        <nav class="nav">
          ${item('home', 'วันนี้')}
          <div class="sec">ธุรการชั้นเรียน</div>
          ${item('students', 'นักเรียน')}
          ${item('daily', 'เช็กชื่อประจำวัน')}
          ${item('period', 'เช็กชื่อรายคาบ')}
          ${item('reports', 'รายงาน A4')}
          <div class="sec">ปพ.</div>
          ${item('scores', 'คะแนนรายวิชา')}
          ${item('health', 'น้ำหนัก-ส่วนสูง')}
          ${item('traits', 'คุณลักษณะ/กิจกรรม')}
          ${item('print', 'พิมพ์ ปพ.6 / ปพ.5')}
          ${ctx.isAdmin ? `<div class="sec">ผู้ดูแล</div>${item('setup', 'ตั้งค่าระบบ')}` : ''}
        </nav>
        <div class="who"><span class="avatar" aria-hidden="true">${esc((name.replace(/^(ครู|นาย|นางสาว|นาง)\s*/, '').replace(/^[เแโใไ]/, '')[0]) || '?')}</span><span title="${esc(name)}">${esc(name)}</span>
          <button class="btn btn-sm" id="logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${icon('logout')}</button></div>
      </aside>
      <main class="main">${db.mode === 'demo' ? `<div class="demo-bar no-print"><span><b>โหมดทดลอง</b> ข้อมูลตัวอย่าง (ชื่อสมมติ) เก็บในเบราว์เซอร์นี้เท่านั้น</span>
        <button class="btn btn-sm" id="demo-reset">ล้างข้อมูลทดลอง</button></div>` : ''}<div class="main-inner" id="view"></div></main>
    </div>`;
  $('#logout').addEventListener('click', async () => { await db.auth.signOut(); boot(); });
  $('#demo-reset')?.addEventListener('click', async () => { db.resetDemo(); await db.auth.signOut(); boot(); });
}

async function route(ctx) {
  const v = (location.hash.replace('#', '') || 'home').split('?')[0];
  const view = VIEWS[v] && (v !== 'setup' || ctx.isAdmin) ? v : 'home';
  $$('.nav a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  const el = $('#view');
  el.innerHTML = '<p class="muted">กำลังโหลด…</p>';
  try { cleanup = (await VIEWS[view].render(el, ctx)) || null; }
  catch (err) { console.error(err); el.innerHTML = `<div class="card"><h2>เปิดหน้านี้ไม่สำเร็จ</h2><p>${esc(err.message)}</p></div>`; }
  window.scrollTo(0, 0);
}

let hashHandler = null;
async function boot() {
  if (hashHandler) window.removeEventListener('hashchange', hashHandler);
  const s = await db.auth.session();
  if (!s) return renderLogin();
  let ctx;
  try { ctx = await loadContext(s.user.id); }
  catch (err) { root.innerHTML = `<div class="login"><div class="card" style="max-width:460px"><h2>เชื่อมต่อฐานข้อมูลไม่สำเร็จ</h2><p>${esc(err.message)}</p></div></div>`; return; }
  if (ctx.me.role === 'pending') {
    root.innerHTML = `<div class="login"><div class="card" style="max-width:460px"><h1>รอการอนุมัติ</h1>
      <p>บัญชี ${esc(ctx.me.email || ctx.me.full_name)} สมัครเรียบร้อยแล้ว กรุณาแจ้งฝ่ายวิชาการให้อนุมัติในหน้า "ตั้งค่าระบบ &gt; ผู้ใช้"</p>
      <button class="btn" id="logout">ออกจากระบบ</button></div></div>`;
    $('#logout').addEventListener('click', async () => { await db.auth.signOut(); boot(); });
    return;
  }
  renderShell(ctx);
  hashHandler = () => route(ctx);
  window.addEventListener('hashchange', hashHandler);
  route(ctx);
}

db.auth.onChange(() => {});
boot();
