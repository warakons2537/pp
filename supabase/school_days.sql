-- =====================================================================
-- วันหยุด / วันสำคัญของโรงเรียน (แสดงในหน้าเช็กชื่อ)
-- รันไฟล์นี้ใน Supabase SQL Editor ได้เลย (รันซ้ำได้ และไม่แตะตารางอื่น)
--  kind = holiday: วันหยุด (ช่องเช็กชื่อของวันนั้นถูกปิด) · note: วันสำคัญ/ข้อความแจ้ง (ยังเช็กชื่อได้)
--  ครูทุกคนอ่านได้ · ผู้ดูแลระบบเท่านั้นที่เพิ่ม/แก้/ลบ
-- =====================================================================
create table if not exists public.school_days (
  id          uuid primary key default gen_random_uuid(),
  day         date not null unique,
  name        text not null,
  kind        text not null default 'holiday' check (kind in ('holiday','note')),
  created_at  timestamptz not null default now()
);
alter table public.school_days enable row level security;
drop policy if exists school_days_read  on public.school_days;
drop policy if exists school_days_admin on public.school_days;
create policy school_days_read  on public.school_days for select using (public.is_staff());
create policy school_days_admin on public.school_days for all using (public.is_admin()) with check (public.is_admin());
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.school_days;
    exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
