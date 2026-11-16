import { sql } from 'drizzle-orm'
import type { FieldValues, LayerField } from '../../../shared/layers'
import {
  bigint,
  boolean,
  integer,
  primaryKey,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

// PostGIS geometry รวมทุกชนิด (Point / LineString / Polygon) ใน SRID 4326
// อ่าน/เขียนผ่าน ST_AsGeoJSON / ST_GeomFromGeoJSON ใน query เสมอ
const geometry = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(Geometry, 4326)'
})

// group ของผู้ใช้ — สมัครแล้วได้ group ส่วนตัว 1 อัน, owner = แอดมินของ group (แก้/ลบ feature ของทุกคนใน group ได้)
// owner_id ไม่ทำ foreign key เพราะ profiles ก็อ้าง groups อยู่ (วนกัน)
export const groups = pgTable('groups', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
})

// ข้อมูลผู้ใช้ — id ตรงกับ auth.users ของ Supabase
// user_no = UserID ที่คนพิมพ์ได้ (#1001) ใช้เชิญเข้า group
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    userNo: bigint('user_no', { mode: 'number' }).notNull().unique().generatedAlwaysAsIdentity({ startWith: 1001 }),
    username: text('username').notNull().unique(),
    groupId: bigint('group_id', { mode: 'number' })
      .notNull()
      .references(() => groups.id),
    // เวลาที่เข้า group ปัจจุบัน — ใช้หาคนที่อยู่นานที่สุดตอนโอนเจ้าของ
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    // a-z 0-9 _ ยาว 3–20 และห้ามเป็นตัวเลขล้วน (กันสับสนกับ UserID)
    check('profiles_username_check', sql`${t.username} ~ '^[a-z0-9_]{3,20}$' and ${t.username} !~ '^[0-9]+$'`),
    index('profiles_group_id_idx').on(t.groupId)
  ]
)

export const invitations = pgTable(
  'invitations',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    groupId: bigint('group_id', { mode: 'number' })
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    inviteeId: uuid('invitee_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('invitations_status_check', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
    // เชิญคนเดิมเข้า group เดิมซ้ำไม่ได้ ระหว่างที่คำเชิญเก่ายังรอตอบอยู่
    uniqueIndex('invitations_pending_uq').on(t.groupId, t.inviteeId).where(sql`${t.status} = 'pending'`),
    index('invitations_invitee_idx').on(t.inviteeId)
  ]
)

// log การแจ้งเตือนของผู้ใช้แต่ละคน (กระดิ่งใน Navbar) — API เขียนให้เมื่อเกิดเหตุการณ์
// kind: invitation (invited/accepted/rejected) | member (joined/left/owner)
// เก็บชื่อผู้กระทำ/สิ่งที่ถูกกระทำไว้เป็นข้อความ เพื่อให้อ่าน log ได้แม้ feature/ผู้ใช้ถูกลบไปแล้ว
export const notifications = pgTable(
  'notifications',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    action: text('action').notNull(),
    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    subject: text('subject').notNull().default(''),
    /** id ของ invitation ที่เกี่ยวข้อง */
    refId: bigint('ref_id', { mode: 'number' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('notifications_kind_check', sql`${t.kind} in ('invitation', 'member')`),
    index('notifications_user_created_idx').on(t.userId, t.createdAt)
  ]
)

// layer = กลุ่ม feature ชนิดเดียวกันใน group (เช่น โรงเรียน / แม่น้ำ): รูปทรงชนิดเดียว + สี + หัวข้อ property ของตัวเอง
// หัวข้อเก็บเป็นข้อมูล (fields jsonb) ไม่ได้สร้างคอลัมน์จริง → เจ้าของ group สร้าง/แก้เองได้โดยไม่ต้องแก้ database
export const layers = pgTable(
  'layers',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    groupId: bigint('group_id', { mode: 'number' })
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    geomType: text('geom_type').notNull(),
    color: text('color').notNull(),
    fields: jsonb('fields').$type<LayerField[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('layers_geom_type_check', sql`${t.geomType} in ('Point', 'LineString', 'Polygon')`),
    uniqueIndex('layers_group_name_uq').on(t.groupId, t.name)
  ]
)

export const features = pgTable(
  'features',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull(),
    geomType: text('geom_type').notNull(),
    geom: geometry('geom').notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
    // nullable ชั่วคราว: production ที่ยังเป็นโค้ดเก่า insert ได้โดยไม่พัง
    // แถวที่ไม่มีเจ้าของจะไม่แสดงในโค้ดใหม่ และถูกลบด้วย apps/server/sql/realtime.sql
    ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'cascade' }),
    groupId: bigint('group_id', { mode: 'number' }).references(() => groups.id, { onDelete: 'cascade' }),
    // ไม่อยู่ใน layer ได้ (null) — ลบ layer แล้ว feature ไม่หาย แค่กลายเป็น "ไม่มี layer"
    layerId: bigint('layer_id', { mode: 'number' }).references(() => layers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    check('features_geom_type_check', sql`${t.geomType} in ('Point', 'LineString', 'Polygon')`),
    index('features_layer_id_idx').on(t.layerId),
    index('features_geom_idx').using('gist', t.geom),
    index('features_geom_type_idx').on(t.geomType),
    index('features_group_id_idx').on(t.groupId)
  ]
)

// ตารางย่อยของ layer — 1 feature มีได้หลายแถว (เช่น "ปลาที่พบ" ในแม่น้ำ)
// count_key = คอลัมน์สรุปใน attribute table นับค่าไม่ซ้ำของหัวข้อนี้ (null = นับจำนวนแถว)
export const relatedTables = pgTable(
  'related_tables',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    layerId: bigint('layer_id', { mode: 'number' })
      .notNull()
      .references(() => layers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fields: jsonb('fields').$type<LayerField[]>().notNull().default([]),
    countKey: text('count_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex('related_tables_layer_name_uq').on(t.layerId, t.name)]
)

// แถวของตารางย่อย — created_at = วันที่เพิ่มแถว (แก้แถวแล้วไม่เปลี่ยน) ใช้แยกข้อมูลแต่ละรอบสำรวจ/เดือนในตารางเดียว
export const relatedRecords = pgTable(
  'related_records',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tableId: bigint('table_id', { mode: 'number' })
      .notNull()
      .references(() => relatedTables.id, { onDelete: 'cascade' }),
    featureId: bigint('feature_id', { mode: 'number' })
      .notNull()
      .references(() => features.id, { onDelete: 'cascade' }),
    values: jsonb('values').$type<FieldValues>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index('related_records_table_idx').on(t.tableId), index('related_records_feature_idx').on(t.featureId)]
)

// ลำดับ (z-order) + การซ่อน layer ของผู้ใช้แต่ละคน — ส่วนตัว ไม่กระทบคนอื่นใน group
// position: 0 = บนสุด (วาดทับ layer ถัดไป); ไม่มีแถว = layer ใหม่ที่ยังไม่เคยจัด (อยู่บนสุด, แสดง)
export const userLayerPreferences = pgTable(
  'user_layer_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    layerId: bigint('layer_id', { mode: 'number' })
      .notNull()
      .references(() => layers.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    visible: boolean('visible').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.userId, t.layerId] })]
)
