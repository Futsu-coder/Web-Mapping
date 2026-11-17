import { Elysia } from 'elysia'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { layers, userLayerPreferences as prefs } from '../db/schema'
import { auth } from '../auth'
import { LayerPrefsIn } from '../validation'

const columns = { layerId: prefs.layerId, position: prefs.position, visible: prefs.visible }

/**
 * ลำดับ/การซ่อน layer ของ "ตัวเอง" — ทุกคนใน group เรียกได้ (ไม่ต้องเป็นเจ้าของ group)
 * อ่าน/เขียนเฉพาะแถวของ user.id และเฉพาะ layer ใน group ปัจจุบัน
 */
export const layerPrefRoutes = new Elysia({ tags: ['layers'] })
  .use(auth)

  .get('/layer-preferences', ({ user }) =>
    db
      .select(columns)
      .from(prefs)
      .innerJoin(layers, eq(layers.id, prefs.layerId))
      .where(and(eq(prefs.userId, user.id), eq(layers.groupId, user.groupId)))
      .orderBy(asc(prefs.position))
  )

  // แทนทั้งชุด: position = index ใน items; layer ที่ไม่อยู่ใน group ถูกตัดทิ้ง
  .put(
    '/layer-preferences',
    async ({ user, body }) => {
      const ids = [...new Set(body.items.map((i) => i.layerId))]
      const mine = ids.length
        ? new Set(
            (
              await db
                .select({ id: layers.id })
                .from(layers)
                .where(and(inArray(layers.id, ids), eq(layers.groupId, user.groupId)))
            ).map((r) => r.id)
          )
        : new Set<number>()
      const seen = new Set<number>()
      const rows = body.items
        .filter((i) => mine.has(i.layerId) && !seen.has(i.layerId) && seen.add(i.layerId))
        .map((i, position) => ({ userId: user.id, layerId: i.layerId, position, visible: i.visible }))
      if (rows.length) {
        await db
          .insert(prefs)
          .values(rows)
          .onConflictDoUpdate({
            target: [prefs.userId, prefs.layerId],
            set: { position: sql`excluded.position`, visible: sql`excluded.visible`, updatedAt: sql`now()` }
          })
      }
      return rows.map(({ layerId, position, visible }) => ({ layerId, position, visible }))
    },
    { body: LayerPrefsIn }
  )
