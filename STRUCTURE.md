# โครงสร้างโปรเจกต์

```
Web-Mapping/
├── README.md               # วิธีรัน + API
├── package.json            # ไฟล์เดียวทั้ง repo: dependencies ของ api+web + scripts
├── bun.lock                # lockfile เดียว (bun install ที่ root)
├── tsconfig.json           # TypeScript config เดียว
├── eslint.config.js
├── vite.config.ts          # root: 'apps/web', envDir = root, proxy /api → localhost:3000 ตอน dev
├── vercel.json             # bunVersion, build web → apps/web/dist, rewrite /api/* → api/index.ts
├── .env                    # ค่าจริงสำหรับรัน local (ห้าม commit)
├── .env.example            # DATABASE_URL=
├── api/
│   └── index.ts            # จุดเข้า Vercel Function → import app จาก apps/server
└── apps/
    ├── server/             # Backend — Elysia.js (Bun)
    │   ├── src/
    │   │   ├── index.ts    # สร้าง app (prefix /api), openapi docs, /health
    │   │   ├── server.ts   # รัน local: app.listen(3000)
    │   │   ├── db.ts       # postgres.js ต่อ Supabase pooler (6543, prepare:false)
    │   │   ├── schema.ts   # t (TypeBox) schema ของ GeoJSON Feature + ตัวอย่าง
    │   │   └── routes/
    │   │       └── features.ts   # GET/POST/PUT/DELETE /api/features
    │   └── sql/
    │       └── schema.sql  # create extension postgis + ตาราง features
    └── web/                # Frontend — React + Vite + react-leaflet + Geoman
        ├── index.html
        ├── public/
        └── src/
            ├── main.tsx
            ├── App.tsx     # แผนที่ + เครื่องมือวาด + sidebar
            ├── App.css
            ├── index.css
            └── assets/
```

## Flow ข้อมูล
```
web (App.tsx) → /api/features → [Vercel: api/index.ts] → Elysia routes → db.ts → Supabase PostGIS
```
ข้อมูลที่รับส่งเป็น GeoJSON ทั้งหมด พิกัดเรียงแบบ `[lon, lat]`

## หมายเหตุ
- บน Vercel ให้ตั้ง `DATABASE_URL` ในหน้า Settings → Environment Variables (ไฟล์ `.env` ใช้แค่ตอนรัน local)
- ห้ามตั้งชื่อเป็น `VITE_DATABASE_URL` — ตัวแปรที่ขึ้นต้นด้วย `VITE_` จะหลุดไปฝั่ง browser
- web และ api อยู่ URL เดียวกัน จึงไม่ต้องตั้ง CORS
