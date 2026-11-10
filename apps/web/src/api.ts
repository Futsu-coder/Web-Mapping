import { toStoredProps } from "./lib/featureMeta";
import type { FieldValue, FieldValues, Layer, LayerField, RelatedRecord, RelatedTable } from "./lib/layers";
import { accessToken, supabase } from "./lib/supabase";

export type GeomType = "Point" | "LineString" | "Polygon";

/**
 * ฟิลด์ที่ผู้ใช้กรอก — เก็บใน properties ของ GeoJSON Feature แบบแบน: name, description, layer_id + ค่าของแต่ละหัวข้อ (key f_xxxx)
 * layerId ไม่มี = feature ไม่อยู่ใน layer
 */
export type FeatureProps = {
  name: string;
  description?: string;
  layerId?: number;
  values?: FieldValues;
};

/** properties ตามที่เก็บจริงใน GeoJSON (แบน) — API ตอบ layer_id: null เมื่อไม่อยู่ใน layer */
export type StoredProps = Omit<FeatureProps, "layerId" | "values"> & { layer_id?: number | null; [key: string]: unknown };

/** ฟิลด์ที่ server ใส่ให้ (เจ้าของ feature) — feature ในโหมดทดลองไม่มีเจ้าของ */
export type FeatureOwner = { owner_id: string | null; owner_name: string | null };

export type ApiFeature = GeoJSON.Feature<GeoJSON.Geometry, StoredProps & FeatureOwner & { geom_type: GeomType }> & {
  id: number;
};

export type Member = { id: string; username: string; userNo: number; joinedAt: string };
export type Me = {
  user: { id: string; username: string; userNo: number };
  group: { id: number; name: string; ownerId: string };
  members: Member[];
};
export type Invitation = { id: number; groupId: number; groupName: string; inviterName: string; createdAt: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    // token หมดอายุ / บัญชีถูกลบ → ออกจากระบบ (App กลับเป็นโหมดทดลอง)
    if (res.status === 401 && token) void supabase?.auth.signOut();
    // API ตอบ { detail } (ของเรา) หรือ { summary } (validation ของ Elysia)
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? body?.summary ?? `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---------- features (ต้อง login) ----------
const BASE = "/api/features";

// ขาเข้าเป็น GeoJSON Feature เสมอ (properties แบบแบน)
const toBody = (geometry: GeoJSON.Geometry, props: FeatureProps) => ({
  type: "Feature",
  geometry,
  properties: toStoredProps(props),
});

export const listFeatures = () =>
  request<GeoJSON.FeatureCollection>(BASE).then((c) => c.features as ApiFeature[]);

export const createFeature = (geometry: GeoJSON.Geometry, props: FeatureProps) =>
  request<ApiFeature>(BASE, json("POST", toBody(geometry, props)));

/**
 * JSON Merge Patch: ส่งเฉพาะส่วนที่เปลี่ยน, null = ลบ key
 * layer_id = ย้าย layer (null = เอาออกจาก layer — ค่าของหัวข้อ layer เดิมถูกล้าง), f_xxxx = ค่าของหัวข้อ
 */
export type FeaturePatch = {
  geometry?: GeoJSON.Geometry;
  properties?: { name?: string; description?: string | null; layer_id?: number | null; [key: string]: FieldValue | null | undefined };
};

export const patchFeature = (id: number, patch: FeaturePatch) =>
  request<ApiFeature>(`${BASE}/${id}`, json("PATCH", { type: "Feature", ...patch }));

export const deleteFeature = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" });

export const getFeature = (id: number) => request<ApiFeature>(`${BASE}/${id}`);

// ---------- layer / ตารางย่อย / แถว (ต้อง login; สร้าง/แก้โครงสร้างได้เฉพาะเจ้าของ group) ----------
type ApiTable = Omit<RelatedTable, "countKey"> & { countKey: string | null };
// API ตอบ count_key = null เมื่อนับจำนวนแถว → ในเว็บใช้ undefined
const fromApiTable = ({ countKey, ...t }: ApiTable): RelatedTable => (countKey ? { ...t, countKey } : t);
type LayerBody = { name?: string; color?: string; fields?: LayerField[] };
type TableBody = { name?: string; fields?: LayerField[]; countKey?: string | null };

export const layerApi = {
  /** layer + ตารางย่อยทั้งหมดของ group */
  list: () =>
    request<{ layers: Layer[]; tables: ApiTable[] }>("/api/layers").then((d) => ({
      layers: d.layers,
      tables: d.tables.map(fromApiTable),
    })),
  create: (body: Omit<Layer, "id">) => request<Layer>("/api/layers", json("POST", body)),
  patch: (id: number, body: LayerBody) => request<Layer>(`/api/layers/${id}`, json("PATCH", body)),
  /** feature ใน layer ไม่ถูกลบ — กลายเป็น "ไม่มี layer" */
  remove: (id: number) => request<void>(`/api/layers/${id}`, { method: "DELETE" }),
  /** ย้ายหัวข้อไปเป็นตารางย่อย (ค่าเดิมกลายเป็นแถวแรกของแต่ละ feature) */
  fieldToTable: (layerId: number, key: string, name?: string) =>
    request<ApiTable>(`/api/layers/${layerId}/fields/${key}/to-table`, json("POST", { name })).then(fromApiTable),

  createTable: (body: TableBody & { layerId: number; name: string }) =>
    request<ApiTable>("/api/related-tables", json("POST", body)).then(fromApiTable),
  patchTable: (id: number, body: TableBody) =>
    request<ApiTable>(`/api/related-tables/${id}`, json("PATCH", body)).then(fromApiTable),
  removeTable: (id: number) => request<void>(`/api/related-tables/${id}`, { method: "DELETE" }),

  listRecords: () => request<RelatedRecord[]>("/api/related-records"),
  createRecord: (body: { tableId: number; featureId: number; values: FieldValues }) =>
    request<RelatedRecord>("/api/related-records", json("POST", body)),
  /** แทนค่าทั้งแถว */
  patchRecord: (id: number, values: FieldValues) =>
    request<RelatedRecord>(`/api/related-records/${id}`, json("PATCH", { values })),
  removeRecord: (id: number) => request<void>(`/api/related-records/${id}`, { method: "DELETE" }),
};

// ---------- บัญชี / group / คำเชิญ ----------
export const signup = (username: string, password: string) =>
  request<{ username: string }>("/api/auth/signup", json("POST", { username, password }));

export const getMe = () => request<Me>("/api/me");

export const renameGroup = (name: string) => request<Me["group"]>("/api/group", json("PATCH", { name }));

export const leaveGroup = () => request<void>("/api/group/leave", { method: "POST" });

/** target = UserID (#1024 / 1024) หรือ username */
export const invite = (target: string) =>
  request<{ username: string; userNo: number }>("/api/invitations", json("POST", { target }));

export const listInvitations = () => request<Invitation[]>("/api/invitations");

export const answerInvitation = (id: number, action: "accept" | "reject") =>
  request<void>(`/api/invitations/${id}/${action}`, { method: "POST" });

// ---------- การแจ้งเตือน (กระดิ่ง) ----------
export type NotificationKind = "invitation" | "member";
export type AppNotification = {
  id: number;
  kind: NotificationKind;
  /** invitation: invited/accepted/rejected · member: joined/left/owner */
  action: string;
  actorName: string;
  subject: string;
  refId: number | null;
  readAt: string | null;
  createdAt: string;
};

export const listNotifications = () =>
  request<{ items: AppNotification[]; unread: number }>("/api/notifications?limit=100");

export const markNotificationsRead = () => request<void>("/api/notifications/read", { method: "POST" });

export const clearNotifications = () => request<void>("/api/notifications", { method: "DELETE" });
