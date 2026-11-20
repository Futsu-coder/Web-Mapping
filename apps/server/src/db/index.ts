import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — copy .env.example to .env at the project root')
}

// Supabase transaction pooler (port 6543) ไม่รองรับ prepared statements
// bun --hot (dev) โหลดไฟล์ใหม่ทุกครั้งที่แก้โค้ดแต่ process เดิมยังอยู่ ถ้าสร้าง client ใหม่ทุกรอบ
// connection ของ client เก่าจะค้างไม่ถูกปิด -> เก็บ client ไว้ใน globalThis ใช้ตัวเดิมตลอด process
const shared = globalThis as { __webMappingPg?: ReturnType<typeof postgres> }
const client = (shared.__webMappingPg ??= postgres(process.env.DATABASE_URL ?? '', { prepare: false }))

export const db = drizzle(client, { schema })
