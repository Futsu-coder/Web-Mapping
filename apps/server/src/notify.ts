import { and, eq, ne } from 'drizzle-orm'
import { db } from './db'
import { notifications, profiles } from './db/schema'

/** db ปกติ หรือ transaction (ให้แจ้งเตือนอยู่ใน transaction เดียวกับเหตุการณ์ได้) */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

// แจ้งเฉพาะเรื่องคำเชิญและสมาชิก — การเพิ่ม/แก้/ลบ feature ไม่แจ้ง (เยอะเกินจนรก เห็นบนแผนที่แบบ Realtime อยู่แล้ว)
export type Note = {
  kind: 'invitation' | 'member'
  action: string
  actor: { id: string; username: string }
  subject?: string
  refId?: number
}

/** สร้างการแจ้งเตือนถึงผู้ใช้หลายคน (ไม่แจ้งตัวผู้กระทำเอง) */
export async function notify(exec: Executor, userIds: string[], note: Note) {
  const to = [...new Set(userIds)].filter((id) => id !== note.actor.id)
  if (!to.length) return
  await exec.insert(notifications).values(
    to.map((userId) => ({
      userId,
      kind: note.kind,
      action: note.action,
      actorId: note.actor.id,
      actorName: note.actor.username,
      subject: note.subject ?? '',
      refId: note.refId ?? null
    }))
  )
}

/** id สมาชิกทั้งหมดใน group (ยกเว้นคนที่ระบุ) */
export async function memberIds(exec: Executor, groupId: number, exceptId?: string) {
  const rows = await exec
    .select({ id: profiles.id })
    .from(profiles)
    .where(exceptId ? and(eq(profiles.groupId, groupId), ne(profiles.id, exceptId)) : eq(profiles.groupId, groupId))
  return rows.map((r) => r.id)
}
