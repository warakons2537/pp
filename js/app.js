import { db } from './db.js?v=2569.10.30-1';
import { esc, $, $$, toast, indexBy, roomName, thaiDate, iso } from './util.js?v=2569.10.30-1';
import { icon } from './icons.js?v=2569.10.30-1';
import { BRAND, VERSION } from './brand.js?v=2569.10.30-1';
import { mountNav, labelHtml } from './navbar.js?v=2569.10.30-1';
import { computeAlerts, badge, showAlerts } from './notify.js?v=2569.10.30-1';
import * as home from './views/home.js?v=2569.10.30-1';
import * as students from './views/students.js?v=2569.10.30-1';
import * as daily from './views/daily.js?v=2569.10.30-1';
import * as period from './views/period.js?v=2569.10.30-1';
import * as reports from './views/reports.js?v=2569.10.30-1';
import * as setup from './views/setup.js?v=2569.10.30-1';
import * as scores from './views/scores.js?v=2569.10.30-1';
import * as health from './views/health.js?v=2569.10.30-1';
import * as traits from './views/traits.js?v=2569.10.30-1';
import * as print from './views/print.js?v=2569.10.30-1';

const VIEWS = { home, students, daily, period, reports, setup, scores, health, traits, print };
const root = document.getElementById('app');
let cleanup = null;
let navCtl = null;

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
  ctx.alerts = await computeAlerts(ctx);
  return ctx;
}

// ---------------------------------------------------------------------
// หน้าเข้าสู่ระบบ
// ---------------------------------------------------------------------
function loginCover(sub) {
  return `<div class="login-cover">
    <div class="plate"><img class="logo" src="${BRAND.logo}" alt=""><div><b>${esc(BRAND.name)}</b><span>${esc(BRAND.tagline)}</span></div></div>
    <ul><li>เช็กชื่อรายวันและรายคาบ เห็นพร้อมกันทุกเครื่อง</li><li>กรอกคะแนน ตัดเกรด คิด มส ให้อัตโนมัติ</li>
      <li>น้ำหนัก-ส่วนสูงตามเกณฑ์กรมอนามัย</li><li>พิมพ์ ปพ.6 ทั้งห้องในครั้งเดียว</li></ul>
    <small style="opacity:.75">${sub}</small>
    <small style="opacity:.6">เวอร์ชัน ${VERSION}</small></div>`;
}

function renderLogin() {
  if (db.mode === 'demo') {
    const users = db.auth.demoUsers().filter((u) => u.has_account !== false);
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
const schoolLine = (ctx) => (ctx.settings.school_name ? `โรงเรียน${ctx.settings.school_name}` : 'ยังไม่ได้ตั้งชื่อโรงเรียน');
const termLine = (ctx) => (ctx.term ? `ภาคเรียนที่ ${ctx.term.term} ปีการศึกษา ${ctx.term.academic_year}` : 'ยังไม่ได้ตั้งภาคเรียน');

// \u200b = จุดตัดบรรทัดที่ระบุเอง (ตัวตัดคำของเบราว์เซอร์ตัด "เช็กชื่อ" ผิดที่)
const NAV = { home: 'วันนี้', students: 'นักเรียน', daily: 'เช็กชื่อ\u200bประจำวัน', period: 'เช็กชื่อ\u200bรายคาบ', reports: 'รายงาน A4',
  scores: 'คะแนน\u200bรายวิชา', health: 'น้ำหนัก-\u200bส่วนสูง', traits: 'คุณลักษณะ/\u200bกิจกรรม', print: 'พิมพ์\u200bปพ.6 / ปพ.5', setup: 'ตั้งค่าระบบ' };
let clockTimer = null;
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
function tickClock() {
  const d = new Date(); const dt = $('#tb-date span'); const tm = $('#tb-time span');
  if (!dt || !tm) { clearInterval(clockTimer); clockTimer = null; return; }
  dt.textContent = `วัน${THAI_DAYS[d.getDay()]}ที่ ${thaiDate(iso(d))}`;
  tm.textContent = `${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} น.`;
}
function showNet() {
  const el = $('#tb-net'); if (!el) return;
  el.classList.toggle('off', !navigator.onLine); el.textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
}
window.addEventListener('online', showNet);
window.addEventListener('offline', showNet);

function renderShell(ctx) {
  const item = (v) => `<a href="#${v}" data-v="${v}">${icon(v)}<span>${labelHtml(NAV[v])}</span></a>`;
  const name = ctx.me.full_name || ctx.me.email || '';
  root.innerHTML = `
    <div class="shell">
      <aside class="side no-print">
        <div class="brand"><img class="mark" src="${BRAND.logo}" alt=""><b>${esc(BRAND.name)}</b>
          <small id="brand-school">${esc(schoolLine(ctx))}</small>
          <small id="brand-term">${esc(termLine(ctx))}</small>
          <small class="ver" title="ถ้าไม่ใช่เลขล่าสุด ให้กด Ctrl+F5">เวอร์ชัน ${VERSION}</small></div>
        <nav class="nav">
          ${item('home')}
          <div class="sec">ธุรการชั้นเรียน</div>
          ${item('students')}
          ${item('daily')}
          ${item('period')}
          ${item('reports')}
          <div class="sec">ปพ.</div>
          ${item('scores')}
          ${item('health')}
          ${item('traits')}
          ${item('print')}
          ${ctx.isAdmin ? `<div class="sec">ผู้ดูแล</div>${item('setup')}` : ''}
          <div class="sec">แอปในเครือ</div>
          <a href="../">${icon('link')}<span>ทางเข้า WL (ทุกแอป)</span></a>
        </nav>
      </aside>
      <main class="main">
        <header class="topbar no-print">
          <div class="tb-title"><b id="tb-title"></b><small id="tb-term">${esc(termLine(ctx))}</small></div>
          <div class="tb-clock"><span id="tb-date">${icon('daily')}<span></span></span><i class="sep"></i><span id="tb-time">${icon('period')}<span></span></span></div>
          <span class="live tb-net" id="tb-net"></span>
          <div class="tb-user"><span class="avatar" aria-hidden="true">${esc((name.replace(/^(ครู|นาย|นางสาว|นาง)\s*/, '').replace(/^[เแโใไ]/, '')[0]) || '?')}</span>
            <span class="nm"><b title="${esc(name)}">${esc(name)}</b><small>${ctx.isAdmin ? 'ผู้ดูแลระบบ' : 'ครู'}</small></span>
            <button class="btn btn-sm" id="logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${icon('logout')}</button></div>
        </header>
        <div class="main-pad">${db.mode === 'demo' ? `<div class="demo-bar no-print"><span><b>โหมดทดลอง</b> ข้อมูลตัวอย่าง (ชื่อสมมติ) เก็บในเบราว์เซอร์นี้เท่านั้น</span>
        <button class="btn btn-sm" id="demo-reset">ล้างข้อมูลทดลอง</button></div>` : ''}<div class="main-inner" id="view"></div></div></main>
    </div>
    <div id="bnav-root"></div>`;
  navCtl = mountNav($('#bnav-root'), { labels: NAV, version: VERSION,
    ok: ['home', 'students', 'daily', 'period', 'reports', 'scores', 'health', 'traits', 'print', ...(ctx.isAdmin ? ['setup'] : [])] });
  $('#logout').addEventListener('click', async () => { await db.auth.signOut(); boot(); });
  $('#demo-reset')?.addEventListener('click', async () => { db.resetDemo(); await db.auth.signOut(); boot(); });
  clearInterval(clockTimer); tickClock(); clockTimer = setInterval(tickClock, 1000);
  showNet();
}

// จุดแดงจำนวนเรื่องที่ตั้งค่ายังไม่ครบ: เมนูด้านข้าง · เมนูลัดหน้าหลัก · แถบล่าง
let curCtx = null;
function paintBadges() {
  const n = curCtx?.alerts?.length || 0;
  $$('.nav a[data-v="setup"], .apps a[data-v="setup"] .tile').forEach((el) => {
    el.querySelector(':scope > .nbadge')?.remove();
    if (n) el.insertAdjacentHTML('beforeend', badge(n));
  });
  navCtl?.setBadge('setup', n);
}
// แตะเมนูตั้งค่าระบบขณะมีเรื่องค้าง → แสดงรายการก่อน
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-v="setup"]');
  if (!a || !curCtx?.alerts?.length) return;
  e.preventDefault();
  showAlerts(curCtx.alerts, (tab) => {
    curCtx.params = tab ? { tab } : {};
    if (location.hash === '#setup') route(curCtx); else location.hash = 'setup';
  });
}, true);

async function route(ctx) {
  const v = (location.hash.replace('#', '') || 'home').split('?')[0];
  const view = VIEWS[v] && (v !== 'setup' || ctx.isAdmin) ? v : 'home';
  $$('.nav a[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === view));
  navCtl?.setView(view);
  const tt = $('#tb-title'); if (tt) tt.textContent = NAV[view] || '';
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  const el = $('#view');
  el.innerHTML = '<p class="muted">กำลังโหลด…</p>';
  try { cleanup = (await VIEWS[view].render(el, ctx)) || null; }
  catch (err) { console.error(err); el.innerHTML = `<div class="card"><h2>เปิดหน้านี้ไม่สำเร็จ</h2><p>${esc(err.message)}</p></div>`; }
  paintBadges();
  window.scrollTo(0, 0);
}

// ตารางโครงสร้าง (ภาคเรียน ห้อง วิชา ครู ผู้ใช้ ข้อมูลโรงเรียน) — มีการเปลี่ยนแปลงจากเครื่องใดก็โหลดข้อมูลชุดนี้ใหม่
const STRUCTURE = ['terms', 'classrooms', 'classroom_teachers', 'subjects', 'courses', 'course_teachers', 'profiles', 'school_settings'];
const KEEP = new Set(['refresh', 'go', 'params']);
let hashHandler = null;
let structureOffs = [];

// ให้ ctx เป็นออบเจ็กต์เดียวตลอดการใช้งาน: refresh() เขียนข้อมูลใหม่ทับลงออบเจ็กต์เดิมทุกครั้ง
// (เดิม refresh ครั้งที่ 2 เป็นต้นไปไปเขียนลงสำเนาที่ไม่มีหน้าจอใช้ ข้อมูลที่เพิ่งบันทึกจึงไม่ขึ้นจนกว่าจะรีเฟรช)
function makeLive(ctx, userId) {
  // ทำทีละครั้งตามลำดับ: เรียกหลังบันทึกเสร็จจะได้ข้อมูลที่รวมการบันทึกนั้นแน่นอน
  let chain = Promise.resolve();
  const load = async () => {
    const fresh = await loadContext(userId);
    for (const k of Object.keys(ctx)) if (!KEEP.has(k) && !(k in fresh)) delete ctx[k];
    Object.assign(ctx, fresh);
    const sc = document.getElementById('brand-school'); if (sc) sc.textContent = schoolLine(ctx);
    const tm = document.getElementById('brand-term'); if (tm) tm.textContent = termLine(ctx);
    const tt = document.getElementById('tb-term'); if (tt) tt.textContent = termLine(ctx);
    paintBadges();
  };
  ctx.refresh = () => { const p = chain.then(load, load); chain = p.catch(() => {}); return p; };
  ctx.go = (view, params = {}) => { ctx.params = params; location.hash = view; };
  return ctx;
}

function watchStructure(ctx) {
  structureOffs.forEach((f) => { try { f(); } catch { /* */ } });
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => ctx.refresh().catch(() => {}), 400); };
  structureOffs = STRUCTURE.map((table) => db.subscribe(table, null, later));
}

async function boot() {
  if (hashHandler) window.removeEventListener('hashchange', hashHandler);
  structureOffs.forEach((f) => { try { f(); } catch { /* */ } }); structureOffs = [];
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
  makeLive(ctx, s.user.id);
  curCtx = ctx;
  renderShell(ctx);
  watchStructure(ctx);
  hashHandler = () => route(ctx);
  window.addEventListener('hashchange', hashHandler);
  route(ctx);
}

db.auth.onChange(() => {});
boot();
