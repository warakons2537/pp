-- =====================================================================
-- เมนูที่ผู้ดูแลระบบกำหนดให้ครูแต่ละคน
-- รันไฟล์นี้ใน Supabase SQL Editor ได้เลย (รันซ้ำได้ และไม่แตะตารางอื่น)
-- ผู้ดูแลระบบเห็นทุกเมนูเสมอ (ค่านี้ไม่มีผลกับบัญชีผู้ดูแลระบบ)
-- =====================================================================
alter table public.profiles add column if not exists menus text[];
comment on column public.profiles.menus is
  'null = เมนูตามหน้าที่ที่ได้รับมอบหมาย (อัตโนมัติ) · อาร์เรย์ = เมนูที่เปิดให้ครูคนนี้เห็น';

-- ครูเปลี่ยนสิทธิ์ตัวเองไม่ได้ (เพิ่ม menus เข้าไปในเงื่อนไขเดิม)
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() ว่าง = รันจาก SQL Editor ของเจ้าของโปรเจกต์ (ใช้กู้สิทธิ์ผู้ดูแลได้)
  if (new.role is distinct from old.role or new.has_account is distinct from old.has_account
      or new.menus is distinct from old.menus)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนสิทธิ์ผู้ใช้ได้';
  end if;
  return new;
end $$;

-- จับคู่ครูที่ยังไม่มีบัญชีกับบัญชีจริง: เมนูที่ตั้งไว้ให้รายชื่อเดิมย้ายตามมาด้วย
create or replace function public.merge_teacher(placeholder uuid, account uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.course_teachers (course_id, teacher_id)
    select course_id, account from public.course_teachers where teacher_id = placeholder on conflict do nothing;
  insert into public.classroom_teachers (classroom_id, teacher_id)
    select classroom_id, account from public.classroom_teachers where teacher_id = placeholder on conflict do nothing;
  update public.profiles set menus = coalesce(menus, (select p.menus from public.profiles p where p.id = placeholder))
    where id = account;
  delete from public.profiles where id = placeholder and not has_account;
end $$;
revoke all on function public.merge_teacher(uuid, uuid) from public, anon, authenticated;
