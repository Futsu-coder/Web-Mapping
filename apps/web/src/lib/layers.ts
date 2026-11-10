import type { GeomType } from "../api";
import type { FieldType, FieldValue, FieldValues, LayerField } from "../../../shared/layers";

// ระบบ Layer: layer = กลุ่ม feature ชนิดเดียวกัน (เช่น โรงเรียน / แม่น้ำ): รูปทรงชนิดเดียว + สีเดียว + หัวข้อ property ชุดเดียวกัน
// login = เก็บใน database ผ่าน API (layerApi), โหมดทดลอง = localStorage (guestStore) — รูปแบบข้อมูลเดียวกัน
// type ของหัวข้อ + การตรวจค่าใช้ร่วมกับ server (apps/shared/layers.ts)

export type { FieldType, FieldValue, FieldValues, LayerField };

export type Layer = { id: number; name: string; geomType: GeomType; color: string; fields: LayerField[] };

/** id ของแท็บ "ไม่มี layer" ใน attribute table (id จริงของ layer: database > 0, โหมดทดลอง < 0) */
export const NO_LAYER_ID = 0;

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "ข้อความ",
  number: "ตัวเลข",
  choice: "ตัวเลือก",
  boolean: "ใช่/ไม่ใช่",
};

export const GEOM_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

// สีที่เลือกได้ (เข้มพอให้เห็นบนแผนที่ฐานสีอ่อน และไม่ซ้ำกับสีส้มของ hover)
export const LAYER_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#475569"];

export const newFieldKey = () => `f_${crypto.randomUUID().slice(0, 8)}`;

/** ค่าที่แสดงในตาราง / โหมดดู — ไม่มีค่า = "" */
export function formatValue(field: LayerField, v: FieldValue | undefined): string {
  if (v === undefined || v === "") return "";
  if (field.type === "boolean") return v ? "ใช่" : "ไม่ใช่";
  if (field.type === "number" && typeof v === "number") return v.toLocaleString("th-TH");
  return String(v);
}

/** ข้อความแจ้งเตือนเมื่อกรอกผิด (ใช้ร่วมกันทุกฟอร์ม/ตาราง) */
export const badNumberMessage = (label: string) => `"${label}" ต้องเป็นตัวเลข — แก้ให้ถูกก่อนบันทึก`;
export const EMPTY_ROW_MESSAGE = "แถวนี้ยังว่างอยู่ — กรอกอย่างน้อย 1 ช่องก่อนบันทึก";
/**
 * หาช่องตัวเลขที่พิมพ์ไม่เป็นตัวเลขใน root (คืนชื่อหัวข้อจาก aria-label) — null = ไม่มี
 * ต้องตรวจจาก DOM ตอนบันทึก: input type=number ให้ค่า "" ทั้งตอนว่างและตอนพิมพ์ผิด และ React ไม่ยิง onChange
 * ถ้าค่ายังเป็น "" เหมือนเดิม (เช่น พิมพ์ "-" ตัวแรก) จึงรู้ผ่าน onChange ไม่ได้ทุกกรณี
 */
export function badInputLabel(root: Element | null): string | null {
  const el = root && [...root.querySelectorAll("input")].find((i) => i.validity.badInput);
  return el ? (el.getAttribute("aria-label") ?? "") : null;
}

export const NO_COLUMN_MESSAGE = "ตารางนี้ยังไม่มีคอลัมน์ — เพิ่มคอลัมน์ก่อนแล้วจึงเพิ่มแถวได้";

/** เก็บเฉพาะค่าของหัวข้อที่ layer มี (ลบหัวข้อไปแล้ว = ค่าหายตาม) */
export function pickValues(values: FieldValues | undefined, fields: LayerField[]): FieldValues | undefined {
  if (!values) return undefined;
  const out: FieldValues = {};
  for (const f of fields) if (values[f.key] !== undefined) out[f.key] = values[f.key];
  return Object.keys(out).length ? out : undefined;
}

/**
 * ตารางย่อย (related table) ของ layer — 1 feature มีได้หลายแถว เช่น "ปลาที่พบ" ในแม่น้ำ
 * countKey = คอลัมน์สรุปใน attribute table นับ "ค่าไม่ซ้ำ" ของหัวข้อนี้ (ไม่ตั้ง = นับจำนวนแถว)
 */
export type RelatedTable = { id: number; layerId: number; name: string; fields: LayerField[]; countKey?: string };

/**
 * 1 แถวในตารางย่อย — ผูกกับ feature ด้วย featureId
 * createdAt = วันเวลาที่เพิ่มแถว (ISO, ระบบใส่ให้ แก้ไม่ได้) — ใช้แยกข้อมูลแต่ละรอบสำรวจ/แต่ละเดือนในตารางเดียว
 * (แถวที่สร้างก่อนมีฟิลด์นี้ = ไม่มีค่า)
 */
export type RelatedRecord = { id: number; tableId: number; featureId: number; values: FieldValues; createdAt?: string };
/** แถวที่กำลังบันทึก (id ไม่มี = แถวใหม่) */
export type RecordDraft = Omit<RelatedRecord, "id"> & { id?: number };

/** วันที่แบบไทยสั้นๆ เช่น "10 พ.ย. 2569" */
export const formatDate = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "";

/** เดือนของวันที่ (เวลาท้องถิ่น) เป็น "YYYY-MM" — ใช้กรองตามเดือน */
export const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** "2026-11" → "พ.ย. 2569" */
export const formatMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short", year: "numeric" });
};

/** ค่าสรุปของตารางย่อยต่อ 1 feature (จำนวนแถว หรือจำนวนค่าไม่ซ้ำของ countKey) */
export function summarize(table: RelatedTable, records: RelatedRecord[], featureId: number): number {
  const rows = records.filter((r) => r.tableId === table.id && r.featureId === featureId);
  if (!table.countKey) return rows.length;
  return new Set(rows.map((r) => r.values[table.countKey!]).filter((v) => v !== undefined && v !== "")).size;
}
