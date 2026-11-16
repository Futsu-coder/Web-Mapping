import { Elysia } from 'elysia'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { features, layers, relatedRecords, relatedTables } from '../db/schema'
import { auth, isUniqueViolation, type CurrentUser } from '../auth'
import { checkFields, type LayerField } from '../../../shared/layers'
import { FieldKeyParams, IdParams, LayerIn, LayerPatch, TableIn, TablePatch, ToTableBody } from '../validation'

// ชื่อคอลัมน์ที่ระบบมีอยู่แล้ว (ตั้งเป็นชื่อหัวข้อไม่ได้)
const LAYER_RESERVED = ['ชื่อ', 'คำอธิบาย']
const TABLE_RESERVED = ['Feature', 'วันที่สร้าง']

const ownerOnly = { detail: 'เฉพาะเจ้าของ group จัดการ layer / ตารางย่อยได้' }
const layerNotFound = { detail: 'Layer not found' }
const tableNotFound = { detail: 'Related table not found' }

const layerColumns = {
  id: layers.id,
  name: layers.name,
  geomType: layers.geomType,
  color: layers.color,
  fields: layers.fields
}
const tableColumns = {
  id: relatedTables.id,
  layerId: relatedTables.layerId,
  name: relatedTables.name,
  fields: relatedTables.fields,
  countKey: relatedTables.countKey
}

/** layer ใน group ของผู้ใช้ (group อื่น = ไม่มี) */
const findLayer = async (user: CurrentUser, id: number) =>
  (await db.select(layerColumns).from(layers).where(and(eq(layers.id, id), eq(layers.groupId, user.groupId))))[0]

/** ตารางย่อยใน group ของผู้ใช้ (ผ่าน layer) */
const findTable = async (user: CurrentUser, id: number) =>
  (
    await db
      .select(tableColumns)
      .from(relatedTables)
      .innerJoin(layers, eq(layers.id, relatedTables.layerId))
      .where(and(eq(relatedTables.id, id), eq(layers.groupId, user.groupId)))
  )[0]

/**
 * array ของ Postgres สำหรับ `jsonb - text[]` (ลบหลาย key)
 * ส่ง array ของ JS ตรงๆ ใน sql`` ไม่ได้ — drizzle แตกเป็น ($1, $2) แล้ว ::text[] ได้ "malformed array literal"
 */
const textArray = (keys: string[]) => sql`ARRAY[${sql.join(
  keys.map((k) => sql`${k}`),
  sql`, `
)}]::text[]`

/** key ของหัวข้อที่หายไปจากรายการใหม่ (ลบหัวข้อ / เปลี่ยนชนิดจน key ใหม่) */
const droppedKeys = (before: LayerField[], after: LayerField[]) => {
  const keep = new Set(after.map((f) => f.key))
  return before.map((f) => f.key).filter((k) => !keep.has(k))
}

/** countKey ต้องเป็นหัวข้อที่มีอยู่ ไม่งั้น = null (นับจำนวนแถว) */
const validCountKey = (countKey: string | null | undefined, fields: LayerField[]) =>
  countKey && fields.some((f) => f.key === countKey) ? countKey : null

/**
 * Layer และตารางย่อย — อ่านได้ทุกคนใน group, สร้าง/แก้/ลบได้เฉพาะเจ้าของ group
 * หัวข้อ (fields) เป็น jsonb: ลบหัวข้อ = ลบค่าของ key นั้นออกจาก feature / แถว ใน transaction เดียวกัน
 */
export const layerRoutes = new Elysia({ tags: ['layers'] })
  .use(auth)

  // layer + ตารางย่อยทั้งหมดของ group (หน้าเว็บโหลดครั้งเดียว)
  .get('/layers', async ({ user }) => {
    const [layerRows, tableRows] = await Promise.all([
      db.select(layerColumns).from(layers).where(eq(layers.groupId, user.groupId)).orderBy(asc(layers.createdAt)),
      db
        .select(tableColumns)
        .from(relatedTables)
        .innerJoin(layers, eq(layers.id, relatedTables.layerId))
        .where(eq(layers.groupId, user.groupId))
        .orderBy(asc(relatedTables.createdAt))
    ])
    return { layers: layerRows, tables: tableRows }
  })

  .post(
    '/layers',
    async ({ user, body, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const fields = body.fields ?? []
      const bad = checkFields(fields, LAYER_RESERVED)
      if (bad) return status(422, { detail: bad })
      try {
        const [row] = await db
          .insert(layers)
          .values({ groupId: user.groupId, name: body.name.trim(), geomType: body.geomType, color: body.color, fields })
          .returning(layerColumns)
        return status(201, row)
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มี layer ชื่อ "${body.name.trim()}" แล้ว` })
        throw e
      }
    },
    { body: LayerIn }
  )

  .patch(
    '/layers/:id',
    async ({ user, params, body, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const layer = await findLayer(user, params.id)
      if (!layer) return status(404, layerNotFound)
      const fields = body.fields ?? layer.fields
      const bad = checkFields(fields, LAYER_RESERVED)
      if (bad) return status(422, { detail: bad })
      try {
        const [row] = await db.transaction(async (tx) => {
          const dropped = droppedKeys(layer.fields, fields)
          if (dropped.length) {
            await tx
              .update(features)
              .set({ properties: sql`${features.properties} - ${textArray(dropped)}` })
              .where(eq(features.layerId, layer.id))
          }
          return tx
            .update(layers)
            .set({
              ...(body.name !== undefined && { name: body.name.trim() }),
              ...(body.color !== undefined && { color: body.color }),
              fields,
              updatedAt: sql`now()`
            })
            .where(eq(layers.id, layer.id))
            .returning(layerColumns)
        })
        return row
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มี layer ชื่อ "${body.name?.trim()}" แล้ว` })
        throw e
      }
    },
    { params: IdParams, body: LayerPatch }
  )

  // ลบ layer: feature ใน layer ถูกลบด้วย (แถวตารางย่อยของ feature ลบตาม cascade) — ตารางย่อยของ layer ก็ลบตาม
  .delete(
    '/layers/:id',
    async ({ user, params, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const layer = await findLayer(user, params.id)
      if (!layer) return status(404, layerNotFound)
      await db.transaction(async (tx) => {
        await tx.delete(features).where(eq(features.layerId, layer.id))
        await tx.delete(layers).where(eq(layers.id, layer.id))
      })
      return status(204)
    },
    { params: IdParams }
  )

  // แปลงหัวข้อเป็นตารางย่อย (อยากเก็บได้หลายค่าต่อ feature): ค่าเดิมของแต่ละ feature กลายเป็นแถวแรก แล้วเอาหัวข้อออกจาก layer
  .post(
    '/layers/:id/fields/:key/to-table',
    async ({ user, params, body, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const layer = await findLayer(user, params.id)
      if (!layer) return status(404, layerNotFound)
      const field = layer.fields.find((f) => f.key === params.key)
      if (!field) return status(404, { detail: 'Field not found' })
      const name = body.name?.trim() || field.label
      try {
        const table = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(relatedTables)
            .values({ layerId: layer.id, name, fields: [field] })
            .returning(tableColumns)
          await tx.execute(sql`
            insert into ${relatedRecords} (table_id, feature_id, values)
            select ${created.id}, f.id, jsonb_build_object(${field.key}::text, f.properties -> ${field.key}::text)
            from ${features} f
            where f.layer_id = ${layer.id} and f.properties ? ${field.key}::text
          `)
          await tx
            .update(features)
            .set({ properties: sql`${features.properties} - ${field.key}::text` })
            .where(eq(features.layerId, layer.id))
          await tx
            .update(layers)
            .set({ fields: layer.fields.filter((f) => f.key !== field.key), updatedAt: sql`now()` })
            .where(eq(layers.id, layer.id))
          return created
        })
        return status(201, table)
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มีตารางย่อยชื่อ "${name}" แล้ว` })
        throw e
      }
    },
    { params: FieldKeyParams, body: ToTableBody }
  )

  // ---------- ตารางย่อย ----------
  .post(
    '/related-tables',
    async ({ user, body, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const layer = await findLayer(user, body.layerId)
      if (!layer) return status(404, layerNotFound)
      const fields = body.fields ?? []
      const bad = checkFields(fields, TABLE_RESERVED)
      if (bad) return status(422, { detail: bad })
      try {
        const [row] = await db
          .insert(relatedTables)
          .values({ layerId: layer.id, name: body.name.trim(), fields, countKey: validCountKey(body.countKey, fields) })
          .returning(tableColumns)
        return status(201, row)
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มีตารางย่อยชื่อ "${body.name.trim()}" แล้ว` })
        throw e
      }
    },
    { body: TableIn }
  )

  .patch(
    '/related-tables/:id',
    async ({ user, params, body, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const table = await findTable(user, params.id)
      if (!table) return status(404, tableNotFound)
      const fields = body.fields ?? table.fields
      const bad = checkFields(fields, TABLE_RESERVED)
      if (bad) return status(422, { detail: bad })
      try {
        const [row] = await db.transaction(async (tx) => {
          const dropped = droppedKeys(table.fields, fields)
          if (dropped.length) {
            await tx
              .update(relatedRecords)
              .set({ values: sql`${relatedRecords.values} - ${textArray(dropped)}` })
              .where(eq(relatedRecords.tableId, table.id))
          }
          return tx
            .update(relatedTables)
            .set({
              ...(body.name !== undefined && { name: body.name.trim() }),
              fields,
              countKey: validCountKey(body.countKey !== undefined ? body.countKey : table.countKey, fields)
            })
            .where(eq(relatedTables.id, table.id))
            .returning(tableColumns)
        })
        return row
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มีตารางย่อยชื่อ "${body.name?.trim()}" แล้ว` })
        throw e
      }
    },
    { params: IdParams, body: TablePatch }
  )

  .delete(
    '/related-tables/:id',
    async ({ user, params, status }) => {
      if (!user.isGroupOwner) return status(403, ownerOnly)
      const table = await findTable(user, params.id)
      if (!table) return status(404, tableNotFound)
      await db.delete(relatedTables).where(eq(relatedTables.id, table.id))
      return status(204)
    },
    { params: IdParams }
  )

// records route ใช้ตรวจว่าตารางย่อยอยู่ใน group ของผู้ใช้
export { findTable }
