export type GeomType = "Point" | "LineString" | "Polygon";

export type ApiFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string; geom_type: GeomType }> & {
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

const toBody = (geometry: GeoJSON.Geometry, name: string) =>
  JSON.stringify({ type: "Feature", geometry, properties: { name } });

export const listFeatures = () =>
  request<GeoJSON.FeatureCollection>(BASE).then((c) => c.features as ApiFeature[]);

export const createFeature = (geometry: GeoJSON.Geometry, name: string) =>
  request<ApiFeature>(BASE, { method: "POST", body: toBody(geometry, name) });

export const updateFeature = (id: number, geometry: GeoJSON.Geometry, name: string) =>
  request<ApiFeature>(`${BASE}/${id}`, { method: "PUT", body: toBody(geometry, name) });

export const deleteFeature = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" });
