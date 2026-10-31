-- =====================================================================
-- วิชาค้างจากปีก่อน/ภาคเรียนก่อน ในระบบติดตาม 0 ร มส
-- เดิมทุกรายการต้องผูกกับ "รายวิชาที่เปิดสอนในภาคเรียนปัจจุบัน" (course_id) ไฟล์นี้ให้เก็บรายการที่ไม่มีรายวิชานั้นในระบบได้
-- (เช่น นักเรียน ม.2 ที่ยังติด ท21101 ของ ม.1) โดยเก็บรหัส/ชื่อวิชา ปี ภาค ไว้ในแถวเดียวกัน
-- รันใน Supabase SQL Editor ได้เลย (ต้องรัน remedial.sql มาก่อนแล้ว) · รันซ้ำได้ · ไม่ลบข้อมูลเดิม
-- =====================================================================
alter table public.remedial_cases alter column course_id drop not null;
alter table public.remedial_cases add column if not exists classroom_id uuid references public.classrooms(id) on delete set null;  -- ห้องปัจจุบันของนักเรียน (ใช้กับรายการค้าง)
alter table public.remedial_cases add column if not exists legacy_code text;
alter table public.remedial_cases add column if not exists legacy_name text;
alter table public.remedial_cases add column if not exists legacy_year int;
alter table public.remedial_cases add column if not exists legacy_term smallint;
alter table public.remedial_cases add column if not exists legacy_credits numeric(3,1);
create index if not exists remedial_cases_classroom_idx on public.remedial_cases(classroom_id);

alter table public.remedial_cases drop constraint if exists remedial_has_subject;
alter table public.remedial_cases add constraint remedial_has_subject
  check (course_id is not null or (legacy_code is not null and classroom_id is not null));
-- วิชาค้างซ้ำกันไม่ได้ (นักเรียนคนเดิม วิชาเดิม ปีเดิม)
create unique index if not exists remedial_legacy_uq on public.remedial_cases (student_id, legacy_code, (coalesce(legacy_year, 0)))
  where course_id is null;

-- กติกาเดิม + รองรับรายการค้าง (หาระดับชั้นจากห้องปัจจุบันของนักเรียนแทน)
create or replace function public.guard_remedial() returns trigger
language plpgsql security definer set search_path = public as $$
declare lv text;
begin
  if new.course_id is not null then
    select cl.level into lv from public.courses c
      join public.classrooms cl on cl.id = c.classroom_id where c.id = new.course_id;
  else
    select cl.level into lv from public.classrooms cl where cl.id = new.classroom_id;
  end if;
  if lv is null or lv not like 'ม.%' then
    raise exception 'ติดตามการแก้ 0 ร มส เฉพาะนักเรียนมัธยม (ม.1–ม.3)';
  end if;
  if tg_op = 'UPDATE' and (new.course_id, new.student_id, new.original_grade, new.legacy_code, new.legacy_year)
       is distinct from (old.course_id, old.student_id, old.original_grade, old.legacy_code, old.legacy_year)
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

-- สิทธิ์: รายการค้างจัดการได้โดยผู้ดูแลระบบ และครูประจำชั้นของห้องปัจจุบันของนักเรียน
drop policy if exists remedial_write on public.remedial_cases;
create policy remedial_write on public.remedial_cases for all
  using (public.is_admin() or public.teaches(course_id) or (course_id is null and public.is_homeroom_of(classroom_id)))
  with check (public.is_admin() or public.teaches(course_id) or (course_id is null and public.is_homeroom_of(classroom_id)));

-- นักเรียนตรวจผล 0 ร มส: รวมรายการค้างจากปีก่อนด้วย (เดิมของ remedial_lookup.sql + legacy)
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
    select 1, coalesce(t.academic_year, r.legacy_year), coalesce(t.term, r.legacy_term), coalesce(s.code, r.legacy_code), coalesce(s.name, r.legacy_name),
           coalesce(cl.level, cl2.level), r.original_grade, r.cause, r.plan, r.due_date, r.status,
           case when r.status = 'approved' then r.new_grade end
    from public.remedial_cases r
    left join public.courses c2 on c2.id = r.course_id
    left join public.subjects s on s.id = c2.subject_id
    left join public.classrooms cl on cl.id = c2.classroom_id
    left join public.classrooms cl2 on cl2.id = r.classroom_id
    left join public.terms t on t.id = c2.term_id
    where r.student_id = sid
    order by coalesce(t.academic_year, r.legacy_year) desc nulls last, coalesce(t.term, r.legacy_term) desc nulls last, coalesce(s.code, r.legacy_code);
end $$;
revoke all on function public.remedial_lookup(text, text, text) from public;
grant execute on function public.remedial_lookup(text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
