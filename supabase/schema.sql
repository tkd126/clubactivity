-- Supabase SQL Editor에서 실행하세요. 공개 회원가입은 Auth 설정에서 끕니다.
begin;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('teacher','student')),
 student_number smallint unique,
 check((role='teacher' and student_number is null) or (role='student' and student_number is not null and student_number between 1 and 27))
);
create table if not exists public.records (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles(id) on delete cascade,
 student_number smallint not null check(student_number between 1 and 27),
 date date not null,
 period smallint not null check(period in (1,2)),
 activity text not null check(length(trim(activity)) between 1 and 2000),
 participation text not null default '' check(length(participation)<=2000),
 learning text not null default '' check(length(learning)<=2000),
 updated_at timestamptz not null default now(),
 unique(student_id,date,period)
);
create table if not exists public.teacher_notes (
 student_number smallint not null references public.profiles(student_number),
 date date not null,
 period smallint not null check(period in (1,2)),
 note text not null default '' check(length(note)<=4000),
 updated_at timestamptz not null default now(),
 primary key(student_number,date,period)
);
create table if not exists public.remarks (
 student_number smallint primary key references public.profiles(student_number),
 remark text not null default '' check(length(remark)<=4000),
 updated_at timestamptz not null default now()
);
create or replace function public.is_teacher() returns boolean
 language sql stable security definer set search_path=public
 as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='teacher'); $$;
revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;
create or replace function public.touch_updated_at() returns trigger
 language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists records_updated on public.records;
create trigger records_updated before update on public.records for each row execute function public.touch_updated_at();
drop trigger if exists notes_updated on public.teacher_notes;
create trigger notes_updated before update on public.teacher_notes for each row execute function public.touch_updated_at();
drop trigger if exists remarks_updated on public.remarks;
create trigger remarks_updated before update on public.remarks for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.teacher_notes enable row level security;
alter table public.remarks enable row level security;
revoke all on public.profiles,public.records,public.teacher_notes,public.remarks from anon,authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update on public.records,public.teacher_notes,public.remarks to authenticated;
grant all on public.profiles,public.records,public.teacher_notes,public.remarks to service_role;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_teacher());
drop policy if exists records_read on public.records;
create policy records_read on public.records for select to authenticated using(student_id=auth.uid() or public.is_teacher());
drop policy if exists records_insert on public.records;
create policy records_insert on public.records for insert to authenticated with check(
 student_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.student_number=records.student_number)
);
drop policy if exists records_update on public.records;
create policy records_update on public.records for update to authenticated using(student_id=auth.uid()) with check(
 student_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='student' and p.student_number=records.student_number)
);
drop policy if exists notes_teacher on public.teacher_notes;
create policy notes_teacher on public.teacher_notes for all to authenticated using(public.is_teacher()) with check(public.is_teacher());
drop policy if exists remarks_teacher on public.remarks;
create policy remarks_teacher on public.remarks for all to authenticated using(public.is_teacher()) with check(public.is_teacher());
create index if not exists records_date_idx on public.records(date,period,student_number);
commit;
