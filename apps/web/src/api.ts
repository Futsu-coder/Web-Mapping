import type { Category } from "../../shared/categories";
import { accessToken, supabase } from "./lib/supabase";

export type GeomType = "Point" | "LineString" | "Polygon";

/** ฟิลด์ที่ผู้ใช้กรอก — เก็บใน properties ของ GeoJSON Feature */
export type FeatureProps = { name: string; category?: Category; description?: string };

/** ฟิลด์ที่ server ใส่ให้ (เจ้าของ feature) — feature ในโหมดทดลองไม่มีเจ้าของ */
export type FeatureOwner = { owner_id: string | null; owner_name: string | null };

export type ApiFeature = GeoJSON.Feature<GeoJSON.Geometry, FeatureProps & FeatureOwner & { geom_type: GeomType }> & {
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

// ขาเข้าเป็น GeoJSON Feature เสมอ
const toBody = (geometry: GeoJSON.Geometry, properties: FeatureProps) => ({ type: "Feature", geometry, properties });

export const listFeatures = () =>
  request<GeoJSON.FeatureCollection>(BASE).then((c) => c.features as ApiFeature[]);

export const createFeature = (geometry: GeoJSON.Geometry, props: FeatureProps) =>
  request<ApiFeature>(BASE, json("POST", toBody(geometry, props)));

/** JSON Merge Patch: ส่งเฉพาะส่วนที่เปลี่ยน, null = ลบ key */
export type FeaturePatch = {
  geometry?: GeoJSON.Geometry;
  properties?: { name?: string; category?: Category | null; description?: string | null };
};

export const patchFeature = (id: number, patch: FeaturePatch) =>
  request<ApiFeature>(`${BASE}/${id}`, json("PATCH", { type: "Feature", ...patch }));

export const deleteFeature = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" });

export const getFeature = (id: number) => request<ApiFeature>(`${BASE}/${id}`);

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
