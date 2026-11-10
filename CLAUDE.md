# CLAUDE.md

Web Mapping & Geospatial API — งานสหกิจ (ทำ 2 คน) สร้าง/แก้/ลบ Point, LineString, Polygon บนแผนที่ ผ่าน REST API ที่รับส่ง GeoJSON

- ตอบผู้ใช้เป็นภาษาไทยเสมอ คอมเมนต์ในโค้ดก็เขียนภาษาไทย (ทำตามสไตล์ที่มีอยู่)
- โจทย์จริงที่ต้องทำให้ครบ: แผนที่บนเว็บ, CRUD 3 ชนิด, บันทึก/เรียกดูได้, REST API, GeoJSON, เว็บต่อ API ได้จริง, ส่ง URL + deployment + presentation

## Stack
- **Web:** React 19 + Vite + Tailwind 4 + shadcn/ui (`components/ui/`, ไอคอน lucide-react — ไม่มีฟอนต์ Material Symbols แล้ว) + MapLibre GL 6 (vector tiles ของ OpenFreeMap) + @mapbox/mapbox-gl-draw
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
  validation.ts               TypeBox schema: FeatureIn (GeoJSON Feature), FeaturePatch (Merge Patch), GeomType, Layer/Table/Record
  routes/features.ts          CRUD /api/features — ตรวจรูปทรงด้วย ST_IsValid → 422
  routes/{auth,groups,notifications}.ts
  db/schema.ts                groups, profiles, invitations, notifications, features (geom = geometry 4326), layers, related_tables, related_records
  routes/layers.ts            layer + ตารางย่อย (/api/layers, /api/related-tables) — เขียนได้เฉพาะเจ้าของ group
  routes/records.ts           แถวของตารางย่อย (/api/related-records) — สิทธิ์เดียวกับ feature (checkModify)
apps/server/sql/              schema.sql (เปิด PostGIS), realtime.sql (RLS + Realtime), layers.sql (RLS + Realtime ของ layer, ล้าง feature เก่า) — รันใน Supabase SQL Editor
apps/shared/                  ใช้ร่วม web+server: auth.ts, layers.ts (type หัวข้อ + checkValues / checkFields)
apps/web/src/
  App.tsx                     state หลักทั้งหมด (items, selection, draw, guest, save/remove/edit) — ไฟล์ใหญ่
  api.ts                      fetch wrapper + Bearer token, listFeatures/createFeature/patchFeature/deleteFeature
  components/MapView.tsx      สร้างแผนที่ MapLibre + mapbox-gl-draw (setWorkerUrl + prewarm, fallback เป็น OSM PNG)
  hooks/useFeatureData.ts     โหลด feature (API / localStorage) + ฟัง Realtime → items ใน App
  hooks/useLayerData.ts       login: โหลด layer / ตารางย่อย / แถว จาก API + ฟัง Realtime (โหมดทดลองอ่าน guestStore ใน App)
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
- **โหมดทดลอง (guest)** = ยังไม่ login: id ติดลบ ไม่ยิง API ไม่ฟัง Realtime — เก็บใน localStorage (`lib/guestStore.ts`) ลบทั้งชุดเมื่อครบ 1 ชม. นับจากสิ่งแรกที่สร้าง (feature หรือ layer)
- **ระบบ Layer + Attribute table + ตารางย่อย** (ใช้ทั้ง login และโหมดทดลอง — category ถูกเอาออกแล้ว)
  - login เก็บใน database ผ่าน API (`layerApi` ใน api.ts), โหมดทดลองเก็บ localStorage (`guestStore`) — ฟังก์ชันใน App แยก 2 ทาง (async, UI ครอบด้วย `attempt` → error ขึ้นแถบแดง)
  - โครงสร้าง (layer / ตารางย่อย / คอลัมน์) จัดการได้เฉพาะ `canManageLayers = guest || groupOwner` — คนอื่นไม่เห็นปุ่มจัดการ (server ตอบ 403)
  - **feature ไม่อยู่ใน layer ได้** (`layer_id` null) — ฟอร์มมี "— ไม่มี layer —", attribute table มีแท็บ "ไม่มี layer" (`NO_LAYER_ID`)
    ลบ layer → feature ไม่ถูกลบ กลายเป็นไม่มี layer (FK `on delete set null` + ล้างค่าของหัวข้อ layer นั้น) — โหมดทดลองทำแบบเดียวกัน
  - layer = กลุ่ม feature: รูปทรงชนิดเดียว + สี + หัวข้อ property (`lib/layers.ts`) — key ของหัวข้อสุ่มให้ไม่เปลี่ยน (เปลี่ยน label ได้ ค่าไม่หาย)
  - ใน properties เก็บแบบแบน: `layer_id` + ค่าของแต่ละหัวข้อ (key = `f_xxxx`) — แปลงไป/กลับด้วย `propsOf` / `toStoredProps` (`lib/featureMeta.ts`)
  - ลบหัวข้อ/เปลี่ยนชนิดหัวข้อ = ค่าเดิมถูกลบ, ลบ layer = feature ใน layer ถูกลบด้วย
  - UI: `LayerDialog` (สร้าง/แก้), `AttributeTable` (ตารางด้านล่างแผนที่ — ดับเบิลคลิกช่องแก้ค่า, ปุ่ม + เพิ่มคอลัมน์, ดินสอที่หัวคอลัมน์เปลี่ยนชื่อ), กลุ่มตาม layer ใน `FeaturePanel`
    ปุ่มเปิดตารางอยู่ใน `MapControls` — จอคอม: ตารางอยู่นอก `.map-area` แล้ว App หดพื้นที่แผนที่ขึ้น (`tableDocked`) การ์ด/ปุ่มที่ลอยบนแผนที่เลยขยับตามเอง
    ถ้าเปิดฟอร์มด้วย `DetailCard tall` ยืดลงเต็ม และ `MapControls` ย้ายไปซ้ายของการ์ด / มือถือ: ตารางเต็มจอ
  - **ตารางย่อย (related table)**: layer มีได้หลายตาราง (เช่น "ปลาที่พบ") 1 feature มีได้หลายแถว — `RelatedTable` / `RelatedRecord` ใน `lib/layers.ts`
    นิยามตาราง (หัวข้อ) เก็บเป็นข้อมูล ไม่ได้สร้างตารางจริง → ผู้ใช้สร้างเองได้โดยไม่ต้องแก้ DB (`related_tables` + `related_records`, ค่าเป็น jsonb)
    แถวแก้ใน `RelatedRecords` (ในฟอร์มรายละเอียด บันทึกทันที), attribute table มีคอลัมน์สรุปที่ระบบนับเอง (`summarize`: จำนวนแถว หรือค่าไม่ซ้ำของ `countKey`)
    attribute table สลับไปดูตารางย่อยได้ (`RelatedTableView`): แท็บข้าง layer = ทุก feature, คลิกตัวเลขสรุป = เฉพาะ feature นั้น (เพิ่มแถวได้)
    สร้างตารางย่อยจากปุ่ม + ของตารางหลัก (ชนิด "ตารางย่อย" — เริ่มแบบไม่มีคอลัมน์) แล้วเพิ่ม/เปลี่ยนชื่อคอลัมน์และชื่อตารางในมุมมองตารางย่อยได้ (`AddColumn`, `HeaderCell` ใช้ร่วมกันทั้ง 2 ตาราง)
    คลิกชื่อคอลัมน์ = เมนู (`HeaderCell`): เรียง / เปลี่ยนชื่อ / เปลี่ยนชนิด (ค่าเดิมล้าง) / แปลงเป็นตารางย่อย (`convertFieldToTable` ใน App — ค่าเดิมย้ายเป็นแถวแรก) / ลบ
    เมนูใช้ position fixed เพราะกล่องเลื่อนของตารางตัด absolute
    ฟอร์ม layer: ตารางย่อยอยู่ในรายการหัวข้อเดียวกัน (ชนิด "ตารางย่อย" = `TABLE_TYPE` ใน `lib/fieldDrafts.ts`) เลือกได้ตั้งแต่สร้าง layer
    บันทึกแล้ว App (`saveLayerFromDialog`) สร้าง/แปลง/เปลี่ยนชื่อ/ลบตารางย่อยตาม `TableChanges` — ตารางที่บันทึกแล้วเปลี่ยนชนิดไม่ได้ (ลบได้), ⚙ = ตั้งค่าคอลัมน์
    แถวมี `createdAt` (ระบบใส่ตอนเพิ่ม, แก้แถวแล้วคงเดิม — `saveRecord` ใน App) → คอลัมน์ "วันที่สร้าง" + กรองตามเดือนในตารางย่อย
    (ข้อมูลหลายรอบสำรวจ/หลายเดือนอยู่ตารางเดียว ไม่ต้องสร้างตารางใหม่ทุกเดือน)
    ลบ feature / layer / ตารางย่อย → แถวที่เกี่ยวข้องถูกลบตาม (`guestStore`)
  - กรอกผิดต้องแจ้งเตือน ไม่ทิ้งค่าเงียบๆ: ข้อความกลางใน `lib/layers.ts` (`badNumberMessage`, `EMPTY_ROW_MESSAGE`, `NO_COLUMN_MESSAGE`)
    ช่องตัวเลขที่พิมพ์ผิดตรวจจาก DOM ตอนบันทึก (`badInputLabel` + `validity.badInput`) — input type=number ให้ "" และ React อาจไม่ยิง onChange
    ส่ง element มากับ event (`e.currentTarget.closest("tr")`) แทน useRef เพราะ lint ของ React Compiler ห้ามอ่าน ref ในฟังก์ชันที่สร้างตอน render
  - ห้าม `<form>` ซ้อนใน `<form>`: ตารางย่อยอยู่ในฟอร์ม feature → `AddColumn` ใช้ div + จัดการ Enter เอง (form ซ้อนทำให้ browser ส่งฟอร์มจริง → หน้า reload)
  - server ตรวจค่าด้วย `checkValues` (apps/shared/layers.ts) → 422, key ที่ไม่มีในหัวข้อถูกตัดทิ้ง; ลบ/เปลี่ยนชนิดหัวข้อ = `properties - key` ใน transaction
  - แปลงคอลัมน์เป็นตารางย่อยตอน login ทำที่ server endpoint เดียว (`/api/layers/:id/fields/:key/to-table`) แล้วเว็บโหลดใหม่ (`reloadLayerData`)
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
2. ✅ branch `feat/maplibre`: ย้าย Leaflet/Geoman → MapLibre + @mapbox/mapbox-gl-draw, vector tiles (OpenFreeMap), ปุ่ม 3D (ภูเขา + ตึก)
3. 🚧 branch `feat/layers`: ระบบ Layer + Attribute table + ตารางย่อย (ทั้ง login และโหมดทดลอง) — ต้องรัน `db:push` + `layers.sql` ก่อนใช้

## Git
- branch หลัก `main`, ทำงานผ่าน PR ไปที่ `Futsu-coder/Web-Mapping`
- ใช้ `gh` CLI (GitHub connector ใช้ไม่ได้)
- commit/push เฉพาะเมื่อผู้ใช้สั่ง
