-- รันใน Supabase SQL Editor หลัง `bun run db:push` (รันซ้ำได้)
-- API ของเราต่อ database ด้วย role เจ้าของตาราง จึงไม่โดน RLS และตรวจสิทธิ์เองในโค้ด
-- RLS ด้านล่างมีไว้สำหรับหน้าเว็บที่ต่อ Supabase ตรง (anon key + session) ซึ่งใช้แค่ฟัง Realtime

-- 1) ล้างข้อมูลค้าง
-- feature เก่าที่ยังไม่มีเจ้าของ (ข้อมูลทดสอบก่อนมีระบบ login)
delete from public.features where owner_id is null;
-- group ร้างที่ไม่เหลือสมาชิก (ก่อนมีกติกาลบ group อัตโนมัติ) — feature/คำเชิญใน group ถูกลบตาม (cascade)
delete from public.groups g where not exists (select 1 from public.profiles p where p.group_id = g.id);

-- 2) group ของผู้ใช้ที่ login อยู่ (security definer → อ่าน profiles ได้โดยไม่ติด RLS ของ profiles เอง)
create or replace function public.my_group_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select group_id from public.profiles where id = auth.uid()
$$;

revoke all on function public.my_group_id() from public, anon;
grant execute on function public.my_group_id() to authenticated;

-- 3) เปิด RLS: อ่านได้เฉพาะของ group ตัวเอง ไม่มี policy insert/update/delete → เขียนตรงผ่าน Supabase ไม่ได้
alter table public.features enable row level security;
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.invitations enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "features are readable by everyone" on public.features;
drop policy if exists "features of my group" on public.features;
create policy "features of my group" on public.features
  for select to authenticated using (group_id = public.my_group_id());

drop policy if exists "profiles in my group" on public.profiles;
create policy "profiles in my group" on public.profiles
  for select to authenticated using (id = auth.uid() or group_id = public.my_group_id());

drop policy if exists "my group" on public.groups;
create policy "my group" on public.groups
  for select to authenticated using (id = public.my_group_id());

drop policy if exists "invitations to me" on public.invitations;
create policy "invitations to me" on public.invitations
  for select to authenticated using (invitee_id = auth.uid());

drop policy if exists "my notifications" on public.notifications;
create policy "my notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- 4) ให้ Supabase Realtime ส่ง event ของ features, invitations และ notifications
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'features') then
    alter publication supabase_realtime add table public.features;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'invitations') then
    alter publication supabase_realtime add table public.invitations;
  end if;
end $$;
