import { Elysia } from 'elysia'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { features, relatedRecords } from '../db/schema'
import { auth, type CurrentUser } from '../auth'
import { checkValues } from '../../../shared/layers'
import { IdParams, RecordIn, RecordPatch } from '../validation'
import { checkModify } from './features'
import { findTable } from './layers'

const recordColumns = {
  id: relatedRecords.id,
  tableId: relatedRecords.tableId,
  featureId: relatedRecords.featureId,
  values: relatedRecords.values,
  createdAt: relatedRecords.createdAt
}

const notFound = { detail: 'Record not found' }
const forbidden = { detail: 'แก้ไขได้เฉพาะแถวของ feature ตัวเอง (หรือเจ้าของ group)' }
const emptyRow = { detail: 'แถวนี้ยังว่างอยู่ — กรอกอย่างน้อย 1 ช่อง' }

/** แถวใน group ของผู้ใช้ (ผ่าน feature) */
const findRecord = async (user: CurrentUser, id: number) =>
  (
    await db
      .select(recordColumns)
      .from(relatedRecords)
      .innerJoin(features, eq(features.id, relatedRecords.featureId))
      .where(and(eq(relatedRecords.id, id), eq(features.groupId, user.groupId)))
  )[0]

/**
 * แถวของตารางย่อย — สิทธิ์เหมือน feature: เพิ่ม/แก้/ลบได้เมื่อเป็นเจ้าของ feature หรือเจ้าของ group
 * created_at ให้ database ใส่ตอนเพิ่ม แก้แถวแล้วไม่เปลี่ยน
 */
export const recordRoutes = new Elysia({ prefix: '/related-records', tags: ['related records'] })
  .use(auth)

  // แถวทั้งหมดของ group
  .get('/', async ({ user }) =>
    db
      .select(recordColumns)
      .from(relatedRecords)
      .innerJoin(features, eq(features.id, relatedRecords.featureId))
      .where(eq(features.groupId, user.groupId))
      .orderBy(asc(relatedRecords.createdAt))
  )

  .post(
    '/',
    async ({ user, body, status }) => {
      const table = await findTable(user, body.tableId)
      if (!table) return status(404, { detail: 'Related table not found' })
      const denied = await checkModify(user, body.featureId)
      if (denied === 404) return status(404, { detail: 'Feature not found' })
      if (denied === 403) return status(403, forbidden)
      const [feature] = await db.select({ layerId: features.layerId }).from(features).where(eq(features.id, body.featureId))
      if (feature?.layerId !== table.layerId) return status(422, { detail: 'feature นี้ไม่ได้อยู่ใน layer ของตารางย่อยนี้' })
      const checked = checkValues(table.fields, body.values)
      if (checked.error !== undefined) return status(422, { detail: checked.error })
      if (!Object.keys(checked.values).length) return status(422, emptyRow)
      const [row] = await db
        .insert(relatedRecords)
        .values({ tableId: table.id, featureId: body.featureId, values: checked.values })
        .returning(recordColumns)
      return status(201, row)
    },
    { body: RecordIn }
  )

  // แทนค่าทั้งแถว (ส่งค่าที่ต้องการให้เหลือทั้งหมด)
  .patch(
    '/:id',
    async ({ user, params, body, status }) => {
      const record = await findRecord(user, params.id)
      if (!record) return status(404, notFound)
      if ((await checkModify(user, record.featureId)) !== null) return status(403, forbidden)
      const table = await findTable(user, record.tableId)
      if (!table) return status(404, notFound)
      const checked = checkValues(table.fields, body.values)
      if (checked.error !== undefined) return status(422, { detail: checked.error })
      if (!Object.keys(checked.values).length) return status(422, emptyRow)
      const [row] = await db
        .update(relatedRecords)
        .set({ values: checked.values, updatedAt: sql`now()` })
        .where(eq(relatedRecords.id, record.id))
        .returning(recordColumns)
      return row
    },
    { params: IdParams, body: RecordPatch }
  )

  .delete(
    '/:id',
    async ({ user, params, status }) => {
      const record = await findRecord(user, params.id)
      if (!record) return status(404, notFound)
      if ((await checkModify(user, record.featureId)) !== null) return status(403, forbidden)
      await db.delete(relatedRecords).where(eq(relatedRecords.id, record.id))
      return status(204)
    },
    { params: IdParams }
  )
