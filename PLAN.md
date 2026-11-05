# แผนงาน Step by Step

ส่งงาน **จันทร์ 9 พ.ย. 2026** — ทำทีละขั้นตามลำดับ ติ๊ก `[x]` เมื่อเสร็จ

## ✅ ขั้นที่ 0 — โครงโปรเจกต์ (เสร็จแล้ว)
- [x] หน้าเว็บแผนที่ วาด Point / LineString / Polygon ได้ (ข้อมูลยังอยู่ใน memory)
- [x] API Elysia CRUD `/api/features` + validation
- [x] โครงสร้าง `apps/web`, `apps/server`, `api/`, config ที่ root, ใช้ bun

## ขั้นที่ 1 — ตั้ง Database (อ. 3 พ.ย.)
- [x] สร้าง project ใน Supabase (region Singapore)
- [x] รัน `apps/server/sql/schema.sql` ใน SQL Editor (เปิด PostGIS)
- [x] คัดลอก `.env.example` → `.env` ใส่ connection string แบบ **Transaction pooler (port 6543)**
- [x] `bun run db:push` → สร้างตาราง features
- [x] `bun run dev:api` → เปิด `/api/health` ได้ `{"status":"ok"}`

## ขั้นที่ 2 — ทดสอบ API ผ่านหน้า docs (อ. 3 พ.ย.)
เปิด http://localhost:3000/api/openapi แล้วกด Try it out
- [x] POST ทั้ง 3 ชนิด → ได้ 201
- [x] GET รายการ และ `?type=Point` กรองได้
- [x] GET / PUT ตาม id ได้ และ id ที่ไม่มี → 404
- [x] DELETE → 204
- [x] ส่ง Polygon ตัดกันเอง หรือชนิดอื่น (เช่น MultiPoint) → 422
- [x] ดูข้อมูลในตาราง Supabase ว่าถูกบันทึกจริง

## ขั้นที่ 3 — Deploy เปล่าขึ้น Vercel ก่อน (พ. 4 พ.ย.)
ทำก่อนต่อหน้าเว็บ เพื่อเจอปัญหา deploy ให้เร็วที่สุด
- [x] Import repo เข้า Vercel (project เดียว)
- [x] ตั้ง Environment Variable `DATABASE_URL`
- [x] เปิด URL จริง: หน้าเว็บขึ้น, `/api/health` ok, `/api/openapi` ต้อง **404** (docs ปิดบน production)
- [x] ถ้า `/api/*` ใช้ไม่ได้ → ดู Function logs ใน Vercel แล้วแก้ก่อนไปขั้นต่อไป

## ขั้นที่ 4 — ต่อหน้าเว็บกับ API (พ. 4 – พฤ. 5 พ.ย.)
- [x] แก้ lint error ใน `App.tsx` (`mapRef.current = useMap()` ตอน render)
- [x] สร้าง `apps/web/src/api.ts` — `listFeatures`, `createFeature`, `updateFeature`, `deleteFeature`
- [x] **โหลด:** เปิดหน้าเว็บแล้วดึงข้อมูลจาก API มาแสดงบนแผนที่ + sidebar
- [x] **สร้าง:** วาดเสร็จ (`pm:create`) → POST → ผูก id ที่ได้กับ layer
- [x] **แก้ไข:** ลาก vertex / ย้าย (`pm:edit`) → PUT
- [x] **แก้ชื่อ:** ฟอร์มหรือปุ่มแก้ชื่อใน sidebar → PUT
- [x] **ลบ:** ปุ่มลบใน sidebar และเครื่องมือลบบนแผนที่ (`pm:remove`) → DELETE
- [x] แสดงข้อความเมื่อ API error (เช่น 422)
- [x] ทดสอบ: วาด 3 ชนิด → refresh → ข้อมูลยังอยู่ → แก้ → ลบ

## ขั้นที่ 5 — Deploy ฉบับจริง + เก็บงาน (ศ. 6 พ.ย.)
- [ ] push แล้วให้ Vercel deploy ใหม่
- [ ] ทดสอบครบทุกอย่างบน URL จริง (ทั้งคอมและมือถือ)
- [ ] `bun run lint` และ `bun run build` ผ่าน
- [ ] ใส่ URL ที่ deploy ใน README

## ขั้นที่ 6 — ของเสริม ถ้ามีเวลา (ส. 7 พ.ย.)
- [ ] แสดงระยะทาง (LineString) / พื้นที่ (Polygon) ด้วย `ST_Length` / `ST_Area` แบบ geography
- [ ] Export ข้อมูลทั้งหมดเป็นไฟล์ `.geojson`
- [ ] Import ไฟล์ `.geojson`
- [ ] ค้นหาตามชื่อ

## ขั้นที่ 6.1 — UX เพิ่มเติม (ส. 7 พ.ย.)
- [x] **Hover:** ชี้ที่รายการใน sidebar แล้วรูปบนแผนที่ไฮไลต์ และชี้ที่รูปบนแผนที่แล้วรายการไฮไลต์ (ปรับ style ของ layer ตอน mouseover/mouseout)
- [x] **Cluster:** รวมหมุด Point ที่อยู่ใกล้กันเป็นกลุ่มพร้อมตัวเลข ซูมเข้าแล้วแตกออก (`leaflet.markercluster`) ส่วน Line และ Polygon ไม่ต้อง cluster
- [x] **ค้นหาสถานที่ (Find location):** ช่องค้นหาชื่อสถานที่แล้วแผนที่บินไปตำแหน่งนั้น ใช้ Nominatim (OpenStreetMap) ซึ่งฟรี ค้นหาตอนกด Enter เท่านั้น (เงื่อนไขของ Nominatim: ≤ 1 req/s และห้ามทำ autocomplete)

## ขั้นที่ 6.2 — ระบบ User + Group + Realtime (แทน Login แบบเบา)

1 คนอยู่ได้ 1 group / ทุกคนใน group เห็น feature ของทุกคน / แก้-ลบได้เฉพาะของตัวเอง ยกเว้น**เจ้าของ group** (แอดมิน) แก้-ลบได้ทุกอัน

โค้ดเขียนเสร็จแล้ว (branch `group/realtime`) — เหลือตั้งค่า Supabase + ทดสอบ
- [x] **Realtime:** Supabase Realtime (Postgres Changes) ฟังตาราง `features` และ `invitations` — ได้ event แล้วค่อยดึง feature จาก API
- [x] **User:** UserID (`#1001` ขึ้นไป) / username ไม่ซ้ำ / password ≥ 8 ผ่าน Supabase Auth (username → อีเมลภายใน `@users.example.com`)
  - username: `a-z 0-9 _` ยาว 3–20 ตัว และ**ห้ามเป็นตัวเลขล้วน** (กันสับสนกับ UserID)
  - สมัครผ่าน `POST /api/auth/signup` (secret key ฝั่ง API) → ได้ group ส่วนตัวทันที
- [x] **Database:** ตาราง `groups` (มี `owner_id`), `profiles` (มี `joined_at`), `invitations` + `owner_id`, `group_id` ใน `features`
  - `owner_id` / `group_id` เป็น nullable → `db:push` ได้เลยโดย production (โค้ดเก่า) ไม่พัง
- [x] **API:** feature ต้อง login (ไม่มี token → 401) / แก้-ลบของคนอื่น → 403 (ยกเว้นเจ้าของ group) / `/api/me`, `/api/group`, `/api/invitations`
- [x] **Group:** ยอมรับคำเชิญ = ย้าย group / ออกจาก group = ได้ group ส่วนตัวใหม่
  - เจ้าของออก/ย้ายไป group อื่น → โอนเจ้าของให้สมาชิกที่อยู่นานที่สุดอัตโนมัติ
  - เชิญด้วย **UserID หรือ username** ในช่องเดียว แล้วขึ้น "ส่งคำเชิญถึง <ชื่อ> (#UserID) แล้ว"
  - เจ้าของ group เปลี่ยนชื่อ group ได้
- [x] **Notification:** การ์ดคำเชิญมุมขวาล่าง ปุ่ม ยอมรับ / ปฏิเสธ (เด้งทันทีด้วย Realtime)
- [x] **ซ่อน feature ของสมาชิก:** เมนู group → กดรูปตาข้างชื่อ (ซ่อนแค่บนจอตัวเอง)
- [x] **โหมดทดลอง:** ยังไม่ login ก็วาด/แก้/ลบได้ แต่ไม่บันทึก (หายเมื่อรีเฟรช)
- [x] **หมดเวลา:** ไม่ได้ใช้งานเกิน 1 วัน → ออกจากระบบอัตโนมัติ (ตรวจฝั่งเว็บ `lib/idleLogout.ts` เพราะ Inactivity timeout ของ Supabase มีเฉพาะแพ็กเกจ Pro)
- [ ] ตั้งค่า Supabase (ทำเอง)
  1. `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`
  2. Authentication → Sign In / Providers → ปิด **Allow new users to sign up**
  3. `bun run db:push` → รัน `apps/server/sql/realtime.sql` ใน SQL Editor (**ลบ feature เก่าที่ไม่มีเจ้าของ**)
  4. ตอน deploy: ใส่ 3 ค่าเดียวกันใน Vercel
- [ ] ทดสอบ: 2 บัญชีคนละ browser → เชิญ → ยอมรับ → วาดแล้วอีกฝั่งเห็น / คนละ group ไม่เห็นกัน
  - สมาชิกลาก/แก้/ลบของคนอื่นไม่ได้ / เจ้าของ group แก้ของสมาชิกได้ / เจ้าของออก → คนอยู่นานสุดเป็นเจ้าของ
  - เชิญด้วย `#1001`, `1001`, username ตัวพิมพ์ใหญ่ → ได้คนเดียวกัน / ไม่พบผู้ใช้ → 404 / เชิญซ้ำตอนยัง pending → 409 / เชิญตัวเอง → 400
  - ไม่ login: วาดได้ ไม่มี request ไป API / รีเฟรชแล้วหาย

## ขั้นที่ 7 — นำเสนอ (อา. 8 พ.ย.)
- [ ] ทำ slides ตาม 5 หัวข้อของโจทย์
  1. แนวคิดและการออกแบบระบบ (แผนภาพ web → api → PostGIS)
  2. เทคโนโลยีที่เลือก + เหตุผล (Elysia, PostGIS, Leaflet-Geoman, Vercel, Supabase)
  3. สาธิต Web และ API (หน้า `/api/openapi` บนเครื่องตัวเอง หรือตั้ง `ENABLE_DOCS=true` บน Vercel ชั่วคราว)
  4. การแบ่งหน้าที่
  5. ปัญหาที่เจอ + วิธีแก้ (จดไว้ระหว่างทำทุกขั้น)
  6. (เสริม) แนวทางพัฒนาต่อ — 1 คนอยู่ได้หลาย group, บทบาท admin / เตะสมาชิก, import/export GeoJSON ฯลฯ
- [ ] อัดวิดีโอเดโมสำรอง เผื่อเน็ตหรือเซิร์ฟเวอร์มีปัญหา
- [ ] ซ้อมนำเสนอ + ซ้อมตอบคำถาม เช่น ทำไมใช้ PostGIS, SRID 4326 คืออะไร, GeoJSON เรียงพิกัดยังไง

## ขั้นที่ 8 — วันนำเสนอ (จ. 9 พ.ย.)
- [ ] เปิด Supabase และ URL ที่ deploy ก่อนเริ่ม ให้แน่ใจว่าไม่หลับ
- [ ] นำเสนอ

## จดปัญหาที่เจอ (ใช้ทำ slide ข้อ 5)
| วันที่ | ปัญหา | วิธีแก้ |
|---|---|---|
| | | |
