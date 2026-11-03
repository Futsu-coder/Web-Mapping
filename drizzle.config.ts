import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/server/src/db/schema.ts',
  out: './apps/server/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  // ไม่ให้ drizzle-kit ไปยุ่งกับตารางของ PostGIS (spatial_ref_sys)
  extensionsFilters: ['postgis']
})
