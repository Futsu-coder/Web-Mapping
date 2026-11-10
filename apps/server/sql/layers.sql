-- ระบบ Layer + ตารางย่อย — รันใน Supabase SQL Editor หลัง `bun run db:push` (รันซ้ำได้)
-- ต้องรัน realtime.sql มาก่อนแล้ว (ใช้ฟังก์ชัน my_group_id() จากไฟล์นั้น)

-- 1) ⚠️ ล้างข้อมูล feature เดิมทั้งหมด (สมัยใช้ category — ไม่ย้ายเข้า layer)
--    users / groups / คำเชิญ / การแจ้งเตือน ไม่ถูกแตะ
--    รันซ้ำหลังมีข้อมูลจริงแล้ว = ลบ feature ทั้งหมดอีกรอบ → ใส่ comment บรรทัดนี้ก่อนรันซ้ำ
delete from public.features;

-- 2) RLS: อ่านได้เฉพาะของ group ตัวเอง (ใช้แค่ฟัง Realtime — เขียนผ่าน API เท่านั้น ไม่มี policy insert/update/delete)
alter table public.layers enable row level security;
alter table public.related_tables enable row level security;
alter table public.related_records enable row level security;

drop policy if exists "layers of my group" on public.layers;
create policy "layers of my group" on public.layers
  for select to authenticated using (group_id = public.my_group_id());

drop policy if exists "related tables of my group" on public.related_tables;
create policy "related tables of my group" on public.related_tables
  for select to authenticated using (
    exists (select 1 from public.layers l where l.id = layer_id and l.group_id = public.my_group_id())
  );

drop policy if exists "related records of my group" on public.related_records;
create policy "related records of my group" on public.related_records
  for select to authenticated using (
    exists (select 1 from public.features f where f.id = feature_id and f.group_id = public.my_group_id())
  );

-- 3) ให้ Supabase Realtime ส่ง event ของ 3 ตาราง (หน้าเว็บโหลดรายการใหม่เมื่อมีการเปลี่ยน)
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'layers') then
    alter publication supabase_realtime add table public.layers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'related_tables') then
    alter publication supabase_realtime add table public.related_tables;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'related_records') then
    alter publication supabase_realtime add table public.related_records;
  end if;
end $$;
