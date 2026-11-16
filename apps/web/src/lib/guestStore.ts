// โหมดทดลอง (ยังไม่ login): เก็บ feature และ layer ไว้ใน localStorage ของเบราว์เซอร์นี้ — refresh แล้วยังอยู่
// ลบทิ้งทั้งชุดเมื่อครบ 1 ชั่วโมงนับจากสิ่งแรกที่สร้าง (แก้ไขไม่ได้ต่อเวลา จะได้บอกเวลาลบที่แน่นอนได้)
import type { ApiFeature } from "../api";
import type { Layer, RelatedRecord, RelatedTable } from "./layers";

export const GUEST_TTL_MS = 60 * 60 * 1000;
/** key ใน localStorage — App ฟัง event `storage` ของ key นี้เพื่อซิงก์ระหว่างแถบ */
export const GUEST_KEY = "webmap:guest";
const KEY = GUEST_KEY;

// layers: ข้อมูลที่บันทึกก่อนมีระบบ layer ไม่มี key นี้ → อ่านเป็น []
// tables / records = ตารางย่อยของ layer และแถวข้อมูลของตารางย่อย
type Stored = {
  createdAt: number;
  nextId: number;
  features: ApiFeature[];
  layers?: Layer[];
  tables?: RelatedTable[];
  records?: RelatedRecord[];
};

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
export const loadGuestLayers = (): Layer[] => read()?.layers ?? [];
export const loadGuestTables = (): RelatedTable[] => read()?.tables ?? [];
export const loadGuestRecords = (): RelatedRecord[] => read()?.records ?? [];

/** เขียนกลับ — ไม่เหลือทั้ง feature และ layer = ล้างทั้งชุด (สร้างใหม่ = เริ่มนับ 1 ชั่วโมงใหม่) */
const save = (s: Stored) => write(s.features.length || s.layers?.length ? s : null);

/** ชุดข้อมูลปัจจุบัน หรือชุดใหม่ (เริ่มนับเวลาตอนนี้) */
const current = (): Stored => read() ?? { createdAt: Date.now(), nextId: -1, features: [], layers: [] };

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
  const s = current();
  const features = s.features.filter((x) => x.id !== f.id);
  features.push(f);
  save({ ...s, nextId: Math.min(s.nextId, f.id - 1), features });
}

/** ลบ feature พร้อมแถวในตารางย่อยของ feature นั้น */
export function removeGuest(id: number) {
  const s = read();
  if (s) save({ ...s, features: s.features.filter((x) => x.id !== id), records: s.records?.filter((r) => r.featureId !== id) });
}

/** เพิ่ม/แทนที่ layer — หัวข้อที่ถูกลบออก (หรือเปลี่ยนชนิดจน key เปลี่ยน) ค่าใน feature ของ layer นี้ถูกลบตาม */
export function upsertGuestLayer(layer: Layer) {
  const s = current();
  const old = s.layers?.find((l) => l.id === layer.id);
  const keep = new Set(layer.fields.map((f) => f.key));
  const dropped = (old?.fields ?? []).map((f) => f.key).filter((k) => !keep.has(k));
  const features = dropped.length
    ? s.features.map((f) => {
        if (f.properties.layer_id !== layer.id) return f;
        const properties = { ...f.properties };
        for (const k of dropped) delete properties[k];
        return { ...f, properties };
      })
    : s.features;
  const layers = (s.layers ?? []).filter((l) => l.id !== layer.id);
  layers.push(layer);
  save({ ...s, nextId: Math.min(s.nextId, layer.id - 1), features, layers });
}

/**
 * ลบ layer — feature ใน layer ถูกลบด้วย เหมือนฝั่ง API
 * ตารางย่อยของ layer + แถวของตารางเหล่านั้น + แถวของ feature ที่ถูกลบ
 */
export function removeGuestLayer(id: number) {
  const s = read();
  if (!s) return;
  const tableIds = new Set(s.tables?.filter((t) => t.layerId === id).map((t) => t.id));
  const goneFeatures = new Set(s.features.filter((f) => f.properties.layer_id === id).map((f) => f.id));
  save({
    ...s,
    layers: (s.layers ?? []).filter((l) => l.id !== id),
    features: s.features.filter((f) => !goneFeatures.has(f.id)),
    tables: s.tables?.filter((t) => !tableIds.has(t.id)),
    records: s.records?.filter((r) => !tableIds.has(r.tableId) && !goneFeatures.has(r.featureId)),
  });
}

/** เพิ่ม/แทนที่ตารางย่อย — หัวข้อที่ถูกลบ (หรือเปลี่ยนชนิดจน key เปลี่ยน) ค่าในแถวของตารางนี้ถูกลบตาม */
export function upsertGuestTable(table: RelatedTable) {
  const s = current();
  const keep = new Set(table.fields.map((f) => f.key));
  const records = s.records?.map((r) => {
    if (r.tableId !== table.id || Object.keys(r.values).every((k) => keep.has(k))) return r;
    return { ...r, values: Object.fromEntries(Object.entries(r.values).filter(([k]) => keep.has(k))) };
  });
  const tables = (s.tables ?? []).filter((t) => t.id !== table.id);
  tables.push(table);
  save({ ...s, nextId: Math.min(s.nextId, table.id - 1), tables, records });
}

export function removeGuestTable(id: number) {
  const s = read();
  if (s) save({ ...s, tables: s.tables?.filter((t) => t.id !== id), records: s.records?.filter((r) => r.tableId !== id) });
}

/** เพิ่ม/แทนที่แถวในตารางย่อย */
export function upsertGuestRecord(record: RelatedRecord) {
  const s = current();
  const records = (s.records ?? []).filter((r) => r.id !== record.id);
  records.push(record);
  save({ ...s, nextId: Math.min(s.nextId, record.id - 1), records });
}

export function removeGuestRecord(id: number) {
  const s = read();
  if (s) save({ ...s, records: s.records?.filter((r) => r.id !== id) });
}

export const clearGuest = () => write(null);
