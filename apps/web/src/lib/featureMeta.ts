import type { ApiFeature, FeatureProps } from "../api";

// ดึงฟิลด์ที่ผู้ใช้กรอกออกจาก properties ของ GeoJSON Feature ที่ API ตอบมา
export const propsOf = (f: ApiFeature): FeatureProps => ({
  name: f.properties.name,
  category: f.properties.category,
  description: f.properties.description,
});

const roundCoords = (c: unknown): unknown =>
  Array.isArray(c) ? c.map(roundCoords) : typeof c === "number" ? Math.round(c * 1e6) / 1e6 : c;

// เทียบรูปทรงที่ความละเอียด 6 ทศนิยม (PostGIS ตอบมาละเอียดกว่าที่วาดบนเว็บ)
export const sameGeometry = (a: GeoJSON.Geometry, b: GeoJSON.Geometry) =>
  a.type === b.type &&
  JSON.stringify(roundCoords((a as GeoJSON.Point).coordinates)) ===
    JSON.stringify(roundCoords((b as GeoJSON.Point).coordinates));

export const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** จุดทุกจุดของ Point / LineString / Polygon (วงนอก) เป็น [lng, lat] */
export function positionsOf(g: GeoJSON.Geometry): GeoJSON.Position[] {
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "LineString") return g.coordinates;
  if (g.type === "Polygon") return g.coordinates[0] ?? [];
  return [];
}

/** กรอบสี่เหลี่ยมที่ครอบรูปทรง [[ตะวันตก, ใต้], [ตะวันออก, เหนือ]] */
export function bboxOf(g: GeoJSON.Geometry): [[number, number], [number, number]] {
  const pts = positionsOf(g);
  const lngs = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Point = ตำแหน่งจุด, Line/Polygon = จุดกึ่งกลางของกรอบ */
export function centerOf(g: GeoJSON.Geometry): [number, number] {
  if (g.type === "Point") return [g.coordinates[0], g.coordinates[1]];
  const [[w, s], [e, n]] = bboxOf(g);
  return [(w + e) / 2, (s + n) / 2];
}
