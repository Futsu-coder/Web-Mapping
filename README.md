# Web Mapping & Geospatial API

Web Application สำหรับสร้าง แก้ไข และลบข้อมูลเชิงพื้นที่ (Point, LineString, Polygon) บนแผนที่ พร้อม REST API ที่รับส่งข้อมูลเป็น GeoJSON

- **Frontend:** React + Vite + react-leaflet + Leaflet-Geoman
- **Backend:** Elysia.js (Bun) + Drizzle ORM (postgres.js)
- **Database:** Supabase (PostgreSQL + PostGIS)
- **Deploy:** Vercel (project เดียว — web + `/api`)

โครงสร้างโฟลเดอร์ดูที่ [STRUCTURE.md](STRUCTURE.md)

## เริ่มต้น

1. ติดตั้ง [Bun](https://bun.sh) แล้วรัน `bun install`
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่
   - `DATABASE_URL` — connection string ของ Supabase (Transaction pooler, port 6543)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` — Project Settings → API Keys (ไม่ใส่ก็ได้ เว็บจะใช้ได้แค่โหมดทดลอง)
3. รัน `apps/server/sql/schema.sql` (เปิด PostGIS) ใน Supabase SQL Editor ครั้งเดียว แล้ว `bun run db:push` เพื่อสร้างตาราง
4. รัน `apps/server/sql/realtime.sql` ใน SQL Editor (RLS + Realtime) และปิด **Allow new users to sign up** ใน Supabase Authentication (สมัครผ่าน API ของเราเท่านั้น)
5. `bun run dev` แล้วเปิด
   - เว็บ: http://localhost:5173
   - API docs: http://localhost:3000/api/openapi (เปิดเฉพาะตอน dev — บน Vercel ปิดไว้ เปิดชั่วคราวได้ด้วย env `ENABLE_DOCS=true`)

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

ทุก endpoint (ยกเว้น `/api/health` และ `/api/auth/signup`) ต้องส่ง `Authorization: Bearer <access token ของ Supabase>` ไม่มี/หมดอายุ → 401

| Method | Path | ผลลัพธ์ |
|---|---|---|
| GET | `/api/features?type=Point\|LineString\|Polygon` | FeatureCollection (เฉพาะ group ตัวเอง) |
| GET | `/api/features/:id` | Feature / 404 |
| POST | `/api/features` | 201 + Feature |
| PUT | `/api/features/:id` | Feature / 403 / 404 |
| DELETE | `/api/features/:id` | 204 / 403 / 404 |
| POST | `/api/auth/signup` | 201 / 409 (username ซ้ำ) |
| GET | `/api/me` | ตัวเอง + group + สมาชิก |
| PATCH | `/api/group` | เปลี่ยนชื่อ group (เจ้าของเท่านั้น) |
| POST | `/api/group/leave` | 204 — ได้ group ส่วนตัวใหม่ |
| POST | `/api/invitations` | 201 — `{ target }` = UserID (`#1001`) หรือ username |
| GET | `/api/invitations` | คำเชิญที่รอเราตอบ |
| POST | `/api/invitations/:id/accept` \| `reject` | 204 |

- geometry ที่ไม่ใช่ 3 ชนิดนี้ หรือรูปทรงไม่ถูกต้อง (เช่น Polygon ตัดกันเอง) → 422
- แก้/ลบได้เฉพาะ feature ของตัวเอง หรือเป็นเจ้าของ group → ไม่งั้น 403

## Deploy (Vercel)

Import repo นี้เป็น project เดียว แล้วตั้ง Environment Variables `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` — ค่าอื่นอ่านจาก `vercel.json`
