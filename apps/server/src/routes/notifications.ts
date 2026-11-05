import { Elysia, t } from 'elysia'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { notifications } from '../db/schema'
import { auth } from '../auth'

const KINDS = ['invitation', 'member'] as const

// log การแจ้งเตือนของตัวเอง (กระดิ่งใน Navbar)
export const notificationRoutes = new Elysia({ prefix: '/notifications', tags: ['notifications'] })
  .use(auth)

  // ล่าสุดก่อน + จำนวนที่ยังไม่อ่าน (นับทุกประเภท)
  .get(
    '/',
    async ({ user, query }) => {
      const mine = eq(notifications.userId, user.id)
      const items = await db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          action: notifications.action,
          actorName: notifications.actorName,
          subject: notifications.subject,
          refId: notifications.refId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt
        })
        .from(notifications)
        .where(query.kind ? and(mine, eq(notifications.kind, query.kind)) : mine)
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.limit ?? 50)
      const [{ unread }] = await db
        .select({ unread: count() })
        .from(notifications)
        .where(and(mine, isNull(notifications.readAt)))
      return { items, unread }
    },
    {
      query: t.Object({
        kind: t.Optional(t.Union(KINDS.map((k) => t.Literal(k)))),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 }))
      })
    }
  )

  // อ่านแล้วทั้งหมด
  .post('/read', async ({ user, status }) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    return status(204)
  })

  // ล้าง log ทั้งหมดของตัวเอง
  .delete('/', async ({ user, status }) => {
    await db.delete(notifications).where(eq(notifications.userId, user.id))
    return status(204)
  })
