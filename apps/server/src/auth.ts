import { createClient } from '@supabase/supabase-js'
import { Elysia, status } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { groups, profiles } from './db/schema'
import { traced } from './telemetry'
import { SpanKind } from '@opentelemetry/api'

// secret key (service role) ข้ามทุก RLS — ใช้เฉพาะฝั่ง API ห้ามส่งไปหน้าเว็บ
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null

if (!supabaseAdmin) {
  console.warn('SUPABASE_URL / SUPABASE_SECRET_KEY is not set — login และ API ที่ต้อง login จะใช้ไม่ได้')
}

export type CurrentUser = {
  id: string
  userNo: number
  username: string
  groupId: number
  /** เจ้าของ group = แอดมินของ group */
  isGroupOwner: boolean
}

/** โหลดข้อมูลผู้ใช้ปัจจุบันจาก database (เรียกซ้ำหลังย้าย group ได้) */
export async function loadUser(id: string): Promise<CurrentUser | null> {
  // span ตาม OTel semconv database: ชื่อ "{db.operation.name} {target}", kind CLIENT
  const dbSpan = {
    kind: SpanKind.CLIENT,
    attributes: { 'db.system.name': 'postgresql', 'db.operation.name': 'SELECT', 'db.collection.name': 'profiles' }
  }
  const [row] = await traced('SELECT profiles', dbSpan, () =>
    db
      .select({
        id: profiles.id,
        userNo: profiles.userNo,
        username: profiles.username,
        groupId: profiles.groupId,
        groupOwnerId: groups.ownerId
      })
      .from(profiles)
      .innerJoin(groups, eq(groups.id, profiles.groupId))
      .where(eq(profiles.id, id))
  )
  if (!row) return null
  const { groupOwnerId, ...user } = row
  return { ...user, isGroupOwner: groupOwnerId === row.id }
}

const unauthorized = (detail = 'ต้องเข้าสู่ระบบก่อน') => status(401, { detail })

/**
 * ตรวจ `Authorization: Bearer <access token ของ Supabase>` แล้วใส่ `user` ให้ทุก route ที่ใช้ plugin นี้
 * ไม่มี token / token หมดอายุ / ยังไม่มี profile → 401
 */
export const auth = new Elysia({ name: 'auth' }).derive({ as: 'scoped' }, async ({ headers }) => {
  const token = headers.authorization?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw unauthorized()
  if (!supabaseAdmin) throw status(503, { detail: 'ยังไม่ได้ตั้งค่า Supabase บน server' })

  // getClaims ตรวจลายเซ็น JWT (แบบ asymmetric ตรวจในเครื่องด้วย JWKS, แบบเก่าถาม Supabase)
  // span ของเราเอง (ไม่มี semconv สำหรับขั้นนี้) แยกเวลาตรวจ token ออกจากเวลา query DB
  const { data, error } = await traced('auth.getClaims', {}, () => supabaseAdmin.auth.getClaims(token))
  const userId = data?.claims.sub
  if (error || !userId) throw unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')

  const user = await loadUser(userId)
  if (!user) throw unauthorized('ไม่พบบัญชีผู้ใช้')
  return { user }
})

/** error จาก postgres: ค่าซ้ำกับ unique constraint */
export const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err.code === '23505' || err.cause?.code === '23505'
}
