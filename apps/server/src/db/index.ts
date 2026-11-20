import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set — copy .env.example to .env at the project root')
}

// Supabase transaction pooler (port 6543) ไม่รองรับ prepared statements
// connect_timeout: ต่อ Supabase ไม่ติดภายใน 10 วิ -> query พังพร้อม error (ค่าเดิมของ postgres.js คือ 30 วิ
//   เท่ากับ idleTimeout 30 วิของ Elysia พอดี -> request ถูกตัดก่อน ไม่มี error ให้เห็น เหลือแค่ 502 / socket hang up)
// idle_timeout: connection ที่ว่างเกิน 20 วิ ปิดเอง (ค่าเดิม = ถือไว้ตลอด) กันไว้ก่อน: ทิ้งไว้นาน ๆ connection อาจถูกตัดเงียบ ๆ
//   (pooler ตัด / เครื่อง sleep / เน็ตเปลี่ยน) แต่ client ไม่รู้ แล้ว query ที่ได้เส้นนั้นค้าง
// max_pipeline: 1 = ห้ามส่งหลาย query ซ้อนในสายเดียว (ค่าเดิม 100) / query พร้อมกันเกินจำนวนสาย (max 10)
//   postgres.js จะส่งซ้อนลงสายที่ไม่ว่าง แต่ transaction pooler ของ Supabase ไม่ตอบ query ที่ซ้อนมา -> ค้างทั้งสาย
//   (ทดสอบ 20 query พร้อมกัน: ค่าเดิมค้าง 90/100, max_pipeline 1 ผ่าน 100/100) อาการคือเปิดหน้าแมปแล้วบาง request ค้าง 30 วิ -> 502
// bun --hot (dev) โหลดไฟล์ใหม่ทุกครั้งที่แก้โค้ดแต่ process เดิมยังอยู่ ถ้าสร้าง client ใหม่ทุกรอบ
// connection ของ client เก่าจะค้างไม่ถูกปิด -> เก็บ client ไว้ใน globalThis ใช้ตัวเดิมตลอด process
const shared = globalThis as { __webMappingPg?: ReturnType<typeof postgres> }
const client = (shared.__webMappingPg ??= postgres(process.env.DATABASE_URL ?? '', { prepare: false, connect_timeout: 10, idle_timeout: 20, max_pipeline: 1 }))

export const db = drizzle(client, { schema })
