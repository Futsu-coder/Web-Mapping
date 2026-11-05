import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import { groups, invitations, profiles } from '../db/schema'
import { auth, isUniqueViolation, type CurrentUser } from '../auth'
import { memberIds, notify } from '../notify'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * ย้ายผู้ใช้ออกจาก group ปัจจุบันไป group อื่น
 * - ยังมีสมาชิกเหลือ → แจ้งว่าออก และถ้าเป็นเจ้าของ → โอนให้สมาชิกที่อยู่นานที่สุด
 * - ไม่เหลือใครแล้ว → ลบ group เดิมทิ้ง (feature + คำเชิญของ group นั้นถูกลบตาม — on delete cascade)
 */
async function moveToGroup(tx: Tx, user: CurrentUser, groupId: number) {
  const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, user.groupId))
  const others = await memberIds(tx, user.groupId, user.id)

  if (others.length) {
    await notify(tx, others, { kind: 'member', action: 'left', actor: user, subject: group?.name })
    if (user.isGroupOwner) {
      const [next] = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.groupId, user.groupId), ne(profiles.id, user.id)))
        .orderBy(asc(profiles.joinedAt))
        .limit(1)
      await tx.update(groups).set({ ownerId: next.id }).where(eq(groups.id, user.groupId))
      await notify(tx, [next.id], { kind: 'member', action: 'owner', actor: user, subject: group?.name })
    }
  }

  await tx.update(profiles).set({ groupId, joinedAt: new Date() }).where(eq(profiles.id, user.id))
  // ต้องย้าย profile ออกก่อน ไม่งั้นลบ group ไม่ได้ (profiles.group_id อ้างอยู่)
  if (!others.length) await tx.delete(groups).where(eq(groups.id, user.groupId))
}

const memberCount = async (groupId: number) =>
  (await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.groupId, groupId))).length

const inviter = alias(profiles, 'inviter')

export const groupRoutes = new Elysia({ tags: ['groups'] })
  .use(auth)

  // ข้อมูลตัวเอง + group + รายชื่อสมาชิก (เรียงตามเวลาที่เข้า group)
  .get('/me', async ({ user }) => {
    const [group] = await db
      .select({ id: groups.id, name: groups.name, ownerId: groups.ownerId })
      .from(groups)
      .where(eq(groups.id, user.groupId))
    const members = await db
      .select({ id: profiles.id, username: profiles.username, userNo: profiles.userNo, joinedAt: profiles.joinedAt })
      .from(profiles)
      .where(eq(profiles.groupId, user.groupId))
      .orderBy(asc(profiles.joinedAt))
    return { user: { id: user.id, username: user.username, userNo: user.userNo }, group, members }
  })

  .patch(
    '/group',
    async ({ user, body, status }) => {
      if (!user.isGroupOwner) return status(403, { detail: 'เฉพาะเจ้าของ group เท่านั้นที่เปลี่ยนชื่อได้' })
      const [group] = await db
        .update(groups)
        .set({ name: body.name.trim() })
        .where(eq(groups.id, user.groupId))
        .returning({ id: groups.id, name: groups.name, ownerId: groups.ownerId })
      return group
    },
    { body: t.Object({ name: t.String({ minLength: 1, maxLength: 50 }) }) }
  )

  // ออกจาก group → ได้ group ส่วนตัวใหม่ (feature ที่วาดไว้อยู่กับ group เดิมให้สมาชิกที่เหลือใช้ต่อ)
  .post('/group/leave', async ({ user, status }) => {
    if ((await memberCount(user.groupId)) <= 1) {
      return status(400, { detail: 'คุณอยู่ใน group ส่วนตัวคนเดียวอยู่แล้ว' })
    }
    await db.transaction(async (tx) => {
      const [group] = await tx
        .insert(groups)
        .values({ name: `กลุ่มของ ${user.username}`, ownerId: user.id })
        .returning({ id: groups.id })
      await moveToGroup(tx, user, group.id)
    })
    return status(204)
  })

  // เชิญด้วย UserID (#1024 / 1024) หรือ username
  .post(
    '/invitations',
    async ({ user, body, status }) => {
      const target = body.target.trim()
      const byNo = target.match(/^#?(\d+)$/)
      const [invitee] = await db
        .select({ id: profiles.id, username: profiles.username, userNo: profiles.userNo, groupId: profiles.groupId })
        .from(profiles)
        .where(byNo ? eq(profiles.userNo, Number(byNo[1])) : eq(profiles.username, target.toLowerCase()))
      if (!invitee) return status(404, { detail: 'ไม่พบผู้ใช้' })
      if (invitee.id === user.id) return status(400, { detail: 'เชิญตัวเองไม่ได้' })
      if (invitee.groupId === user.groupId) return status(409, { detail: `${invitee.username} อยู่ใน group นี้แล้ว` })

      try {
        await db.transaction(async (tx) => {
          const [inv] = await tx
            .insert(invitations)
            .values({ groupId: user.groupId, inviterId: user.id, inviteeId: invitee.id })
            .returning({ id: invitations.id })
          const [group] = await tx.select({ name: groups.name }).from(groups).where(eq(groups.id, user.groupId))
          await notify(tx, [invitee.id], { kind: 'invitation', action: 'invited', actor: user, subject: group?.name, refId: inv.id })
        })
      } catch (e) {
        if (isUniqueViolation(e)) return status(409, { detail: `มีคำเชิญถึง ${invitee.username} ที่รอตอบอยู่แล้ว` })
        throw e
      }
      return status(201, { username: invitee.username, userNo: invitee.userNo })
    },
    { body: t.Object({ target: t.String({ minLength: 1, maxLength: 40 }) }) }
  )

  // คำเชิญที่รอเราตอบ
  .get('/invitations', ({ user }) =>
    db
      .select({
        id: invitations.id,
        groupId: invitations.groupId,
        groupName: groups.name,
        inviterName: inviter.username,
        createdAt: invitations.createdAt
      })
      .from(invitations)
      .innerJoin(groups, eq(groups.id, invitations.groupId))
      .innerJoin(inviter, eq(inviter.id, invitations.inviterId))
      .where(and(eq(invitations.inviteeId, user.id), eq(invitations.status, 'pending')))
      .orderBy(desc(invitations.createdAt))
  )

  .post(
    '/invitations/:id/:action',
    async ({ user, params, status }) => {
      const [inv] = await db
        .select({ id: invitations.id, groupId: invitations.groupId, inviterId: invitations.inviterId, groupName: groups.name })
        .from(invitations)
        .innerJoin(groups, eq(groups.id, invitations.groupId))
        .where(
          and(eq(invitations.id, params.id), eq(invitations.inviteeId, user.id), eq(invitations.status, 'pending'))
        )
      if (!inv) return status(404, { detail: 'ไม่พบคำเชิญ' })
      const answer = { kind: 'invitation', actor: user, subject: inv.groupName, refId: inv.id } as const

      if (params.action === 'reject') {
        await db.transaction(async (tx) => {
          await tx.update(invitations).set({ status: 'rejected' }).where(eq(invitations.id, inv.id))
          await notify(tx, [inv.inviterId], { ...answer, action: 'rejected' })
        })
        return status(204)
      }

      // ยอมรับ = ย้ายไป group ใหม่ (group เดิม: ยังมีคน → feature อยู่ต่อ, ไม่เหลือใคร → ลบทั้ง group)
      await db.transaction(async (tx) => {
        if (inv.groupId !== user.groupId) {
          const newMates = await memberIds(tx, inv.groupId)
          await moveToGroup(tx, user, inv.groupId)
          // ผู้เชิญได้ "ยอมรับแล้ว" อย่างเดียว สมาชิกคนอื่นได้ "เข้าร่วม group"
          await notify(
            tx,
            newMates.filter((id) => id !== inv.inviterId),
            { kind: 'member', action: 'joined', actor: user, subject: inv.groupName }
          )
        }
        await tx.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, inv.id))
        await notify(tx, [inv.inviterId], { ...answer, action: 'accepted' })
      })
      return status(204)
    },
    { params: t.Object({ id: t.Numeric(), action: t.Union([t.Literal('accept'), t.Literal('reject')]) }) }
  )
