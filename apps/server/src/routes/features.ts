import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { features } from '../db/schema'
import { FeatureIn, GeomType, IdParams, type FeatureInput } from '../validation'

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

/** แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรงด้วย PostGIS */
async function parseInput(body: FeatureInput) {
  const geojson = JSON.stringify(body.geometry)
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

  const properties = { ...(body.properties ?? {}) }
  const name = String(properties.name || body.geometry.type)
  // ฟิลด์ที่ระบบสร้างเอง ไม่ให้ client เขียนทับ
  for (const key of ['name', 'geom_type', 'created_at', 'updated_at']) delete properties[key]

  return { name, geomType: body.geometry.type, geom: geomFromGeoJSON(geojson), properties }
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
