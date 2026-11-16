-- ลำดับ/การซ่อน layer ส่วนตัวของผู้ใช้ — รันใน Supabase SQL Editor หลัง `bun run db:push` (รันซ้ำได้)
-- เขียนผ่าน API เท่านั้น (service role) — RLS ให้ผู้ใช้อ่านได้เฉพาะแถวของตัวเอง, ไม่มี policy เขียน
-- ไม่เพิ่มเข้า Realtime: การเรียงของคนอื่นต้องไม่กระทบจอเรา
alter table public.user_layer_preferences enable row level security;

drop policy if exists "my layer preferences" on public.user_layer_preferences;
create policy "my layer preferences" on public.user_layer_preferences
  for select to authenticated using (user_id = auth.uid());
