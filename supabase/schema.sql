-- =====================================================================
--  ระบบธุรการชั้นเรียน + ปพ.  —  ฐานข้อมูลกลาง (Supabase / PostgreSQL)
--  วิธีใช้: เปิด Supabase > SQL Editor > วางไฟล์นี้ทั้งไฟล์ > Run (รันซ้ำได้)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0) ชนิดข้อมูลกลาง
-- ---------------------------------------------------------------------
do $$ begin
  create type attendance_status as enum ('present','late','sick','leave','absent');
exception when duplicate_object then null; end $$;
-- present = มา, late = สาย (นับว่ามา), sick = ป่วย, leave = ลากิจ, absent = ขาด

-- ---------------------------------------------------------------------
-- 1) ผู้ใช้ (ครู) — ผูกกับระบบล็อกอินของ Supabase
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),   -- = auth.users.id (ครูที่ยังไม่มีบัญชี: has_account = false)
  full_name   text not null default '',
  email       text,
  role        text not null default 'pending'
              check (role in ('pending','teacher','admin')),
  created_at  timestamptz not null default now()
);
comment on column public.profiles.role is
  'pending = สมัครแล้วรออนุมัติ, teacher = ครู, admin = ฝ่ายวิชาการ/ผู้ดูแล';

-- ---------------------------------------------------------------------
-- 2) ข้อมูลพื้นฐานโรงเรียน (มีแถวเดียว)
-- ---------------------------------------------------------------------
create table if not exists public.school_settings (
  id                  int primary key default 1 check (id = 1),
  school_name         text not null default '',
  school_code         text,
  affiliation         text default 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน',
  area_office         text,
  subdistrict         text,
  district            text,
  province            text,
  director_name       text,
  director_title      text default 'ผู้อำนวยการโรงเรียน',
  registrar_name      text,
  academic_head_name  text,
  updated_at          timestamptz not null default now()
);
insert into public.school_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) ปีการศึกษา/ภาคเรียน, ห้องเรียน
-- ---------------------------------------------------------------------
create table if not exists public.terms (
  id             uuid primary key default gen_random_uuid(),
  academic_year  int not null check (academic_year between 2500 and 2700),
  term           smallint not null check (term in (1,2)),
  start_date     date,
  end_date       date,
  is_current     boolean not null default false,
  unique (academic_year, term)
);

create table if not exists public.classrooms (
  id             uuid primary key default gen_random_uuid(),
  academic_year  int not null,
  level          text not null check (level in
                 ('อ.1','อ.2','อ.3','ป.1','ป.2','ป.3','ป.4','ป.5','ป.6','ม.1','ม.2','ม.3')),
  room           smallint not null default 1,
  unique (academic_year, level, room)
);

create table if not exists public.classroom_teachers (   -- ครูประจำชั้น (มีได้หลายคน)
  classroom_id  uuid not null references public.classrooms(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  primary key (classroom_id, teacher_id)
);

-- ---------------------------------------------------------------------
-- 4) นักเรียน  (ข้อมูลทั่วไป ครูทุกคนเห็น / ข้อมูลส่วนบุคคล เห็นเฉพาะครูประจำชั้น+แอดมิน)
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  student_code   text unique,                 -- เลขประจำตัวนักเรียน
  prefix         text,
  first_name     text not null,
  last_name      text not null default '',
  first_name_en  text,
  last_name_en   text,
  gender         text check (gender in ('ช','ญ')),
  status         text not null default 'active'
                 check (status in ('active','moved','graduated','dropped')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.student_private (
  student_id   uuid primary key references public.students(id) on delete cascade,
  citizen_id   text unique,                   -- เลขประจำตัวประชาชน
  birth_date   date,
  blood_type   text,
  ethnicity    text,
  nationality  text,
  religion     text,
  siblings     jsonb,    -- {older_brothers, younger_brothers, older_sisters, younger_sisters, child_no}
  father       jsonb,    -- {citizen_id, prefix, first_name, last_name, income, phone, occupation}
  mother       jsonb,
  guardian     jsonb,    -- + relation
  address      jsonb,    -- {house_code, house_no, moo, road, subdistrict, district, province, postcode}
  dmc_raw      jsonb,    -- แถวต้นฉบับจากไฟล์ DMC ทั้งแถว (กันข้อมูลตกหล่น)
  updated_at   timestamptz not null default now()
);

create table if not exists public.enrollments (           -- นักเรียนอยู่ห้องไหน ปีไหน
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  classroom_id  uuid not null references public.classrooms(id) on delete cascade,
  number        smallint,                       -- เลขที่
  entered_on    date,                           -- เข้าระหว่างภาค (ถ้ามี)
  left_on       date,                           -- ออกระหว่างภาค (ถ้ามี)
  status        text not null default 'active' check (status in ('active','left')),
  unique (student_id, classroom_id)
);
create index if not exists enrollments_classroom_idx on public.enrollments(classroom_id);

-- ---------------------------------------------------------------------
-- 5) รายวิชา และการเปิดสอน (วิชา × ห้อง × ภาคเรียน) — ครูผู้สอนได้หลายคน
-- ---------------------------------------------------------------------
create table if not exists public.subjects (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,          -- เช่น ท21101
  name            text not null,
  subject_group   text,                          -- กลุ่มสาระการเรียนรู้
  subject_type    text not null default 'พื้นฐาน'
                  check (subject_type in ('พื้นฐาน','เพิ่มเติม')),
  credits         numeric(3,1),                  -- หน่วยกิต (มัธยม)
  hours_per_year  int,                           -- ชั่วโมง/ปี (ประถม)
  level           text
);

create table if not exists public.courses (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references public.subjects(id) on delete cascade,
  classroom_id     uuid not null references public.classrooms(id) on delete cascade,
  term_id          uuid not null references public.terms(id) on delete cascade,
  midterm_ratio    smallint not null default 70,   -- คะแนนระหว่างภาค
  final_ratio      smallint not null default 30,   -- คะแนนปลายภาค
  sort_order       smallint not null default 0,
  check (midterm_ratio + final_ratio = 100),
  unique (subject_id, classroom_id, term_id)
);

create table if not exists public.course_teachers (
  course_id   uuid not null references public.courses(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (course_id, teacher_id)
);

-- ---------------------------------------------------------------------
-- 6) ธุรการ: เวลาเรียนรายวัน (ครูประจำชั้น) และรายคาบ (ครูผู้สอน) — แยกกัน
-- ---------------------------------------------------------------------
create table if not exists public.daily_attendance (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  classroom_id  uuid not null references public.classrooms(id) on delete cascade,
  date          date not null,
  status        attendance_status not null,
  note          text,
  recorded_by   uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists daily_att_class_date_idx on public.daily_attendance(classroom_id, date);

create table if not exists public.period_attendance (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  date         date not null,
  period       smallint not null check (period between 1 and 12),
  status       attendance_status not null,
  note         text,
  recorded_by  uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (course_id, student_id, date, period)
);
create index if not exists period_att_course_idx on public.period_attendance(course_id, date);

create table if not exists public.behavior_notes (          -- บันทึกพฤติกรรม
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  course_id    uuid references public.courses(id) on delete set null,
  date         date not null default current_date,
  kind         text not null default 'note' check (kind in ('positive','negative','note')),
  text         text not null,
  recorded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7) ปพ.: คะแนนรายวิชา
--    kind: indicator = ตัวชี้วัด (ผ/มผ), score = คะแนนเก็บระหว่างภาค, final = สอบปลายภาค
-- ---------------------------------------------------------------------
create table if not exists public.assessment_items (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  kind        text not null check (kind in ('indicator','score','final')),
  code        text,                 -- เช่น ท 1.1 ม.1/1
  title       text,                 -- เช่น การอ่านคำ, กลางภาค
  max_score   numeric(6,2),         -- ว่างได้สำหรับ indicator
  sort_order  smallint not null default 0
);
create index if not exists items_course_idx on public.assessment_items(course_id);

create table if not exists public.item_scores (
  item_id     uuid not null references public.assessment_items(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  score       numeric(6,2),         -- สำหรับ score/final
  passed      boolean,              -- สำหรับ indicator (true = ผ, false = มผ)
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (item_id, student_id)
);

create table if not exists public.course_results (           -- ผลพิเศษที่ครูกำหนดเอง
  course_id   uuid not null references public.courses(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  special     text check (special in ('ร','มส')),   -- ว่าง = ใช้เกรดจากคะแนน
  remark      text,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (course_id, student_id)
);

-- ตัวชี้วัดกลางของรายวิชา: รายการเดียวต่อรหัสวิชา ใช้ร่วมกับทุกห้องที่เปิดสอนรหัสวิชานั้น
-- แอปเพิ่มตัวที่ห้องยังไม่มีลง assessment_items (kind = indicator) ให้เอง ผล ผ/มผ ยังเก็บรายห้องเหมือนเดิม
create table if not exists public.subject_indicators (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  code        text not null,        -- จัดรูปแบบแล้ว เช่น ท 1.1 ม.3/1
  title       text,
  sort_order  smallint not null default 0,
  unique (subject_id, code)
);
create index if not exists subject_indicators_subject_idx on public.subject_indicators(subject_id);

-- ระยะที่ 2: ยกเว้น มส (เช่น ผู้อำนวยการอนุญาตให้สอบ) และวิธีปัดเศษคะแนนของโรงเรียน
alter table public.course_results add column if not exists ms_waived boolean not null default false;
alter table public.school_settings add column if not exists score_rounding text not null default 'floor';
do $$ begin
  alter table public.school_settings add constraint school_settings_rounding_chk
    check (score_rounding in ('floor','round','none'));
exception when duplicate_object then null; end $$;

-- คะแนนต้องไม่ติดลบและไม่เกินคะแนนเต็มของช่องนั้น
create or replace function public.check_item_score() returns trigger
language plpgsql security definer set search_path = public as $$
declare mx numeric;
begin
  if new.score is not null then
    select max_score into mx from public.assessment_items where id = new.item_id;
    if new.score < 0 or (mx is not null and new.score > mx) then
      raise exception 'คะแนน % เกินคะแนนเต็ม (%)', new.score, mx;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists item_scores_check on public.item_scores;
create trigger item_scores_check before insert or update on public.item_scores
  for each row execute function public.check_item_score();

-- ---------------------------------------------------------------------
-- 8) ปพ.: คุณลักษณะฯ / อ่านคิดวิเคราะห์ / ค่านิยม 12 / สมรรถนะ / กิจกรรม / ความเห็นครู
-- ---------------------------------------------------------------------
create table if not exists public.trait_scores (
  term_id      uuid not null references public.terms(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  kind         text not null check (kind in ('trait8','rtw','values12','competency5')),
  item_no      smallint not null check (item_no between 1 and 12),
  score        smallint check (score between 0 and 3),
  assessed_by  uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (term_id, student_id, kind, item_no)
);

-- แบบประเมินละเอียด: คะแนนรายพฤติกรรม (คุณลักษณะ 0–3) / รายข้อ (สมรรถนะ 1–3)
-- ผลสรุปรายข้อถูกเขียนลง trait_scores ด้วย จึงใช้กับ ปพ.6 ได้ทันที
create table if not exists public.assess_detail (
  term_id      uuid not null references public.terms(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  form         text not null check (form in ('trait8','competency5')),
  code         text not null,            -- เช่น 1.1.2 (คุณลักษณะ) หรือ 3.4 (สมรรถนะ)
  score        smallint check (score between 0 and 3),
  assessed_by  uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (term_id, student_id, form, code)
);

create table if not exists public.activity_results (
  term_id     uuid not null references public.terms(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  activity    text not null check (activity in ('guidance','scout','club','social')),
  club_name   text,
  passed      boolean,
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (term_id, student_id, activity)
);

create table if not exists public.homeroom_comments (
  term_id     uuid not null references public.terms(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  comment     text,
  updated_at  timestamptz not null default now(),
  primary key (term_id, student_id)
);

-- ---------------------------------------------------------------------
-- 9) ปพ.: น้ำหนัก-ส่วนสูง + ตารางอ้างอิงกรมอนามัย
-- ---------------------------------------------------------------------
create table if not exists public.health_measurements (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,2),
  height_cm    numeric(5,1),
  recorded_by  uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  unique (student_id, measured_on)
);

create table if not exists public.growth_reference (
  sex      char(1) not null check (sex in ('ช','ญ')),
  basis    text not null check (basis in ('age_months','height_cm')),
  key      int not null,                -- อายุ (เดือน) หรือ ส่วนสูง (ซม.)
  measure  text not null check (measure in ('weight','height')),
  median   numeric, sd numeric,
  minus2 numeric, minus15 numeric, plus15 numeric, plus2 numeric, plus3 numeric,
  primary key (sex, basis, key, measure)
);

-- ระยะที่ 3: น้ำหนัก-ส่วนสูงเก็บตาม "ครั้งที่ชั่งวัด" (1–4 ต่อปีการศึกษา) และตารางอ้างอิงมีได้หลายชุด
alter table public.school_settings add column if not exists pp_template_name text;   -- ชื่อไฟล์ต้นฉบับ ปพ.5-6 ที่อัปโหลดไว้
alter table public.terms add column if not exists approve_date date;                   -- วันที่อนุมัติผลการเรียน (ลงในแบบพิมพ์ ปพ.)
alter table public.health_measurements add column if not exists academic_year int;
alter table public.health_measurements add column if not exists round smallint;
alter table public.health_measurements drop constraint if exists health_measurements_student_id_measured_on_key;
do $$ begin
  alter table public.health_measurements add constraint health_round_chk check (round between 1 and 4);
exception when duplicate_object then null; end $$;
create unique index if not exists health_student_round_idx on public.health_measurements(student_id, academic_year, round);

alter table public.growth_reference add column if not exists ref_set text not null default 'excel';
do $$ begin
  if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
                 where c.conname = 'growth_reference_pkey' and a.attname = 'ref_set') then
    alter table public.growth_reference drop constraint if exists growth_reference_pkey;
    alter table public.growth_reference add primary key (ref_set, sex, basis, key, measure);
  end if;
end $$;
alter table public.school_settings add column if not exists growth_ref_set text not null default 'excel';

-- =====================================================================
-- ฟังก์ชันตรวจสิทธิ์ (security definer เพื่อไม่ให้ RLS วนซ้ำ)
-- =====================================================================
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('teacher','admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_homeroom_of(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classroom_teachers
                 where classroom_id = cid and teacher_id = auth.uid())
$$;

create or replace function public.is_any_homeroom() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classroom_teachers where teacher_id = auth.uid())
$$;

create or replace function public.is_homeroom_of_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments e
                 join public.classroom_teachers ct on ct.classroom_id = e.classroom_id
                 where e.student_id = sid and ct.teacher_id = auth.uid())
$$;

create or replace function public.teaches(crs uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.course_teachers
                 where course_id = crs and teacher_id = auth.uid())
$$;

create or replace function public.teaches_subject(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c
                 join public.course_teachers ct on ct.course_id = c.id
                 where c.subject_id = sid and ct.teacher_id = auth.uid())
$$;

create or replace function public.teaches_item(itm uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assessment_items i
                 join public.course_teachers ct on ct.course_id = i.course_id
                 where i.id = itm and ct.teacher_id = auth.uid())
$$;

-- =====================================================================
-- ทริกเกอร์
-- =====================================================================
-- สมัครสมาชิกใหม่ -> สร้าง profile อัตโนมัติ ; คนแรกของระบบเป็น admin
-- ชื่อตรงกับครูที่สร้างไว้ก่อน (ยังไม่มีบัญชี) 1 คนพอดี -> ย้ายวิชา/ห้องที่ผูกไว้มาที่บัญชีนี้ (ยังรออนุมัติตามปกติ)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := public.teacher_name_key(new.raw_user_meta_data->>'full_name'); ids uuid[];
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when exists (select 1 from public.profiles where has_account) then 'pending' else 'admin' end)
  on conflict (id) do nothing;
  if k <> '' then
    select array_agg(id) into ids from public.profiles where not has_account and public.teacher_name_key(full_name) = k;
    if cardinality(ids) = 1 then perform public.merge_teacher(ids[1], new.id); end if;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ห้ามครูเปลี่ยน role ตัวเอง
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() ว่าง = รันจาก SQL Editor ของเจ้าของโปรเจกต์ (ใช้กู้สิทธิ์ผู้ดูแลได้)
  if (new.role is distinct from old.role or new.has_account is distinct from old.has_account)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ผู้ใช้ได้';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- updated_at อัตโนมัติ
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['students','student_private','daily_attendance','period_attendance',
                           'item_scores','course_results','trait_scores','activity_results',
                           'homeroom_comments','health_measurements','school_settings','assess_detail'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- มีภาคเรียนปัจจุบันได้ภาคเดียว
create or replace function public.single_current_term() returns trigger
language plpgsql as $$
begin
  if new.is_current then
    update public.terms set is_current = false where id <> new.id and is_current;
  end if;
  return new;
end $$;
drop trigger if exists terms_single_current on public.terms;
create trigger terms_single_current after insert or update of is_current on public.terms
  for each row when (new.is_current) execute function public.single_current_term();

-- =====================================================================
-- Row Level Security (สิทธิ์การเข้าถึงรายแถว)
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['profiles','school_settings','terms','classrooms','classroom_teachers',
    'students','student_private','enrollments','subjects','courses','course_teachers',
    'daily_attendance','period_attendance','behavior_notes','assessment_items','item_scores',
    'course_results','trait_scores','activity_results','homeroom_comments',
    'health_measurements','growth_reference','assess_detail','subject_indicators'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ล้าง policy เดิม (ให้รันไฟล์ซ้ำได้)
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_read  on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_self  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- ตารางตั้งค่า: ครูอ่านได้, แอดมินแก้ได้
do $$ declare t text; begin
  foreach t in array array['school_settings','terms','classrooms','classroom_teachers',
                           'subjects','courses','course_teachers','growth_reference'] loop
    execute format('create policy %I_read on public.%I for select using (public.is_staff())', t, t);
    execute format('create policy %I_admin on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- นักเรียน
create policy students_read   on public.students for select using (public.is_staff());
create policy students_insert on public.students for insert
  with check (public.is_admin() or public.is_any_homeroom());
create policy students_update on public.students for update
  using (public.is_admin() or public.is_homeroom_of_student(students.id)
         or (public.is_any_homeroom() and not exists (select 1 from public.enrollments e where e.student_id = students.id)));
create policy students_delete on public.students for delete using (public.is_admin());

create policy private_read  on public.student_private for select
  using (public.is_admin() or public.is_homeroom_of_student(student_id));
create policy private_write on public.student_private for all
  using (public.is_admin() or public.is_homeroom_of_student(student_id)
         or (public.is_any_homeroom() and not exists (select 1 from public.enrollments e where e.student_id = student_private.student_id)))
  with check (public.is_admin() or public.is_any_homeroom());

create policy enroll_read  on public.enrollments for select using (public.is_staff());
create policy enroll_write on public.enrollments for all
  using (public.is_admin() or public.is_homeroom_of(classroom_id))
  with check (public.is_admin() or public.is_homeroom_of(classroom_id));

-- เวลาเรียนรายวัน: ครูประจำชั้นของห้องนั้น
create policy daily_read  on public.daily_attendance for select using (public.is_staff());
create policy daily_write on public.daily_attendance for all
  using (public.is_admin() or public.is_homeroom_of(classroom_id))
  with check (public.is_admin() or public.is_homeroom_of(classroom_id));

-- เวลาเรียนรายคาบ: ครูผู้สอนวิชานั้น
create policy period_read  on public.period_attendance for select using (public.is_staff());
create policy period_write on public.period_attendance for all
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));

-- พฤติกรรม: ครูทุกคนบันทึกได้, แก้/ลบได้เฉพาะของตัวเอง
create policy behavior_read   on public.behavior_notes for select using (public.is_staff());
create policy behavior_insert on public.behavior_notes for insert with check (public.is_staff());
create policy behavior_own    on public.behavior_notes for update using (recorded_by = auth.uid() or public.is_admin());
create policy behavior_del    on public.behavior_notes for delete using (recorded_by = auth.uid() or public.is_admin());

-- คะแนน: ครูผู้สอนวิชานั้น
create policy items_read  on public.assessment_items for select using (public.is_staff());
create policy items_write on public.assessment_items for all
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));
-- ตัวชี้วัดกลางของรายวิชา: ครูที่สอนรหัสวิชานั้น (ห้องใดก็ได้)
create policy subj_ind_read  on public.subject_indicators for select using (public.is_staff());
create policy subj_ind_write on public.subject_indicators for all
  using (public.is_admin() or public.teaches_subject(subject_id))
  with check (public.is_admin() or public.teaches_subject(subject_id));
create policy scores_read  on public.item_scores for select using (public.is_staff());
create policy scores_write on public.item_scores for all
  using (public.is_admin() or public.teaches_item(item_id))
  with check (public.is_admin() or public.teaches_item(item_id));
create policy results_read  on public.course_results for select using (public.is_staff());
create policy results_write on public.course_results for all
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));

-- ครูผู้สอนปรับสัดส่วนคะแนน (ระหว่างภาค:ปลายภาค) ของวิชาตัวเองได้ — แก้ช่องอื่นไม่ได้
create policy courses_teacher_ratio on public.courses for update
  using (public.teaches(id)) with check (public.teaches(id));
create or replace function public.guard_course_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.subject_id, new.classroom_id, new.term_id, new.sort_order)
       is distinct from (old.subject_id, old.classroom_id, old.term_id, old.sort_order) then
    raise exception 'ครูผู้สอนแก้ได้เฉพาะสัดส่วนคะแนน';
  end if;
  return new;
end $$;
drop trigger if exists courses_guard on public.courses;
create trigger courses_guard before update on public.courses
  for each row execute function public.guard_course_update();

-- คุณลักษณะ/กิจกรรม/ความเห็น/สุขภาพ: ครูประจำชั้นของนักเรียนคนนั้น
do $$ declare t text; begin
  foreach t in array array['trait_scores','activity_results','homeroom_comments','health_measurements','assess_detail'] loop
    execute format('create policy %I_read on public.%I for select using (public.is_staff())', t, t);
    execute format('create policy %I_write on public.%I for all
      using (public.is_admin() or public.is_homeroom_of_student(student_id))
      with check (public.is_admin() or public.is_homeroom_of_student(student_id))', t, t);
  end loop;
end $$;

-- =====================================================================
-- ฟังก์ชันสรุปผล
-- =====================================================================
-- สรุปเวลาเรียนรายวันของห้อง ในช่วงวันที่ (วันเต็ม = วันที่ห้องนี้มีการเช็กชื่อ)
create or replace function public.daily_attendance_summary(cid uuid, d_from date, d_to date)
returns table (student_id uuid, present int, late int, sick int, leave int, absent int,
               school_days int, pct numeric)
language sql stable security invoker set search_path = public as $$
  with days as (
    select count(distinct date)::int n from public.daily_attendance
    where classroom_id = cid and date between d_from and d_to
  )
  select e.student_id,
    count(*) filter (where a.status = 'present')::int,
    count(*) filter (where a.status = 'late')::int,
    count(*) filter (where a.status = 'sick')::int,
    count(*) filter (where a.status = 'leave')::int,
    count(*) filter (where a.status = 'absent')::int,
    (select n from days),
    case when (select n from days) = 0 then null
         else round(100.0 * count(*) filter (where a.status in ('present','late')) / (select n from days), 2) end
  from public.enrollments e
  left join public.daily_attendance a
    on a.student_id = e.student_id and a.classroom_id = cid and a.date between d_from and d_to
  where e.classroom_id = cid
  group by e.student_id
$$;

-- สรุปเวลาเรียนรายวิชา (รายคาบ) -> ใช้ตัดสิน มส (ต่ำกว่า 80%)
create or replace function public.course_attendance_summary(crs uuid)
returns table (student_id uuid, attended int, total_periods int, pct numeric, below_80 boolean)
language sql stable security invoker set search_path = public as $$
  with slots as (
    select count(*)::int n from (select distinct date, period from public.period_attendance
                                 where course_id = crs) s
  )
  select e.student_id,
    count(*) filter (where a.status in ('present','late'))::int,
    (select n from slots),
    case when (select n from slots) = 0 then null
         else round(100.0 * count(*) filter (where a.status in ('present','late')) / (select n from slots), 2) end,
    case when (select n from slots) = 0 then false
         else 100.0 * count(*) filter (where a.status in ('present','late')) / (select n from slots) < 80 end
  from public.courses c
  join public.enrollments e on e.classroom_id = c.classroom_id
  left join public.period_attendance a on a.course_id = crs and a.student_id = e.student_id
  where c.id = crs
  group by e.student_id
$$;

-- =====================================================================
-- Realtime: ให้หน้าจอครูทุกคนอัปเดตทันที
-- =====================================================================
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['daily_attendance','period_attendance','behavior_notes',
                             'item_scores','assessment_items','homeroom_comments','course_results','trait_scores','activity_results',
                             'health_measurements','enrollments','students','assess_detail',
                             'terms','classrooms','classroom_teachers','subjects','courses','course_teachers',
                             'profiles','school_settings'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;


-- =====================================================================
-- ที่เก็บไฟล์ของโรงเรียน (ไม่สาธารณะ) เช่น ไฟล์ต้นฉบับโปรแกรม ปพ.5-6
-- อ่านได้: ครู/ผู้ดูแลที่อนุมัติแล้ว · อัปโหลด/ลบ: ผู้ดูแลระบบ
-- =====================================================================
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('pp-files', 'pp-files', false) on conflict (id) do nothing;
    drop policy if exists pp_files_read on storage.objects;
    drop policy if exists pp_files_write on storage.objects;
    drop policy if exists pp_files_update on storage.objects;
    drop policy if exists pp_files_delete on storage.objects;
    create policy pp_files_read on storage.objects for select using (bucket_id = 'pp-files' and public.is_staff());
    create policy pp_files_write on storage.objects for insert with check (bucket_id = 'pp-files' and public.is_admin());
    create policy pp_files_update on storage.objects for update using (bucket_id = 'pp-files' and public.is_admin()) with check (bucket_id = 'pp-files' and public.is_admin());
    create policy pp_files_delete on storage.objects for delete using (bucket_id = 'pp-files' and public.is_admin());
  end if;
end $$;

-- =====================================================================
-- การแจ้งเตือน "ตั้งค่าระบบยังไม่ครบ" (ตั้งค่าระบบ → การแจ้งเตือน)
-- { "all": true/false, "off": ["key ที่ปิดไว้"] } · ค่าว่าง = เปิดทุกเรื่อง
-- =====================================================================
alter table public.school_settings add column if not exists notify jsonb not null default '{}'::jsonb;

-- =====================================================================
-- ครูที่ยังไม่มีบัญชี (นำเข้าจากไฟล์ WL Scheduler) : profiles.has_account = false
-- จับคู่กับบัญชีจริงอัตโนมัติตอนสมัคร (ชื่อตรงกัน 1 คน) หรือผู้ดูแลจับคู่เองที่ ตั้งค่าระบบ → ผู้ใช้
-- =====================================================================
alter table public.profiles add column if not exists has_account boolean not null default true;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- ลบบัญชีใน Authentication -> ลบ profile ด้วย (แทน FK เดิม)
create or replace function public.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- ชื่อสำหรับจับคู่: ตัดคำนำหน้า (ครู นาย นาง นางสาว น.ส.) และช่องว่างทั้งหมด
create or replace function public.teacher_name_key(s text) returns text
language sql immutable as $$
  select regexp_replace(regexp_replace(btrim(coalesce(s, '')), '^((ครู|นางสาว|นาง|นาย|น\.ส\.)\s*)+', ''), '\s+', '', 'g')
$$;

-- ย้ายวิชา/ห้องของครูที่ยังไม่มีบัญชีไปที่บัญชีจริง แล้วลบรายชื่อเดิม (ใช้ภายใน)
create or replace function public.merge_teacher(placeholder uuid, account uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.course_teachers (course_id, teacher_id)
    select course_id, account from public.course_teachers where teacher_id = placeholder on conflict do nothing;
  insert into public.classroom_teachers (classroom_id, teacher_id)
    select classroom_id, account from public.classroom_teachers where teacher_id = placeholder on conflict do nothing;
  delete from public.profiles where id = placeholder and not has_account;
end $$;
revoke all on function public.merge_teacher(uuid, uuid) from public, anon, authenticated;

-- ผู้ดูแลจับคู่เอง (กรณีชื่อไม่ตรงหรือซ้ำกันหลายคน)
create or replace function public.claim_teacher(placeholder uuid, account uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
  if not exists (select 1 from public.profiles where id = account and has_account) then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
  if not exists (select 1 from public.profiles where id = placeholder and not has_account) then raise exception 'ไม่พบรายชื่อครูที่ยังไม่มีบัญชี'; end if;
  perform public.merge_teacher(placeholder, account);
end $$;

-- =====================================================================
-- ติดตามการแก้ 0 ร มส (เฉพาะ ม.1–ม.3)
-- รันไฟล์นี้ใน Supabase SQL Editor ได้เลย (รันซ้ำได้ และไม่แตะตารางอื่น)
-- อย่ารัน schema.sql ทั้งไฟล์ในฐานข้อมูลที่ใช้ร่วมกับแอปอื่น: ส่วน "ล้าง policy เดิม" จะลบ policy ของทุกตารางใน schema public
-- เนื้อหาชุดเดียวกันนี้ถูกรวมไว้ใน schema.sql ด้วย (สำหรับติดตั้งโปรเจกต์ใหม่)
-- =====================================================================
create table if not exists public.remedial_cases (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  original_grade  text not null check (original_grade in ('0','ร','มส')),
  cause           text check (cause in ('absent','low_score','missing_work','missed_exam','other')),
  plan            text check (plan in ('retest','tutoring','extra_work','repeat')),
  due_date        date,
  done_on         date,
  new_grade       text check (new_grade in ('0','1','1.5','2','2.5','3','3.5','4')),
  status          text not null default 'planned'
                  check (status in ('planned','in_progress','submitted','approved','unresolved')),
  note            text,
  reviewed_by     uuid,
  reviewed_on     date,
  review_note     text,
  updated_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (course_id, student_id),
  constraint remedial_done_needs_result
    check ((status <> 'submitted' and status <> 'approved') or (new_grade is not null and done_on is not null))
);
create index if not exists remedial_cases_student_idx on public.remedial_cases(student_id);

drop trigger if exists remedial_cases_touch on public.remedial_cases;
create trigger remedial_cases_touch before update on public.remedial_cases
  for each row execute function public.touch_updated_at();

-- กติกา: เฉพาะนักเรียนมัธยม · ครูยืนยันผลเองไม่ได้ · ยืนยันแล้วครูแก้ไม่ได้ · ครูแก้ช่องการยืนยันไม่ได้
create or replace function public.guard_remedial() returns trigger
language plpgsql security definer set search_path = public as $$
declare lv text;
begin
  select cl.level into lv from public.courses c
    join public.classrooms cl on cl.id = c.classroom_id where c.id = new.course_id;
  if lv is null or lv not like 'ม.%' then
    raise exception 'ติดตามการแก้ 0 ร มส เฉพาะนักเรียนมัธยม (ม.1–ม.3)';
  end if;
  if tg_op = 'UPDATE' and (new.course_id, new.student_id, new.original_grade)
       is distinct from (old.course_id, old.student_id, old.original_grade)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'ครูแก้ผลเดิมของรายการนี้ไม่ได้';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    if new.status = 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then
      raise exception 'เฉพาะผู้ดูแลระบบที่ยืนยันผลแก้ได้ และเมื่อยืนยันแล้วครูแก้ไม่ได้';
    end if;
    new.reviewed_by := case when tg_op = 'UPDATE' then old.reviewed_by end;
    new.reviewed_on := case when tg_op = 'UPDATE' then old.reviewed_on end;
    new.review_note := case when tg_op = 'UPDATE' then old.review_note end;
  elsif new.status = 'approved' then
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
    new.reviewed_on := current_date;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists remedial_cases_guard on public.remedial_cases;
create trigger remedial_cases_guard before insert or update on public.remedial_cases
  for each row execute function public.guard_remedial();

alter table public.remedial_cases enable row level security;
drop policy if exists remedial_read  on public.remedial_cases;
drop policy if exists remedial_write on public.remedial_cases;
create policy remedial_read  on public.remedial_cases for select using (public.is_staff());
create policy remedial_write on public.remedial_cases for all
  using (public.is_admin() or public.teaches(course_id))
  with check (public.is_admin() or public.teaches(course_id));

-- นักเรียนตรวจผลของตัวเองโดยไม่ต้องมีบัญชี: ต้องกรอก ชื่อ + นามสกุล + เลขประจำตัว ให้ตรงกันทั้ง 3 ช่อง
-- คืนเฉพาะข้อมูลที่นักเรียนควรเห็น (ไม่มีหมายเหตุของครู) · ผลหลังแก้แสดงเมื่อผู้ดูแลยืนยันแล้วเท่านั้น
create or replace function public.remedial_lookup(p_first text, p_last text, p_code text)
returns table (academic_year int, term smallint, subject_code text, subject_name text, level text,
               original_grade text, cause text, plan text, due_date date, status text, new_grade text)
language sql stable security definer set search_path = public as $$
  select t.academic_year, t.term, s.code, s.name, cl.level,
         r.original_grade, r.cause, r.plan, r.due_date, r.status,
         case when r.status = 'approved' then r.new_grade end
  from public.students st
  join public.remedial_cases r on r.student_id = st.id
  join public.courses c on c.id = r.course_id
  join public.subjects s on s.id = c.subject_id
  join public.classrooms cl on cl.id = c.classroom_id
  join public.terms t on t.id = c.term_id
  where length(btrim(coalesce(p_code, ''))) > 0
    and btrim(st.student_code) = btrim(p_code)
    and lower(btrim(st.first_name)) = lower(btrim(p_first))
    and lower(btrim(st.last_name))  = lower(btrim(p_last))
  order by t.academic_year desc, t.term desc, s.code
$$;
revoke all on function public.remedial_lookup(text, text, text) from public;
grant execute on function public.remedial_lookup(text, text, text) to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.remedial_cases;
    exception when duplicate_object then null; end;
  end if;
end $$;
