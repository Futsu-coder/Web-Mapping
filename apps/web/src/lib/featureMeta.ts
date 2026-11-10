import type { ApiFeature, FeatureProps, StoredProps } from "../api";
import type { FieldValues } from "./layers";

// key ใน properties ที่ไม่ใช่ค่าของหัวข้อใน layer ("category" = ข้อมูลเก่าในโหมดทดลองสมัยก่อนมี layer)
const RESERVED = new Set([
  "name",
  "category",
  "description",
  "layer_id",
  "geom_type",
  "owner_id",
  "owner_name",
  "created_at",
  "updated_at",
]);

// ดึงฟิลด์ที่ผู้ใช้กรอกออกจาก properties ของ GeoJSON Feature (API / localStorage)
export function propsOf(f: ApiFeature): FeatureProps {
  const p = f.properties;
  const props: FeatureProps = { name: p.name };
  if (typeof p.description === "string" && p.description) props.description = p.description;
  if (typeof p.layer_id === "number") {
    props.layerId = p.layer_id;
    const values: FieldValues = {};
    for (const [k, v] of Object.entries(p)) {
      if (!RESERVED.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) values[k] = v;
    }
    if (Object.keys(values).length) props.values = values;
  }
  return props;
}

/** กลับด้านของ propsOf: layerId / values → properties แบบแบน (layer_id + key ของแต่ละหัวข้อ) */
export function toStoredProps({ layerId, values, ...rest }: FeatureProps): StoredProps {
  const out: StoredProps = { ...rest };
  if (layerId !== undefined) Object.assign(out, values, { layer_id: layerId });
  return out;
}

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
