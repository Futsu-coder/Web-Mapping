// จุดเป็น [lng, lat] ตามรูปแบบ GeoJSON
type Pos = GeoJSON.Position;

export const fmtLat = (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "N" : "S"}`;
export const fmtLng = (v: number) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "E" : "W"}`;

const R = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

/** วงแหวนแบบ GeoJSON ปิดด้วยจุดแรกซ้ำ → ตัดจุดท้ายออก */
const openRing = (ring: Pos[]) => {
  const n = ring.length;
  return n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1] ? ring.slice(0, -1) : ring;
};

/** พื้นที่ polygon บนทรงกลม (ตร.ม.) — สูตร spherical excess แบบเดียวกับ turf */
export function polygonArea(ring: Pos[]): number {
  const pts = openRing(ring);
  const n = pts.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [aLng, aLat] = pts[i];
    const [bLng, bLat] = pts[(i + 1) % n];
    total += rad(bLng - aLng) * (2 + Math.sin(rad(aLat)) + Math.sin(rad(bLat)));
  }
  return Math.abs((total * R * R) / 2);
}

/** ระยะทางบนทรงกลม (เมตร) — haversine */
export function distance(a: Pos, b: Pos): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(pts: Pos[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += distance(pts[i - 1], pts[i]);
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

const ccw = (a: Pos, b: Pos, c: Pos) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
const cross = (a: Pos, b: Pos, c: Pos, d: Pos) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);

/** วงแหวน (ปิดอัตโนมัติ) มีขอบตัดกันเองไหม — PostGIS ไม่รับ polygon แบบนี้ */
export function selfIntersects(ring: Pos[]): boolean {
  const pts = openRing(ring);
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // ขอบที่ติดกัน
      if (cross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** ตัวเลขสรุปของรูปทรง: Polygon = พื้นที่/จำนวนจุดยอด, Line = ความยาว/จำนวนจุด, Point = ไม่มี */
export function describeGeometry(g: GeoJSON.Geometry): { metric: string | null; count: string | null } {
  if (g.type === "Polygon") {
    const ring = openRing(g.coordinates[0] ?? []);
    return { metric: formatArea(polygonArea(ring)), count: `${ring.length} vertices` };
  }
  if (g.type === "LineString") {
    return { metric: formatLength(lineLength(g.coordinates)), count: `${g.coordinates.length} points` };
  }
  return { metric: null, count: null };
}

/** บรรทัดสรุปใต้ชื่อในรายการ */
export function geometrySummary(g: GeoJSON.Geometry): string {
  if (g.type === "Point") return `${fmtLat(g.coordinates[1])}, ${fmtLng(g.coordinates[0])}`;
  const { metric, count } = describeGeometry(g);
  return [metric, count].filter(Boolean).join(" • ");
}
