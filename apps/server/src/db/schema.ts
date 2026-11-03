import { sql } from 'drizzle-orm'
import { bigint, check, customType, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// PostGIS geometry รวมทุกชนิด (Point / LineString / Polygon) ใน SRID 4326
// อ่าน/เขียนผ่าน ST_AsGeoJSON / ST_GeomFromGeoJSON ใน query เสมอ
const geometry = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(Geometry, 4326)'
})

export const features = pgTable(
  'features',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    geomType: text('geom_type').notNull(),
    geom: geometry('geom').notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('features_geom_type_check', sql`${t.geomType} in ('Point', 'LineString', 'Polygon')`),
    index('features_geom_idx').using('gist', t.geom),
    index('features_geom_type_idx').on(t.geomType)
  ]
)
