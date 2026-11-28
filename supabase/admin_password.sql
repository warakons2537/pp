-- =====================================================================
-- ผู้ดูแลระบบตั้งรหัสผ่านใหม่ให้ครู (ตั้งค่าระบบ > ผู้ใช้ > ตั้งรหัสผ่าน)
-- รันไฟล์นี้ใน Supabase SQL Editor ได้เลย (รันซ้ำได้ และไม่แตะตารางอื่น)
--  เรียกได้เฉพาะผู้ดูแลระบบ · รหัสผ่านเข้ารหัสแบบ bcrypt เหมือนที่ Supabase ใช้
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'; end if;
  if length(p_password) > 72 then raise exception 'รหัสผ่านยาวเกิน 72 ตัวอักษร'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
   where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีเข้าสู่ระบบนี้'; end if;
end $$;
revoke execute on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
