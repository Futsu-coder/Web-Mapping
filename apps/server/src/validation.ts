import { t } from 'elysia'

// รับเฉพาะ 3 ชนิดตามโจทย์ ชนิดอื่นจะได้ 422 อัตโนมัติ
export const GeomType = t.Union([t.Literal('Point'), t.Literal('LineString'), t.Literal('Polygon')])

const Position = t.Array(t.Number(), { minItems: 2, maxItems: 3 })

const Geometry = t.Union([
  t.Object({ type: t.Literal('Point'), coordinates: Position }),
  t.Object({ type: t.Literal('LineString'), coordinates: t.Array(Position, { minItems: 2 }) }),
  t.Object({ type: t.Literal('Polygon'), coordinates: t.Array(t.Array(Position, { minItems: 4 }), { minItems: 1 }) })
])

// ขาเข้า: GeoJSON Feature, ชื่อเก็บใน properties.name
export const FeatureIn = t.Object(
  {
    type: t.Literal('Feature'),
    geometry: Geometry,
    properties: t.Optional(t.Nullable(t.Record(t.String(), t.Any())))
  },
  {
    examples: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [100.5018, 13.7563] },
        properties: { name: 'Bangkok' }
      },
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[100.49, 13.75], [100.52, 13.74]] },
        properties: { name: 'ถนนตัวอย่าง' }
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[100.49, 13.74], [100.51, 13.74], [100.51, 13.76], [100.49, 13.76], [100.49, 13.74]]]
        },
        properties: { name: 'พื้นที่ตัวอย่าง' }
      }
    ]
  }
)

export type FeatureInput = typeof FeatureIn.static

export const IdParams = t.Object({ id: t.Numeric() })
