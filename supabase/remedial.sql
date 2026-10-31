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

-- นักเรียนตรวจผลของตัวเองโดยไม่ต้องมีบัญชี: กรอกช่องใดช่องหนึ่งก็ได้ (ชื่อ / นามสกุล / เลขประจำตัว) · ช่องที่กรอกต้องตรงทะเบียนทุกช่อง
-- ถ้าที่กรอกตรงกับนักเรียนคนเดียว → คืนรายการของคนนั้น (matches = 1)
-- ถ้าตรงหลายคน (เช่น ชื่อซ้ำ) → ไม่คืนข้อมูลใครเลย คืนแถวเดียวบอกจำนวนคน (matches > 1) ให้กรอกช่องอื่นเพิ่ม
-- ไม่คืนหมายเหตุของครู · ผลหลังแก้แสดงเมื่อผู้ดูแลระบบยืนยันแล้วเท่านั้น
-- รันซ้ำได้ ไม่แตะตารางอื่น
drop function if exists public.remedial_lookup(text, text, text);
create or replace function public.remedial_lookup(p_first text default null, p_last text default null, p_code text default null)
returns table (matches int, academic_year int, term smallint, subject_code text, subject_name text, level text,
               original_grade text, cause text, plan text, due_date date, status text, new_grade text)
language plpgsql stable security definer set search_path = public as $$
declare
  f text := lower(btrim(coalesce(p_first, '')));
  l text := lower(btrim(coalesce(p_last, '')));
  c text := btrim(coalesce(p_code, ''));
  n int; sid uuid;
begin
  if f = '' and l = '' and c = '' then return; end if;
  select count(*), (array_agg(st.id))[1] into n, sid
  from public.students st
  where (c = '' or btrim(st.student_code) = c)
    and (f = '' or lower(btrim(st.first_name)) = f)
    and (l = '' or lower(btrim(st.last_name)) = l);
  if n = 0 then return; end if;
  if n > 1 then
    return query select n, null::int, null::smallint, null::text, null::text, null::text, null::text, null::text, null::text, null::date, null::text, null::text;
    return;
  end if;
  return query
    select 1, t.academic_year, t.term, s.code, s.name, cl.level, r.original_grade, r.cause, r.plan, r.due_date, r.status,
           case when r.status = 'approved' then r.new_grade end
    from public.remedial_cases r
    join public.courses c2 on c2.id = r.course_id
    join public.subjects s on s.id = c2.subject_id
    join public.classrooms cl on cl.id = c2.classroom_id
    join public.terms t on t.id = c2.term_id
    where r.student_id = sid
    order by t.academic_year desc, t.term desc, s.code;
end $$;
revoke all on function public.remedial_lookup(text, text, text) from public;
grant execute on function public.remedial_lookup(text, text, text) to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.remedial_cases;
    exception when duplicate_object then null; end;
  end if;
end $$;
