// โหมดทดลอง (ยังไม่ login): เก็บ feature ไว้ใน localStorage ของเบราว์เซอร์นี้ — refresh แล้วยังอยู่
// ลบทิ้งทั้งชุดเมื่อครบ 1 ชั่วโมงนับจาก feature ชิ้นแรก (แก้ไขไม่ได้ต่อเวลา จะได้บอกเวลาลบที่แน่นอนได้)
import type { ApiFeature } from "../api";

export const GUEST_TTL_MS = 60 * 60 * 1000;
const KEY = "webmap:guest";

type Stored = { createdAt: number; nextId: number; features: ApiFeature[] };

// id ติดลบ (ไม่ชนกับ id จริงจาก database) — สำรองไว้ในหน่วยความจำเผื่อ storage ใช้ไม่ได้
let memNextId = -1;

const write = (s: Stored | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // private mode / storage เต็ม → ข้ามได้ (ข้อมูลอยู่แค่ในหน้านี้เหมือนเดิม)
  }
};

/** ข้อมูลที่ยังไม่หมดอายุ — หมดอายุแล้วลบทิ้งให้เลย */
function read(): Stored | null {
  let s: Stored | null;
  try {
    const raw = localStorage.getItem(KEY);
    s = raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
  if (!s || !Array.isArray(s.features) || !Number.isFinite(s.createdAt)) return null;
  if (Date.now() >= s.createdAt + GUEST_TTL_MS) {
    write(null);
    return null;
  }
  return s;
}

export const loadGuest = (): ApiFeature[] => read()?.features ?? [];

/** เวลาที่จะถูกลบ (ms) — ไม่มีข้อมูล = null */
export function guestExpiresAt(): number | null {
  const s = read();
  return s ? s.createdAt + GUEST_TTL_MS : null;
}

export function nextGuestId(): number {
  const id = Math.min(read()?.nextId ?? -1, memNextId);
  memNextId = id - 1;
  return id;
}

/** เพิ่ม/แทนที่ feature (ตาม id) */
export function upsertGuest(f: ApiFeature) {
  const s = read();
  const features = (s?.features ?? []).filter((x) => x.id !== f.id);
  features.push(f);
  write({ createdAt: s?.createdAt ?? Date.now(), nextId: Math.min(s?.nextId ?? -1, f.id - 1), features });
}

/** ลบ feature — ลบชิ้นสุดท้ายแล้วล้างทั้งชุด (วาดใหม่ = เริ่มนับ 1 ชั่วโมงใหม่) */
export function removeGuest(id: number) {
  const s = read();
  if (!s) return;
  const features = s.features.filter((x) => x.id !== id);
  write(features.length ? { ...s, features } : null);
}

export const clearGuest = () => write(null);
