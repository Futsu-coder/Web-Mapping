# Web Mapping & Geospatial API

Web Application สำหรับสร้าง แก้ไข และลบข้อมูลเชิงพื้นที่ (Point, LineString, Polygon) บนแผนที่ พร้อม REST API ที่รับส่งข้อมูลเป็น GeoJSON

- **Frontend:** React + Vite + react-leaflet + Leaflet-Geoman
- **Backend:** Elysia.js (Bun) + Drizzle ORM (postgres.js)
- **Database:** Supabase (PostgreSQL + PostGIS)
- **Deploy:** Vercel (project เดียว — web + `/api`)

โครงสร้างโฟลเดอร์ดูที่ [STRUCTURE.md](STRUCTURE.md)

## เริ่มต้น

1. ติดตั้ง [Bun](https://bun.sh) แล้วรัน `bun install`
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ connection string ของ Supabase (Transaction pooler, port 6543)
3. รัน `apps/server/sql/schema.sql` (เปิด PostGIS) ใน Supabase SQL Editor ครั้งเดียว แล้ว `bun run db:push` เพื่อสร้างตาราง
4. `bun run dev` แล้วเปิด
   - เว็บ: http://localhost:5173
   - API docs: http://localhost:3000/api/openapi

## Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `bun run dev` | รัน API + เว็บพร้อมกัน |
| `bun run dev:api` | API ที่ `localhost:3000` |
| `bun run dev:web` | เว็บที่ `localhost:5173` (ส่ง `/api` ต่อไปที่ API) |
| `bun run build` | type check + build เว็บ |
| `bun run lint` | ESLint |
| `bun run db:push` | สร้าง/อัปเดตตารางตาม `apps/server/src/db/schema.ts` |
| `bun run db:studio` | เปิด Drizzle Studio ดูข้อมูลในตาราง |

## API

| Method | Path | ผลลัพธ์ |
|---|---|---|
| GET | `/api/features?type=Point\|LineString\|Polygon` | FeatureCollection |
| GET | `/api/features/:id` | Feature / 404 |
| POST | `/api/features` | 201 + Feature |
| PUT | `/api/features/:id` | Feature / 404 (แทนที่ทั้งก้อน) |
| PATCH | `/api/features/:id` | Feature / 400 / 404 / 422 (แก้เฉพาะส่วนที่ส่งมา) |
| DELETE | `/api/features/:id` | 204 / 404 |

PATCH ใช้ JSON Merge Patch (RFC 7396): ส่ง Feature บางส่วน เช่น `{"properties":{"name":"ใหม่"}}` หรือ `{"geometry":{...}}` — ค่า `null` ใน properties = ลบ key นั้น, ไม่ส่งอะไรเลย → 400

geometry ที่ไม่ใช่ 3 ชนิดนี้ หรือรูปทรงไม่ถูกต้อง (เช่น Polygon ตัดกันเอง) → 422

## Deploy (Vercel)

Import repo นี้เป็น project เดียว แล้วตั้ง Environment Variable `DATABASE_URL` — ค่าอื่นอ่านจาก `vercel.json`
