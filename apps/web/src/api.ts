import type { Category } from "../../shared/categories";

export type GeomType = "Point" | "LineString" | "Polygon";

/** ฟิลด์ที่ผู้ใช้กรอก — เก็บใน properties ของ GeoJSON Feature */
export type FeatureProps = { name: string; category?: Category; description?: string };

export type ApiFeature = GeoJSON.Feature<GeoJSON.Geometry, FeatureProps & { geom_type: GeomType }> & {
  id: number;
};

const BASE = "/api/features";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    // API ตอบ { detail } (404/422 ของเรา) หรือ { summary } (validation ของ Elysia)
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? body?.summary ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ขาเข้าเป็น GeoJSON Feature เสมอ
const toBody = (geometry: GeoJSON.Geometry, properties: FeatureProps) =>
  JSON.stringify({ type: "Feature", geometry, properties });

export const listFeatures = () =>
  request<GeoJSON.FeatureCollection>(BASE).then((c) => c.features as ApiFeature[]);

export const createFeature = (geometry: GeoJSON.Geometry, props: FeatureProps) =>
  request<ApiFeature>(BASE, { method: "POST", body: toBody(geometry, props) });

export const updateFeature = (id: number, geometry: GeoJSON.Geometry, props: FeatureProps) =>
  request<ApiFeature>(`${BASE}/${id}`, { method: "PUT", body: toBody(geometry, props) });

export const deleteFeature = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" });
