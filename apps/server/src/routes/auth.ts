import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { groups, profiles } from '../db/schema'
import { isUniqueViolation, supabaseAdmin } from '../auth'
import { emailOf, isValidUsername, normalizeUsername, PASSWORD_MIN } from '../../../shared/auth'

const taken = { detail: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' }

// สมัครผ่าน API เท่านั้น (ปิด public sign-up ใน Supabase) เพื่อบังคับกติกา username และสร้าง group + profile ให้ครบ
export const authRoutes = new Elysia({ prefix: '/auth', tags: ['auth'] }).post(
  '/signup',
  async ({ body, status }) => {
    if (!supabaseAdmin) return status(503, { detail: 'ยังไม่ได้ตั้งค่า Supabase บน server' })

    const username = normalizeUsername(body.username)
    if (!isValidUsername(username)) {
      return status(422, { detail: 'ชื่อผู้ใช้ต้องเป็น a-z, 0-9 หรือ _ ยาว 3–20 ตัว และห้ามเป็นตัวเลขล้วน' })
    }
    const [exists] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username))
    if (exists) return status(409, taken)

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailOf(username),
      password: body.password,
      email_confirm: true, // ไม่มีการส่งอีเมลยืนยัน
      user_metadata: { username }
    })
    if (error || !data.user) {
      if (error?.code === 'email_exists') return status(409, taken)
      return status(422, { detail: error?.message ?? 'สมัครไม่สำเร็จ' })
    }
    const id = data.user.id

    try {
      await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ name: `กลุ่มของ ${username}`, ownerId: id })
          .returning({ id: groups.id })
        await tx.insert(profiles).values({ id, username, groupId: group.id })
      })
    } catch (e) {
      await supabaseAdmin.auth.admin.deleteUser(id) // ไม่ให้มีบัญชีที่ไม่มี profile ค้างอยู่
      if (isUniqueViolation(e)) return status(409, taken)
      throw e
    }

    return status(201, { username })
  },
  {
    body: t.Object({
      username: t.String({ minLength: 1, maxLength: 40 }),
      password: t.String({ minLength: PASSWORD_MIN, maxLength: 72 })
    })
  }
)
