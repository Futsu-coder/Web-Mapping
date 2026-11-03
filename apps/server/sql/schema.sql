-- รันใน Supabase SQL Editor ครั้งเดียว ก่อน `bun run db:push`
-- (ตาราง features สร้างจาก apps/server/src/db/schema.ts ด้วย Drizzle)
create extension if not exists postgis;
