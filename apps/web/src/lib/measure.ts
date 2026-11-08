import L from "leaflet";

type P = { lat: number; lng: number };

export const fmtLat = (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "N" : "S"}`;
export const fmtLng = (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "E" : "W"}`;

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

/** พื้นที่ polygon บนทรงกลม (ตร.ม.) — สูตร spherical excess แบบเดียวกับ turf */
export function polygonArea(pts: P[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    total += rad(b.lng - a.lng) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
  }
  return Math.abs((total * R * R) / 2);
}

export function lineLength(pts: L.LatLng[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += pts[i - 1].distanceTo(pts[i]);
  return sum;
}

export function formatArea(m2: number): string {
  if (m2 < 10_000) return `${Math.round(m2)} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(1)} ha`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}

export function formatLength(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

const ccw = (a: P, b: P, c: P) => (c.lat - a.lat) * (b.lng - a.lng) > (b.lat - a.lat) * (c.lng - a.lng);
const cross = (a: P, b: P, c: P, d: P) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);

/** วงแหวน (ปิดอัตโนมัติ) มีขอบตัดกันเองไหม — PostGIS ไม่รับ polygon แบบนี้ */
export function selfIntersects(ring: P[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // ขอบที่ติดกัน
      if (cross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** ตัวเลขสรุปของ layer: Polygon = พื้นที่/จำนวนจุดยอด, Line = ความยาว/จำนวนจุด, Point = ไม่มี */
export function describeLayer(layer: L.Layer): { metric: string | null; count: string | null } {
  if (layer instanceof L.Polygon) {
    const ring = (layer.getLatLngs() as L.LatLng[][])[0] ?? [];
    return { metric: formatArea(polygonArea(ring)), count: `${ring.length} vertices` };
  }
  if (layer instanceof L.Polyline) {
    const pts = layer.getLatLngs() as L.LatLng[];
    return { metric: formatLength(lineLength(pts)), count: `${pts.length} points` };
  }
  return { metric: null, count: null };
}

/** บรรทัดสรุปใต้ชื่อในรายการ */
export function layerSummary(layer: L.Layer): string {
  if (layer instanceof L.Marker) {
    const p = layer.getLatLng();
    return `${fmtLat(p.lat)}, ${fmtLng(p.lng)}`;
  }
  const { metric, count } = describeLayer(layer);
  return [metric, count].filter(Boolean).join(" • ");
}
