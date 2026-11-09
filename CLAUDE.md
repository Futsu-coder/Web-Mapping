# CLAUDE.md

Web Mapping & Geospatial API — งานสหกิจ (ทำ 2 คน) สร้าง/แก้/ลบ Point, LineString, Polygon บนแผนที่ ผ่าน REST API ที่รับส่ง GeoJSON

- ตอบผู้ใช้เป็นภาษาไทยเสมอ คอมเมนต์ในโค้ดก็เขียนภาษาไทย (ทำตามสไตล์ที่มีอยู่)
- โจทย์จริงที่ต้องทำให้ครบ: แผนที่บนเว็บ, CRUD 3 ชนิด, บันทึก/เรียกดูได้, REST API, GeoJSON, เว็บต่อ API ได้จริง, ส่ง URL + deployment + presentation

## Stack
- **Web:** React 19 + Vite + Tailwind 4 + react-leaflet + Leaflet-Geoman (+ leaflet.markercluster)
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
  App.tsx                     state หลักทั้งหมด (items, selection, guest, save/remove/edit) — ไฟล์ใหญ่ ~735 บรรทัด
  api.ts                      fetch wrapper + Bearer token, listFeatures/createFeature/patchFeature/deleteFeature
  components/DrawTools.tsx    ผูก Leaflet layer ↔ feature, โหลดจาก API, ฟัง Realtime, events ของ Geoman
  components/SearchBox.tsx    ค้นหาสถานที่ผ่าน Nominatim
  components/mobile/          UI มือถือ: วาดด้วยกากบาทกลางจอ (CrosshairDraw + hooks/useCrosshairDraw), sheet ด้านล่าง
  lib/featureMeta.ts          WeakMap meta/ownerGroup ของ layer, sameGeometry, restore/highlight
  lib/realtime.ts             Supabase Realtime subscribe feature changes
  lib/idleLogout.ts           auto logout เมื่อไม่ใช้งาน 1 วัน (localStorage)
```

## กฎ/แนวคิดที่ต้องรู้
- **API features ต้อง login** (Bearer token) ยกเว้น `/api/health`, `/api/auth/signup`; เห็นเฉพาะ feature ใน group ตัวเอง (group อื่น = 404)
- แก้/ลบได้เมื่อเป็นเจ้าของ feature หรือเจ้าของ group → ไม่งั้น 403 (ฝั่งเว็บใช้ `canModifyOwner` ใน App.tsx)
- **PATCH = JSON Merge Patch (RFC 7396)**: ส่งเฉพาะที่เปลี่ยน, `null` ใน properties = ลบ key; เว็บส่งเฉพาะ diff (ดู `save` ใน App.tsx)
- `name` เก็บเป็นคอลัมน์แยก, ฟิลด์อื่นอยู่ใน `properties` (jsonb); SYSTEM_KEYS (name, geom_type, owner_*, *_at) client เขียนทับไม่ได้
- Polygon ห้ามตัดกันเอง (เว็บตั้ง `allowSelfIntersection: false`, server ตรวจ ST_IsValid)
- **โหมดทดลอง (guest)** = ยังไม่ login: วาดได้ในเครื่อง id ติดลบ ไม่ยิง API ไม่ฟัง Realtime
- เปลี่ยนบัญชี/group → `viewKey` เปลี่ยน → DrawTools remount โหลดชุดใหม่
- เทียบรูปทรงที่ 6 ทศนิยม (`sameGeometry`) เพราะ PostGIS ตอบละเอียดกว่า Leaflet
- Nominatim: ไม่เกิน 1 req/วินาที (`MIN_INTERVAL_MS` ใน SearchBox)
- มือถือ: input ต้อง `text-base` (16px) กัน iOS ซูมเอง

## งานที่วางแผนไว้
แผนละเอียด: `~/.claude/plans/home-panapong-downloads-docx-mossy-nautilus.md`
1. branch `feat/search-guest-storage`: SearchBox autocomplete (debounce + AbortController + throttle + cache) และ guest เก็บ localStorage ลบทุก 1 ชม. พร้อมแบนเนอร์นับถอยหลัง
2. branch `feat/maplibre` (แตกหลัง merge ข้อ 1): ย้าย Leaflet/Geoman → MapLibre + @mapbox/mapbox-gl-draw, vector tiles (OpenFreeMap), 2D เท่านั้น

## Git
- branch หลัก `main`, ทำงานผ่าน PR ไปที่ `Futsu-coder/Web-Mapping`
- ใช้ `gh` CLI (GitHub connector ใช้ไม่ได้)
- commit/push เฉพาะเมื่อผู้ใช้สั่ง
