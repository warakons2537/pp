-- เวลาเรียนนับเฉพาะช่วงที่นักเรียนอยู่ในห้อง (รองรับนักเรียนย้ายเข้า/ออกกลางปี)
-- รันไฟล์นี้ใน Supabase → SQL Editor หนึ่งครั้ง (ปลอดภัยที่จะรันซ้ำ)

create or replace function public.daily_attendance_summary(cid uuid, d_from date, d_to date)
returns table (student_id uuid, present int, late int, sick int, leave int, absent int,
               school_days int, pct numeric)
language sql stable security invoker set search_path = public as $$
  -- จำนวนวันเรียนนับเฉพาะช่วงที่นักเรียนอยู่ในห้อง (entered_on..left_on) — คนย้ายเข้ากลางปีไม่ถูกนับวันก่อนเข้า
  select e.student_id,
    count(*) filter (where a.status = 'present')::int,
    count(*) filter (where a.status = 'late')::int,
    count(*) filter (where a.status = 'sick')::int,
    count(*) filter (where a.status = 'leave')::int,
    count(*) filter (where a.status = 'absent')::int,
    d.n,
    case when d.n = 0 then null
         else round(100.0 * count(*) filter (where a.status in ('present','late')) / d.n, 2) end
  from public.enrollments e
  cross join lateral (
    select count(distinct x.date)::int n from public.daily_attendance x
    where x.classroom_id = cid
      and x.date between greatest(d_from, coalesce(e.entered_on, d_from)) and least(d_to, coalesce(e.left_on, d_to))
  ) d
  left join public.daily_attendance a
    on a.student_id = e.student_id and a.classroom_id = cid and a.date between d_from and d_to
  where e.classroom_id = cid
  group by e.student_id, d.n
$$;

create or replace function public.course_attendance_summary(crs uuid)
returns table (student_id uuid, attended int, total_periods int, pct numeric, below_80 boolean)
language sql stable security invoker set search_path = public as $$
  -- จำนวนคาบนับเฉพาะช่วงที่นักเรียนอยู่ในห้อง (entered_on..left_on) — คนย้ายเข้ากลางภาคไม่ถูกนับคาบก่อนเข้า (กันติด มส โดยไม่เป็นธรรม)
  select x.student_id, x.att, x.tot,
    case when x.tot = 0 then null else round(100.0 * x.att / x.tot, 2) end,
    case when x.tot = 0 then false else 100.0 * x.att / x.tot < 80 end
  from (
    select e.student_id,
      (select count(*)::int from public.period_attendance a
        where a.course_id = crs and a.student_id = e.student_id and a.status in ('present','late')) att,
      (select count(*)::int from (select distinct p.date, p.period from public.period_attendance p
        where p.course_id = crs
          and p.date between coalesce(e.entered_on, date '0001-01-01') and coalesce(e.left_on, date '9999-12-31')) s) tot
    from public.courses c
    join public.enrollments e on e.classroom_id = c.classroom_id
    where c.id = crs
  ) x
$$;
