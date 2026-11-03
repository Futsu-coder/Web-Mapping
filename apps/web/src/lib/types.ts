import type L from "leaflet";
import type { GeomType } from "../api";

export type { GeomType };
export type Item = { id: number; name: string; type: GeomType; layer: L.Layer };

export const FILTERS: (GeomType | "All")[] = ["All", "Point", "LineString", "Polygon"];

/** Geoman's `enableDraw`/`disableDraw` shape argument strings — note "Line", not "LineString"/"Polyline". */
export type DrawShape = "Marker" | "Line" | "Polygon";

export const SHAPE_TO_GEOM_TYPE: Record<DrawShape, GeomType> = {
  Marker: "Point",
  Line: "LineString",
  Polygon: "Polygon",
};
