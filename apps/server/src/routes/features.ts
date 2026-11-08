import { Elysia, t } from 'elysia'
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '../db'
import { features, profiles } from '../db/schema'
import { auth, type CurrentUser } from '../auth'
import { FeatureIn, FeaturePatch, GeomType, IdParams, type FeatureInput } from '../validation'

class InvalidGeometry extends Error {}

// คอลัมน์ขาออก: แปลง geom เป็น GeoJSON ใน database เลย + ชื่อเจ้าของจาก profiles
const columns = {
  id: features.id,
  name: features.name,
  geomType: features.geomType,
  geometry: sql<unknown>`ST_AsGeoJSON(${features.geom})::json`,
  properties: features.properties,
  ownerId: features.ownerId,
  ownerName: profiles.username,
  createdAt: features.createdAt,
  updatedAt: features.updatedAt
}

type Row = {
  id: number
  name: string
  geomType: string
  geometry: unknown
  properties: Record<string, unknown>
  ownerId: string | null
  ownerName: string | null
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
      owner_id: row.ownerId,
      owner_name: row.ownerName,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString()
    }
  }
}

/** feature ใน group ของผู้ใช้ (ของ group อื่นถือว่าไม่มี → 404) */
const selectInGroup = (user: CurrentUser, where?: SQL) =>
  db
    .select(columns)
    .from(features)
    .leftJoin(profiles, eq(profiles.id, features.ownerId))
    .where(and(eq(features.groupId, user.groupId), where))

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
const SYSTEM_KEYS = ['name', 'geom_type', 'owner_id', 'owner_name', 'created_at', 'updated_at']

/** แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรงด้วย PostGIS */
async function parseInput(body: FeatureInput) {
  const geo = await validateGeometry(body.geometry)
  const properties: Record<string, unknown> = { ...body.properties }
  const name = body.properties.name.trim() || body.geometry.type
  for (const key of SYSTEM_KEYS) delete properties[key]

  return { name, ...geo, properties }
}

/** แก้/ลบได้เมื่อเป็นเจ้าของ feature หรือเป็นเจ้าของ group */
async function checkModify(user: CurrentUser, id: number) {
  const [row] = await db
    .select({ ownerId: features.ownerId })
    .from(features)
    .where(and(eq(features.id, id), eq(features.groupId, user.groupId)))
  if (!row) return 404 as const
  if (row.ownerId !== user.id && !user.isGroupOwner) return 403 as const
  return null
}

const notFound = { detail: 'Feature not found' }
const forbidden = { detail: 'แก้ไขได้เฉพาะ feature ของตัวเอง (หรือเจ้าของ group)' }

export const featuresRoutes = new Elysia({ prefix: '/features', tags: ['features'] })
  .use(auth)
  .error({ InvalidGeometry })
  .onError(({ code, error, status }) => {
    if (code === 'InvalidGeometry') return status(422, { detail: `Invalid geometry: ${error.message}` })
  })

  .get(
    '/',
    async ({ user, query }) => {
      const rows = await selectInGroup(user, query.type ? eq(features.geomType, query.type) : undefined).orderBy(
        asc(features.createdAt)
      )
      return { type: 'FeatureCollection', features: rows.map(toGeoJSON) }
    },
    { query: t.Object({ type: t.Optional(GeomType) }) }
  )

  .get(
    '/:id',
    async ({ user, params, status }) => {
      const [row] = await selectInGroup(user, eq(features.id, params.id))
      return row ? toGeoJSON(row) : status(404, notFound)
    },
    { params: IdParams }
  )

  .post(
    '/',
    async ({ user, body, status }) => {
      const [{ id }] = await db
        .insert(features)
        .values({ ...(await parseInput(body)), ownerId: user.id, groupId: user.groupId })
        .returning({ id: features.id })
      const [row] = await selectInGroup(user, eq(features.id, id))
      return status(201, toGeoJSON(row))
    },
    { body: FeatureIn }
  )

  .put(
    '/:id',
    async ({ user, params, body, status }) => {
      const denied = await checkModify(user, params.id)
      if (denied === 404) return status(404, notFound)
      if (denied === 403) return status(403, forbidden)
      await db
        .update(features)
        .set({ ...(await parseInput(body)), updatedAt: sql`now()` })
        .where(eq(features.id, params.id))
      const [row] = await selectInGroup(user, eq(features.id, params.id))
      return row ? toGeoJSON(row) : status(404, notFound)
    },
    { params: IdParams, body: FeatureIn }
  )

  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      if (!body.geometry && !Object.keys(body.properties ?? {}).length) {
        return status(400, { detail: 'Nothing to update' })
      }
      const denied = await checkModify(user, params.id)
      if (denied === 404) return status(404, notFound)
      if (denied === 403) return status(403, forbidden)

      const geo = body.geometry ? await validateGeometry(body.geometry) : null

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ properties: features.properties })
          .from(features)
          .where(and(eq(features.id, params.id), eq(features.groupId, user.groupId)))
          .for('update')
        if (!current) return false

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
          const trimmed = body.properties.name?.trim()
          if (trimmed) set.name = trimmed
        }

        await tx
          .update(features)
          .set({ ...set, updatedAt: sql`now()` })
          .where(eq(features.id, params.id))
        return true
      })
      if (!updated) return status(404, notFound)

      const [row] = await selectInGroup(user, eq(features.id, params.id))
      return row ? toGeoJSON(row) : status(404, notFound)
    },
    { params: IdParams, body: FeaturePatch }
  )

  .delete(
    '/:id',
    async ({ user, params, status }) => {
      const denied = await checkModify(user, params.id)
      if (denied === 404) return status(404, notFound)
      if (denied === 403) return status(403, forbidden)
      await db.delete(features).where(eq(features.id, params.id))
      return status(204)
    },
    { params: IdParams }
  )
