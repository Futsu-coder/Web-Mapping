import type { LngLatBoundsLike, StyleSpecification } from "maplibre-gl";

// แผนที่ฐานแบบ vector tiles ของ OpenFreeMap (ใช้ข้อมูล OSM, ฟรี ไม่ต้องใช้ key)
// GPU เป็นคนวาด ตัวหนังสือคมทุกระดับ และซูมเกินระดับ 14 ได้โดยไม่ต้องโหลดใหม่
// (ขนาดข้อมูล: ระดับเมืองเล็กกว่า PNG ของ OSM ~30% แต่ระดับประเทศใหญ่กว่า ~2 เท่า)
export const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/liberty";

export const INITIAL_ZOOM = 5;

// ความสูงภูมิประเทศ (ภูเขา) สำหรับโหมด 3D: Terrain Tiles ของ AWS (Terrarium, ฟรี ไม่ต้องใช้ key)
// โหลดเฉพาะตอนเปิด 3D — โหมด 2D ไม่ขอ tile นี้เลย (ไฟล์ละ ~76 KB และ server ตอบช้า ~1.5 วิ)
export const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_EXAGGERATION = 1.5; // ขยายความสูงให้ภูเขาเห็นชัดขึ้น

// ฟอนต์สำหรับตัวเลขบน cluster (ต้องมีใน glyphs ของ style)
export const LABEL_FONT = ["Noto Sans Regular"];

// สำรอง: ถ้าโหลด style ของ OpenFreeMap ไม่ได้ กลับไปใช้รูป PNG ของ OSM แบบเดิม
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/**
 * ขอบโลกแบบ Web Mercator (lat เกิน ±85° แสดงไม่ได้) — ใช้จำกัดให้เห็นโลกใบเดียว และซูมออกได้แค่โลกเต็มกรอบ
 * lng ใช้ ±179.99 ไม่ใช่ ±180: MapLibre 6 พังตอนสร้างแผนที่ถ้าขอบเขตกว้างครบ 360° พอดี
 */
export const WORLD_BOUNDS: LngLatBoundsLike = [
  [-179.99, -85],
  [179.99, 85],
];
