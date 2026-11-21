-- جدول المزامنة لتطبيق حساباتي
-- انسخ الملف ده كله والصقه في Supabase ← SQL Editor ← New query ← Run

create table if not exists public.records (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now()
);

create index if not exists records_user_server_updated on public.records (user_id, server_updated_at);

-- السيرفر هو اللي بيحدد وقت آخر تعديل، عشان اختلاف ساعة الأجهزة ما يأثرش على المزامنة
create or replace function public.records_touch()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  new.user_id := auth.uid();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

-- كل مستخدم يشوف ويعدل بياناته هو بس
alter table public.records enable row level security;

drop policy if exists "own records" on public.records;
create policy "own records" on public.records
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- صلاحية المستخدمين المسجلين على الجدول (الـ RLS فوق بيقصرها على بياناتهم بس)
grant select, insert, update, delete on public.records to authenticated;
