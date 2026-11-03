import { Elysia, t } from 'elysia'
import { sql } from '../db'
import { FeatureIn, GeomType, IdParams, type FeatureInput } from '../schema'

type Row = {
  id: string
  name: string
  geom_type: string
  geometry: unknown
  properties: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

class InvalidGeometry extends Error {}

const columns = sql`
  id, name, geom_type, ST_AsGeoJSON(geom)::json as geometry, properties, created_at, updated_at
`

function toGeoJSON(row: Row) {
  return {
    type: 'Feature',
    id: Number(row.id),
    geometry: row.geometry,
    properties: {
      ...row.properties,
      name: row.name,
      geom_type: row.geom_type,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString()
    }
  }
}

/** แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรงด้วย PostGIS */
async function parseInput(body: FeatureInput) {
  const geometry = JSON.stringify(body.geometry)
  let check: { valid: boolean; reason: string }
  try {
    ;[check] = await sql<{ valid: boolean; reason: string }[]>`
      select ST_IsValid(g) as valid, ST_IsValidReason(g) as reason
      from (select ST_GeomFromGeoJSON(${geometry}) as g) s
    `
  } catch (e) {
    throw new InvalidGeometry((e as Error).message)
  }
  if (!check.valid) throw new InvalidGeometry(check.reason)

  const props = { ...(body.properties ?? {}) }
  const name = String(props.name || body.geometry.type)
  // ฟิลด์ที่ระบบสร้างเอง ไม่ให้ client เขียนทับ
  for (const key of ['name', 'geom_type', 'created_at', 'updated_at']) delete props[key]

  return { name, geomType: body.geometry.type, geometry, properties: JSON.stringify(props) }
}

export const featuresRoutes = new Elysia({ prefix: '/features', tags: ['features'] })
  .error({ InvalidGeometry })
  .onError(({ code, error, status }) => {
    if (code === 'InvalidGeometry') return status(422, { detail: `Invalid geometry: ${error.message}` })
  })

  .get(
    '/',
    async ({ query }) => {
      const rows = await sql<Row[]>`
        select ${columns} from features
        ${query.type ? sql`where geom_type = ${query.type}` : sql``}
        order by created_at
      `
      return { type: 'FeatureCollection', features: rows.map(toGeoJSON) }
    },
    { query: t.Object({ type: t.Optional(GeomType) }) }
  )

  .get(
    '/:id',
    async ({ params, status }) => {
      const [row] = await sql<Row[]>`select ${columns} from features where id = ${params.id}`
      return row ? toGeoJSON(row) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams }
  )

  .post(
    '/',
    async ({ body, status }) => {
      const f = await parseInput(body)
      const [row] = await sql<Row[]>`
        insert into features (name, geom_type, geom, properties)
        values (${f.name}, ${f.geomType}, ST_SetSRID(ST_GeomFromGeoJSON(${f.geometry}), 4326), ${f.properties}::jsonb)
        returning ${columns}
      `
      return status(201, toGeoJSON(row))
    },
    { body: FeatureIn }
  )

  .put(
    '/:id',
    async ({ params, body, status }) => {
      const f = await parseInput(body)
      const [row] = await sql<Row[]>`
        update features set
          name = ${f.name},
          geom_type = ${f.geomType},
          geom = ST_SetSRID(ST_GeomFromGeoJSON(${f.geometry}), 4326),
          properties = ${f.properties}::jsonb,
          updated_at = now()
        where id = ${params.id}
        returning ${columns}
      `
      return row ? toGeoJSON(row) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams, body: FeatureIn }
  )

  .delete(
    '/:id',
    async ({ params, status }) => {
      const deleted = await sql`delete from features where id = ${params.id}`
      return deleted.count ? status(204) : status(404, { detail: 'Feature not found' })
    },
    { params: IdParams }
  )
