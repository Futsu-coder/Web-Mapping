import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/server/src/db/schema.ts',
  out: './apps/server/drizzle',
  // drizzle-kit ใช้ prepared statements ซึ่ง Transaction pooler (6543) ไม่รองรับ (ผลลัพธ์ query สลับกันจน push พัง)
  // → ใช้ Session pooler (5432 host เดียวกัน) เฉพาะตอนรัน drizzle-kit ส่วน API ยังใช้ 6543 เหมือนเดิม
  dbCredentials: { url: process.env.DATABASE_URL!.replace(':6543/', ':5432/') },
  // ไม่ให้ drizzle-kit ไปยุ่งกับตารางของ PostGIS (spatial_ref_sys)
  extensionsFilters: ['postgis'],
  // ข้ามตารางของ PostGIS ตั้งแต่ตอนอ่านโครงสร้าง (เป็นของ supabase_admin ไม่ใช่ของเรา)
  tablesFilter: ['!spatial_ref_sys']
})
