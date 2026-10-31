-- =====================================================================
-- เช็กอาหารกลางวัน (ครูประจำชั้นบันทึก ดึงจากเช็กชื่อประจำวันได้)
-- รันใน Supabase SQL Editor ได้เลย (รันซ้ำได้ และไม่แตะตารางอื่น)
-- =====================================================================
create table if not exists public.meal_checks (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  classroom_id  uuid not null references public.classrooms(id) on delete cascade,
  date          date not null,
  status        text not null check (status in ('ate','skip','absent')),
  recorded_by   uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (student_id, date)
);
create index if not exists meal_class_date_idx on public.meal_checks(classroom_id, date);

drop trigger if exists meal_checks_touch on public.meal_checks;
create trigger meal_checks_touch before update on public.meal_checks
  for each row execute function public.touch_updated_at();

alter table public.meal_checks enable row level security;
drop policy if exists meal_read on public.meal_checks;
drop policy if exists meal_write on public.meal_checks;
create policy meal_read  on public.meal_checks for select using (public.is_staff());
create policy meal_write on public.meal_checks for all
  using (public.is_admin() or public.is_homeroom_of(classroom_id))
  with check (public.is_admin() or public.is_homeroom_of(classroom_id));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.meal_checks;
    exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
