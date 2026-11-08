import L from "leaflet";

export const OSM_TILE = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
};

/** ขอบโลกของแผนที่แบบ Web Mercator (lat เกิน ±85.05° แสดงไม่ได้) — ใช้จำกัดให้เห็นโลกใบเดียว */
export const WORLD_BOUNDS = L.latLngBounds([-85.05, -180], [85.05, 180]);
