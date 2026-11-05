import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { features } from '../db/schema'
import { FeatureIn, FeaturePatch, GeomType, IdParams, type FeatureInput } from '../validation'

class InvalidGeometry extends Error {}

// คอลัมน์ขาออก: แปลง geom เป็น GeoJSON ใน database เลย
const columns = {
  id: features.id,
  name: features.name,
  geomType: features.geomType,
  geometry: sql<unknown>`ST_AsGeoJSON(${features.geom})::json`,
  properties: features.properties,
  createdAt: features.createdAt,
  updatedAt: features.updatedAt
}

type Row = {
  id: number
  name: string
  geomType: string
  geometry: unknown
  properties: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

function toGeoJSON(row: Row) {
  return {
    type: 'Feature',
    id: row.id,
    geometry: row.geometry,
    properties: {
      ...row.properties,
      name: row.name,
      geom_type: row.geomType,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    }
  }
}

const geomFromGeoJSON = (geojson: string) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)`

/** ตรวจรูปทรงด้วย PostGIS แล้วคืน geom พร้อมเก็บลง DB */
async function validateGeometry(geometry: FeatureInput['geometry']) {
  const geojson = JSON.stringify(geometry)
  let check: { valid: boolean; reason: string } | undefined
  try {
    ;[check] = await db.execute<{ valid: boolean; reason: string }>(sql`
      select ST_IsValid(g) as valid, ST_IsValidReason(g) as reason
      from (select ST_GeomFromGeoJSON(${geojson}) as g) s
    `)
  } catch (e) {
    const err = e as Error & { cause?: Error }
    throw new InvalidGeometry(err.cause?.message ?? err.message)
  }
  if (!check?.valid) throw new InvalidGeometry(check?.reason ?? 'unknown')
  return { geomType: geometry.type, geom: geomFromGeoJSON(geojson) }
}

// ฟิลด์ที่ระบบสร้างเอง ไม่ให้ client เขียนทับ
const SYSTEM_KEYS = ['name', 'geom_type', 'created_at', 'updated_at']

/** แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรงด้วย PostGIS */
async function parseInput(body: FeatureInput) {
  const geo = await validateGeometry(body.geometry)
  const properties: Record<string, unknown> = { ...body.properties }
  const name = body.properties.name.trim()
  for (const key of SYSTEM_KEYS) delete properties[key]

  return { name, ...geo, properties }
}

export const featuresRoutes = new Elysia({ prefix: '/features', tags: ['features'] })
  .error({ InvalidGeometry })
  .onError(({ code, error, status }) => {
    if (code === 'InvalidGeometry') return status(422, { detail: `Invalid geometry: ${error.message}` })
  })

  .get(
    '/',
    async ({ query }) => {
      const rows = await db
        .select(columns)
        .from(features)
        .where(query.type ? eq(features.geomType, query.type) : undefined)
        .orderBy(asc(features.createdAt))
      return { type: 'FeatureCollection', features: rows.map(toGeoJSON) }
    },
    { query: t.Object({ type: t.Optional(GeomType) }) }
  )

  .get(
    '/:id',
    async ({ params, status }) => {
      const [row] = await db.select(columns).from(features).where(eq(features.id, params.id))
      return row ? toGeoJSON(row) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams }
  )

  .post(
    '/',
    async ({ body, status }) => {
      const [row] = await db
        .insert(features)
        .values(await parseInput(body))
        .returning(columns)
      return status(201, toGeoJSON(row))
    },
    { body: FeatureIn }
  )

  .put(
    '/:id',
    async ({ params, body, status }) => {
      const [row] = await db
        .update(features)
        .set({ ...(await parseInput(body)), updatedAt: sql`now()` })
        .where(eq(features.id, params.id))
        .returning(columns)
      return row ? toGeoJSON(row) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams, body: FeatureIn }
  )

  .patch(
    '/:id',
    async ({ params, body, status }) => {
      if (!body.geometry && !Object.keys(body.properties ?? {}).length) {
        return status(400, { detail: 'Nothing to update' })
      }

      const geo = body.geometry ? await validateGeometry(body.geometry) : null

      const row = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ properties: features.properties })
          .from(features)
          .where(eq(features.id, params.id))
          .for('update')
        if (!current) return null

        const set: Partial<typeof features.$inferInsert> = {}
        if (geo) Object.assign(set, geo)

        if (body.properties) {
          const merged: Record<string, unknown> = { ...current.properties }
          for (const [key, value] of Object.entries(body.properties)) {
            if (SYSTEM_KEYS.includes(key)) continue
            if (value === null) delete merged[key]
            else merged[key] = value
          }
          set.properties = merged
          if (body.properties.name !== undefined) {
            set.name = body.properties.name.trim()
          }
        }

        const [updated] = await tx
          .update(features)
          .set({ ...set, updatedAt: sql`now()` })
          .where(eq(features.id, params.id))
          .returning(columns)
        return updated
      })

      return row ? toGeoJSON(row) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams, body: FeaturePatch }
  )

  .delete(
    '/:id',
    async ({ params, status }) => {
      const deleted = await db
        .delete(features)
        .where(eq(features.id, params.id))
        .returning({ id: features.id })
      return deleted.length ? status(204) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams }
  )
