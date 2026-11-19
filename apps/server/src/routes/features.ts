import { Elysia, t } from 'elysia'
import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { db } from '../db'
import { features, layers, profiles } from '../db/schema'
import { auth, type CurrentUser } from '../auth'
import { checkValues } from '../../../shared/layers'
import { FeatureIn, FeaturePatch, GeomType, IdParams, type FeatureInput } from '../validation'

class InvalidGeometry extends Error {}
/** ข้อมูลไม่ผ่านกติกาของ layer (ไม่พบ layer / รูปทรงไม่ตรง / ค่าผิดชนิด) → 422 */
export class InvalidInput extends Error {}

// คอลัมน์ขาออก: แปลง geom เป็น GeoJSON ใน database เลย + ชื่อเจ้าของจาก profiles
const columns = {
  id: features.id,
  name: features.name,
  geomType: features.geomType,
  geometry: sql<unknown>`ST_AsGeoJSON(${features.geom})::json`,
  properties: features.properties,
  ownerId: features.ownerId,
  ownerName: profiles.username,
  layerId: features.layerId,
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
  layerId: number | null
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
      layer_id: row.layerId,
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

// ฟิลด์ที่ระบบสร้างเอง ไม่ให้ client เขียนทับ (layer_id เก็บเป็นคอลัมน์แยก)
const SYSTEM_KEYS = ['name', 'geom_type', 'owner_id', 'owner_name', 'layer_id', 'created_at', 'updated_at']

type Db = Pick<typeof db, 'select'>

/** layer ใน group ของผู้ใช้ที่รับรูปทรงชนิดนี้ได้ — ไม่พบ / ชนิดไม่ตรง → InvalidInput */
async function layerFor(tx: Db, user: CurrentUser, layerId: number, geomType: string) {
  const [layer] = await tx
    .select({ id: layers.id, geomType: layers.geomType, fields: layers.fields, name: layers.name })
    .from(layers)
    .where(and(eq(layers.id, layerId), eq(layers.groupId, user.groupId)))
  if (!layer) throw new InvalidInput('ไม่พบ layer นี้ใน group')
  if (layer.geomType !== geomType) throw new InvalidInput(`layer "${layer.name}" รับเฉพาะ ${layer.geomType}`)
  return layer
}

/**
 * properties ที่เก็บจริง: description + ค่าของหัวข้อใน layer (ตรวจชนิดด้วย checkValues, key อื่นถูกตัดทิ้ง)
 * ไม่อยู่ใน layer = เก็บแค่ description
 */
function buildProperties(input: Record<string, unknown>, layer: { fields: Parameters<typeof checkValues>[0] } | null) {
  const out: Record<string, unknown> = {}
  if (typeof input.description === 'string' && input.description) out.description = input.description
  if (!layer) return out
  const checked = checkValues(layer.fields, input)
  if (checked.error !== undefined) throw new InvalidInput(checked.error)
  return { ...out, ...checked.values }
}

/** แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรงด้วย PostGIS และตรวจค่าตาม layer */
async function parseInput(user: CurrentUser, body: FeatureInput) {
  const geo = await validateGeometry(body.geometry)
  const name = body.properties.name.trim() || body.geometry.type
  const layerId = body.properties.layer_id ?? null
  // feature ใหม่ต้องอยู่ใน layer (ต้องสร้าง layer ก่อน)
  if (layerId === null) throw new InvalidInput('ต้องเลือก layer ก่อน — สร้าง layer ชนิดนี้ก่อนแล้วค่อยวาด')
  const layer = await layerFor(db, user, layerId, body.geometry.type)
  return { name, ...geo, layerId, properties: buildProperties(body.properties, layer) }
}

/** แก้/ลบได้เมื่อเป็นเจ้าของ feature หรือเป็นเจ้าของ group (ใช้กับแถวในตารางย่อยของ feature ด้วย) */
export async function checkModify(user: CurrentUser, id: number) {
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
  .error({ InvalidGeometry, InvalidInput })
  .onError(({ code, error, status }) => {
    if (code === 'InvalidGeometry') return status(422, { detail: `Invalid geometry: ${error.message}` })
    if (code === 'InvalidInput') return status(422, { detail: error.message })
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
        .values({ ...(await parseInput(user, body)), ownerId: user.id, groupId: user.groupId })
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
        .set({ ...(await parseInput(user, body)), updatedAt: sql`now()` })
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
      // สมาชิกที่ไม่ใช่เจ้าของ feature แก้ได้เฉพาะ "ค่าของหัวข้อ layer" (key f_xxxx) — รูปทรง / ชื่อ / คำอธิบาย / layer ยังต้องเป็นเจ้าของ
      const valuesOnly = !body.geometry && Object.keys(body.properties ?? {}).every((k) => k.startsWith('f_') && !SYSTEM_KEYS.includes(k))
      if (denied === 403 && !valuesOnly) return status(403, forbidden)

      const geo = body.geometry ? await validateGeometry(body.geometry) : null

      const updated = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ properties: features.properties, layerId: features.layerId, geomType: features.geomType })
          .from(features)
          .where(and(eq(features.id, params.id), eq(features.groupId, user.groupId)))
          .for('update')
        if (!current) return false

        const set: Partial<typeof features.$inferInsert> = {}
        if (geo) Object.assign(set, geo)

        // layer ปลายทาง: ส่ง layer_id มา = เปลี่ยน/เอาออกจาก layer (null), ไม่ส่ง = layer เดิม
        const patch = body.properties ?? {}
        const layerId = patch.layer_id !== undefined ? patch.layer_id : current.layerId
        // feature เก่าที่ยังไม่มี layer แก้อย่างอื่นได้ แต่สั่งเอาออกจาก layer ไม่ได้
        if (patch.layer_id === null) throw new InvalidInput('feature ต้องอยู่ใน layer — เลือก layer อื่นแทนการเอาออก')
        const layerChanged = layerId !== current.layerId
        // ย้าย layer = ค่าของหัวข้อ layer เดิมไม่มีความหมายแล้ว → เริ่มจาก description อย่างเดียว
        const merged: Record<string, unknown> = layerChanged
          ? current.properties.description !== undefined
            ? { description: current.properties.description }
            : {}
          : { ...current.properties }
        for (const [key, value] of Object.entries(patch)) {
          if (SYSTEM_KEYS.includes(key)) continue
          if (value === null) delete merged[key]
          else merged[key] = value
        }
        const geomType = geo?.geomType ?? current.geomType
        const layer = layerId === null ? null : await layerFor(tx, user, layerId, geomType)
        set.properties = buildProperties(merged, layer)
        set.layerId = layerId
        const trimmed = patch.name?.trim()
        if (trimmed) set.name = trimmed

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
