# CLAUDE.md

Web Mapping & Geospatial API — งานสหกิจ (ทำ 2 คน) สร้าง/แก้/ลบ Point, LineString, Polygon บนแผนที่ ผ่าน REST API ที่รับส่ง GeoJSON

- ตอบผู้ใช้เป็นภาษาไทยเสมอ คอมเมนต์ในโค้ดก็เขียนภาษาไทย (ทำตามสไตล์ที่มีอยู่)
- โจทย์จริงที่ต้องทำให้ครบ: แผนที่บนเว็บ, CRUD 3 ชนิด, บันทึก/เรียกดูได้, REST API, GeoJSON, เว็บต่อ API ได้จริง, ส่ง URL + deployment + presentation

## Stack
- **Web:** React 19 + Vite + Tailwind 4 + MapLibre GL 6 (vector tiles ของ OpenFreeMap) + @mapbox/mapbox-gl-draw
- **API:** Elysia (Bun) + Drizzle ORM (postgres.js)
- **DB/Auth/Realtime:** Supabase (PostgreSQL + PostGIS, SRID 4326)
- **Deploy:** Vercel project เดียว — `api/index.ts` เป็นตัวเชื่อม: `vercel.json` rewrite `/api/*` → `api/index.ts` → Elysia `app` ใน `apps/server/src/index.ts`

## คำสั่ง (ใช้ bun เท่านั้น)
- `bun run dev` — API (:3000) + เว็บ (:5173 proxy `/api` → :3000)
- `bun run build` — `tsc --noEmit` + vite build (ใช้เช็ก type)
- `bun run lint` — ESLint
- `bun run db:push` — sync schema จาก `apps/server/src/db/schema.ts`
- preview ใน browser pane: `.claude/launch.json` ชื่อ `web` (รันแค่เว็บ — ถ้าต้องใช้ API ต้องรัน `dev:api` แยก)

## โครงสร้าง
```
api/index.ts                  Vercel Function entry (ไม่มี logic)
apps/server/src/
  index.ts                    สร้าง app prefix /api, openapi docs (dev หรือ ENABLE_DOCS=true), /health
  server.ts                   app.listen(3000) สำหรับ dev
  auth.ts                     ตรวจ Bearer token ของ Supabase → CurrentUser { id, groupId, isGroupOwner }
  validation.ts               TypeBox schema: FeatureIn (GeoJSON Feature), FeaturePatch (Merge Patch), GeomType
  routes/features.ts          CRUD /api/features — ตรวจรูปทรงด้วย ST_IsValid → 422
  routes/{auth,groups,notifications}.ts
  db/schema.ts                groups, profiles, invitations, notifications, features (geom = geometry 4326)
apps/server/sql/              schema.sql (เปิด PostGIS), realtime.sql (RLS + Realtime) — รันใน Supabase SQL Editor
apps/shared/                  ใช้ร่วม web+server: categories.ts, auth.ts
apps/web/src/
  App.tsx                     state หลักทั้งหมด (items, selection, draw, guest, save/remove/edit) — ไฟล์ใหญ่
  api.ts                      fetch wrapper + Bearer token, listFeatures/createFeature/patchFeature/deleteFeature
  components/MapView.tsx      สร้างแผนที่ MapLibre + mapbox-gl-draw (setWorkerUrl + prewarm, fallback เป็น OSM PNG)
  hooks/useFeatureData.ts     โหลด feature (API / localStorage) + ฟัง Realtime → items ใน App
  hooks/useMapEvents.ts       click/hover บนแผนที่ + event ของ draw (create/update/selectionchange/modechange)
  lib/mapLayers.ts            source/layer ของเรา (shapes, points แบบ cluster, crosshair) + feature-state hover/selected
  lib/mapStyle.ts             URL style vector, style สำรอง, WORLD_BOUNDS
  components/SearchBox.tsx    ค้นหาสถานที่ผ่าน Nominatim
  components/mobile/          UI มือถือ: วาดด้วยกากบาทกลางจอ (CrosshairDraw + hooks/useCrosshairDraw), sheet ด้านล่าง
  lib/featureMeta.ts          propsOf, sameGeometry, bbox/center ของ geometry
  lib/measure.ts              พื้นที่/ความยาว/ตัดกันเอง (จุดเป็น [lng, lat])
  lib/scaleControl.ts         สเกลบาร์ซ้ายล่าง (มือถือ+คอม) ความยาวคงที่ 96px เลขเปลี่ยนตามซูม
  lib/realtime.ts             Supabase Realtime subscribe feature changes
  lib/idleLogout.ts           auto logout เมื่อไม่ใช้งาน 1 วัน (localStorage)
```

## กฎ/แนวคิดที่ต้องรู้
- **API features ต้อง login** (Bearer token) ยกเว้น `/api/health`, `/api/auth/signup`; เห็นเฉพาะ feature ใน group ตัวเอง (group อื่น = 404)
- แก้/ลบได้เมื่อเป็นเจ้าของ feature หรือเจ้าของ group → ไม่งั้น 403 (ฝั่งเว็บใช้ `canModifyOwner` ใน App.tsx)
- **PATCH = JSON Merge Patch (RFC 7396)**: ส่งเฉพาะที่เปลี่ยน, `null` ใน properties = ลบ key; เว็บส่งเฉพาะ diff (ดู `save` ใน App.tsx)
- `name` เก็บเป็นคอลัมน์แยก, ฟิลด์อื่นอยู่ใน `properties` (jsonb); SYSTEM_KEYS (name, geom_type, owner_*, *_at) client เขียนทับไม่ได้
- Polygon ห้ามตัดกันเอง (เว็บตรวจด้วย `selfIntersects` ตอนวาด/ลากจุด/บันทึก, server ตรวจ ST_IsValid)
- **โหมดทดลอง (guest)** = ยังไม่ login: id ติดลบ ไม่ยิง API ไม่ฟัง Realtime — เก็บใน localStorage (`lib/guestStore.ts`) ลบทั้งชุดเมื่อครบ 1 ชม. นับจาก feature ชิ้นแรก
- เปลี่ยนบัญชี/group → `viewKey` เปลี่ยน → ล้าง items แล้ว `useFeatureData` โหลดชุดใหม่
- เทียบรูปทรงที่ 6 ทศนิยม (`sameGeometry`) เพราะ PostGIS ตอบละเอียดกว่าที่วาดบนเว็บ
- **items ใน App คือข้อมูลจริง** แผนที่แค่วาดตาม (`setFeatureData`); รูปที่กำลังแก้/ย้ายอยู่ใน draw และถูกซ่อนจาก source ปกติ
  id ใน draw: แก้ = `f<id>`, ย้าย (Move) = `m<id>`, วาดใหม่ = id ที่ draw สร้าง
- MapLibre 6: `maxBounds` กว้างครบ 360° ทำให้พัง (ใช้ ±179.99), ต้อง `setWorkerUrl` ไม่งั้น Vite หาไฟล์ worker ไม่เจอ (vector tile ไม่ถูกแปลง)
- โหมด 3D (ปุ่มใน Toolbar): เอียง 60° + หมุนได้ + ภูเขา (raster-dem ของ AWS Terrarium + hillshade, โหลดเฉพาะตอนเปิด 3D)
  + ตึก `building-3d` ที่มีใน style Liberty (ซูม ≥ 14)
  ระหว่างวาด/แก้/Move แผนที่กลับเป็น 2D ชั่วคราว (`mustBeFlat` ใน App.tsx) เพราะ draw ทำงานคลาดเมื่อแผนที่เอียง
- ลดกระตุกตอนซูม: worker แปลง tile 2–4 ตัว (`setWorkerCount`) + cache 8 ระดับซูม (`maxTileCacheZoomLevels`) — เคยลองหน้า loading + โหลด tile ล่วงหน้าแล้ว ไม่จำเป็น เอาออก
- ทดสอบใน tab ที่ถูกซ่อน (เช่น browser pane ที่ไม่ได้แสดง): requestAnimationFrame หยุด → MapLibre ไม่วาด / ไม่ยิง load — ไม่ใช่บั๊ก
- Nominatim: ไม่เกิน 1 req/วินาที (`MIN_INTERVAL_MS` ใน SearchBox) — autocomplete ใช้ debounce + cache + AbortController ยกเลิกคำค้นเก่า
- มือถือ: input ต้อง `text-base` (16px) กัน iOS ซูมเอง

## งานที่วางแผนไว้
แผนละเอียด: `~/.claude/plans/home-panapong-downloads-docx-mossy-nautilus.md`
1. ✅ ทำใน branch `group/realtime`: SearchBox autocomplete (debounce + AbortController + throttle + cache) และ guest เก็บ localStorage ลบทุก 1 ชม. พร้อมแบนเนอร์นับถอยหลัง
2. 🚧 branch `feat/maplibre`: ย้าย Leaflet/Geoman → MapLibre + @mapbox/mapbox-gl-draw, vector tiles (OpenFreeMap), ปุ่ม 3D (ภูเขา + ตึก)

## Git
- branch หลัก `main`, ทำงานผ่าน PR ไปที่ `Futsu-coder/Web-Mapping`
- ใช้ `gh` CLI (GitHub connector ใช้ไม่ได้)
- commit/push เฉพาะเมื่อผู้ใช้สั่ง
