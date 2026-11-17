import type { FeatureProps, GeomType } from "../api";

export type { GeomType };
/** ownerId/ownerName = null สำหรับ feature ในโหมดทดลอง (ยังไม่ login) */
export type Item = {
  id: number;
  type: GeomType;
  props: FeatureProps;
  /** รูปทรงล่าสุดที่บันทึกแล้ว (ตรงกับ database / localStorage) */
  geometry: GeoJSON.Geometry;
  ownerId: string | null;
  ownerName: string | null;
};

export const FILTERS: (GeomType | "All")[] = ["All", "Point", "LineString", "Polygon"];

/** เครื่องมือวาด (DrawFab) (ชื่อเดิมจากสมัยใช้ Geoman — "Line" ไม่ใช่ "LineString") */
export type DrawShape = "Marker" | "Line" | "Polygon";

/** โหมดของ mapbox-gl-draw ที่ใช้วาดแต่ละชนิด */
export const DRAW_MODE: Record<DrawShape, string> = {
  Marker: "draw_point",
  Line: "draw_line_string",
  Polygon: "draw_polygon",
};

export const SHAPE_TO_GEOM_TYPE: Record<DrawShape, GeomType> = {
  Marker: "Point",
  Line: "LineString",
  Polygon: "Polygon",
};

/**
 * feature ที่เลือกอยู่
 * - view: คลิกแถว/คลิกบนแผนที่ = อ่านอย่างเดียว
 * - edit: กดปุ่มปากกา = แก้ฟอร์ม + ลากรูปทรงได้
 * - create: เพิ่งวาด ยังไม่บันทึก (รูปทรงอยู่ใน mapbox-gl-draw ด้วย id = drawId)
 */
export type Selection =
  | { mode: "view"; id: number }
  | { mode: "edit"; id: number }
  | { mode: "create"; drawId: string; type: GeomType };
