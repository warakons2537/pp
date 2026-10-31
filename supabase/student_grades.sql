-- นักเรียนตรวจสอบผลการเรียนของตัวเองโดยไม่ต้องมีบัญชี (แยกจากแท็บ 0 ร มส)
--  1) ผู้ดูแลระบบเปิดให้ดูเป็นรายภาคเรียน (terms.grades_released) · ภาคที่ยังไม่เปิดจะไม่แสดงเลย
--  2) ต้องกรอกอย่างน้อย 2 ช่อง (ชื่อ / นามสกุล / เลขประจำตัว) และทุกช่องที่กรอกต้องตรงทะเบียน
--     (เข้มกว่าแท็บ 0 ร มส เพราะเป็นผลการเรียนทั้งหมด) · ตรงหลายคน = ไม่คืนข้อมูลใคร บอกแค่จำนวนคน (matches > 1)
--  3) ฟังก์ชันคืนคะแนนดิบของนักเรียนคนนั้น แล้วหน้าเว็บคำนวณเกรดด้วยสูตรเดียวกับ ปพ.5 (js/grading.js) จึงตรงกันเสมอ
-- รันซ้ำได้ ไม่แตะตารางอื่นนอกจากเพิ่มคอลัมน์ใน terms
alter table public.terms add column if not exists grades_released boolean not null default false;
comment on column public.terms.grades_released is 'true = นักเรียนตรวจสอบผลการเรียนของภาคเรียนนี้ได้ที่หน้านักเรียนตรวจสอบผลการเรียน';

drop function if exists public.student_grades(text, text, text);
create or replace function public.student_grades(p_first text default null, p_last text default null, p_code text default null)
returns table (matches int, academic_year int, term smallint, subject_code text, subject_name text, credits numeric, hours_per_year int,
               level text, midterm_ratio smallint, final_ratio smallint, rounding text, items jsonb, scores jsonb,
               special text, ms_waived boolean, below80 boolean, att_pct numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  f text := lower(btrim(coalesce(p_first, '')));
  l text := lower(btrim(coalesce(p_last, '')));
  c text := btrim(coalesce(p_code, ''));
  n int; sid uuid;
begin
  if (case when f <> '' then 1 else 0 end + case when l <> '' then 1 else 0 end + case when c <> '' then 1 else 0 end) < 2 then return; end if;
  select count(*), (array_agg(st.id))[1] into n, sid
  from public.students st
  where (c = '' or btrim(st.student_code) = c)
    and (f = '' or lower(btrim(st.first_name)) = f)
    and (l = '' or lower(btrim(st.last_name)) = l);
  if n = 0 then return; end if;
  if n > 1 then
    return query select n, null::int, null::smallint, null::text, null::text, null::numeric, null::int, null::text, null::smallint, null::smallint,
                        null::text, null::jsonb, null::jsonb, null::text, null::boolean, null::boolean, null::numeric;
    return;
  end if;
  return query
    select 1, t.academic_year, t.term, s.code, s.name, s.credits, s.hours_per_year, cl.level, k.midterm_ratio, k.final_ratio,
      coalesce((select ss.score_rounding from public.school_settings ss limit 1), 'floor'),
      coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'max_score', i.max_score, 'title', i.title) order by i.sort_order)
                from public.assessment_items i where i.course_id = k.id), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('item_id', sc.item_id, 'score', sc.score, 'passed', sc.passed))
                from public.item_scores sc join public.assessment_items i2 on i2.id = sc.item_id
                where i2.course_id = k.id and sc.student_id = sid), '[]'::jsonb),
      cr.special, coalesce(cr.ms_waived, false),
      (att.slots > 0 and 100.0 * att.came / att.slots < 80),
      case when att.slots = 0 then null else round(100.0 * att.came / att.slots, 2) end
    from public.enrollments e
    join public.courses k on k.classroom_id = e.classroom_id
    join public.terms t on t.id = k.term_id and t.grades_released
    join public.subjects s on s.id = k.subject_id
    join public.classrooms cl on cl.id = k.classroom_id
    left join public.course_results cr on cr.course_id = k.id and cr.student_id = sid
    cross join lateral (select (select count(*) from (select distinct date, period from public.period_attendance where course_id = k.id) q)::int as slots,
                               (select count(*) from public.period_attendance a where a.course_id = k.id and a.student_id = sid and a.status in ('present','late'))::int as came) att
    where e.student_id = sid
    order by t.academic_year desc, t.term desc, s.code;
end $$;
revoke all on function public.student_grades(text, text, text) from public;
grant execute on function public.student_grades(text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
