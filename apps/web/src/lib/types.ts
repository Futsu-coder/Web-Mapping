import type L from "leaflet";
import type { FeatureProps, GeomType } from "../api";

export type { GeomType };
export type Item = { id: number; type: GeomType; props: FeatureProps; layer: L.Layer };

export const FILTERS: (GeomType | "All")[] = ["All", "Point", "LineString", "Polygon"];

/** Geoman's `enableDraw`/`disableDraw` shape argument strings — note "Line", not "LineString"/"Polyline". */
export type DrawShape = "Marker" | "Line" | "Polygon";

export const SHAPE_TO_GEOM_TYPE: Record<DrawShape, GeomType> = {
  Marker: "Point",
  Line: "LineString",
  Polygon: "Polygon",
};

/**
 * feature ที่เลือกอยู่
 * - view: คลิกแถว/คลิกบนแผนที่ = อ่านอย่างเดียว
 * - edit: กดปุ่มปากกา = แก้ฟอร์ม + ลากรูปทรงได้
 * - create: เพิ่งวาด ยังไม่บันทึก
 */
export type Selection =
  | { mode: "view"; id: number }
  | { mode: "edit"; id: number }
  | { mode: "create"; layer: L.Layer; type: GeomType };
