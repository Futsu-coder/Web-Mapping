import { app, docsEnabled } from './index'

// ไฟล์นี้ใช้รันในเครื่อง (bun run dev) เท่านั้น / Vercel ใช้ api/index.ts
const port = Number(process.env.PORT ?? 3000)
app.listen(port)
console.log(`API  → http://localhost:${port}/api`)
if (docsEnabled) console.log(`Docs → http://localhost:${port}/api/openapi`)

// ปิดแบบไม่ตัด request กลางทาง (graceful shutdown) ตอนกด Ctrl+C / โดนสั่ง SIGTERM:
//   หยุดรับ request ใหม่ -> รอ request ที่ค้างอยู่ตอบให้เสร็จ -> ปิด
// Ctrl+C 1 ครั้งมี signal มาถึง 2 รอบ (จาก terminal + concurrently ส่งต่อ) จึงไม่นับรอบที่ 2 เป็นการสั่งปิดทันที
// แต่ถ้ารอเกิน 10 วินาที (เช่น request ค้าง) ปิดเลย
// bun --hot รันไฟล์นี้ใหม่ทุกครั้งที่แก้โค้ด แต่ globalThis อยู่ต่อ: จำ app ล่าสุดไว้ และผูก signal แค่ครั้งแรก
const state = globalThis as { __webMappingApp?: typeof app; __webMappingShutdownHooked?: true }
state.__webMappingApp = app
if (!state.__webMappingShutdownHooked) {
  state.__webMappingShutdownHooked = true
  let closing = false
  const shutdown = async () => {
    if (closing) return
    closing = true
    setTimeout(() => process.exit(1), 10_000).unref()
    console.log('API  → กำลังปิด: รอ request ที่ค้างอยู่...')
    await state.__webMappingApp?.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
