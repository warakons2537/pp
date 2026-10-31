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
notify pgrst, 'reload schema';
