import { t } from 'elysia'
import { FIELD_KEY_PATTERN } from '../../shared/layers'

// รับเฉพาะ 3 ชนิดตามโจทย์ ชนิดอื่นจะได้ 422 อัตโนมัติ
export const GeomType = t.Union([t.Literal('Point'), t.Literal('LineString'), t.Literal('Polygon')])

const Position = t.Array(t.Number(), { minItems: 2, maxItems: 3 })

const Geometry = t.Union([
  t.Object({ type: t.Literal('Point'), coordinates: Position }),
  t.Object({ type: t.Literal('LineString'), coordinates: t.Array(Position, { minItems: 2 }) }),
  t.Object({ type: t.Literal('Polygon'), coordinates: t.Array(t.Array(Position, { minItems: 4 }), { minItems: 1 }) })
])

// layer ที่ feature อยู่ — POST/PUT ต้องส่ง, PATCH ห้าม null (ตรวจใน routes/features.ts); feature เก่าอาจยังไม่มี layer
const LayerRef = t.Union([t.Integer({ minimum: 1 }), t.Null()])

// ขาเข้า: GeoJSON Feature — name / description / layer_id + ค่าของหัวข้อใน layer (key f_xxxx) เก็บใน properties
export const FeatureIn = t.Object(
  {
    type: t.Literal('Feature'),
    geometry: Geometry,
    properties: t.Object(
      {
        name: t.String({ minLength: 1, maxLength: 100, pattern: '\\S' }), // ต้องมีตัวที่ไม่ใช่ช่องว่าง
        description: t.Optional(t.String({ maxLength: 2000 })),
        layer_id: t.Optional(LayerRef)
      },
      { additionalProperties: true }
    )
  },
  {
    examples: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [100.5018, 13.7563] },
        properties: { name: 'Bangkok', description: 'เมืองหลวง', layer_id: 1 }
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[100.49, 13.75], [100.52, 13.74]] },
        properties: { name: 'ถนนตัวอย่าง', description: 'เส้นทางตัวอย่าง', layer_id: 1 }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[100.49, 13.74], [100.51, 13.74], [100.51, 13.76], [100.49, 13.76], [100.49, 13.74]]]
        },
        properties: { name: 'พื้นที่ตัวอย่าง', description: 'พื้นที่สีเขียว', layer_id: 1 }
      }
    ]
  }
)

export type FeatureInput = typeof FeatureIn.static

// PATCH: JSON Merge Patch (RFC 7396) — ส่งเฉพาะส่วนที่เปลี่ยน, null = ลบ key
export const FeaturePatch = t.Object({
  type: t.Optional(t.Literal('Feature')),
  geometry: t.Optional(Geometry),
  properties: t.Optional(
    t.Object(
      {
        name: t.Optional(t.String({ minLength: 1, maxLength: 100, pattern: '\\S' })),
        description: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        layer_id: t.Optional(LayerRef)
      },
      { additionalProperties: true }
    )
  )
})

export type FeaturePatchInput = typeof FeaturePatch.static

export const IdParams = t.Object({ id: t.Numeric() })

// ---------- layer / ตารางย่อย / แถว ----------
const Field = t.Object({
  key: t.String({ pattern: FIELD_KEY_PATTERN }),
  label: t.String({ minLength: 1, maxLength: 60 }),
  type: t.Union([t.Literal('text'), t.Literal('number'), t.Literal('choice'), t.Literal('boolean')]),
  options: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 }))
})
const Fields = t.Array(Field, { maxItems: 50 })
const Name = t.String({ minLength: 1, maxLength: 60, pattern: '\\S' })
const Color = t.String({ pattern: '^#[0-9a-fA-F]{6}$' })

export const LayerIn = t.Object({ name: Name, geomType: GeomType, color: Color, fields: t.Optional(Fields) })
/** แก้ layer — geomType เปลี่ยนไม่ได้ (feature ใน layer เป็นชนิดนั้นอยู่แล้ว) */
export const LayerPatch = t.Object({ name: t.Optional(Name), color: t.Optional(Color), fields: t.Optional(Fields) })

export const TableIn = t.Object({
  layerId: t.Integer({ minimum: 1 }),
  name: Name,
  fields: t.Optional(Fields),
  countKey: t.Optional(t.Union([t.String(), t.Null()]))
})
export const TablePatch = t.Object({
  name: t.Optional(Name),
  fields: t.Optional(Fields),
  countKey: t.Optional(t.Union([t.String(), t.Null()]))
})

const Values = t.Record(t.String(), t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]))
export const RecordIn = t.Object({ tableId: t.Integer({ minimum: 1 }), featureId: t.Integer({ minimum: 1 }), values: Values })
export const RecordPatch = t.Object({ values: Values })

export const ToTableBody = t.Object({ name: t.Optional(Name) })
export const FieldKeyParams = t.Object({ id: t.Numeric(), key: t.String({ pattern: FIELD_KEY_PATTERN }) })
