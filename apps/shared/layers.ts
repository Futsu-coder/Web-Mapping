// ระบบ Layer ที่ใช้ร่วมกันทั้ง server (ตรวจค่าก่อนบันทึก) และ web (ฟอร์ม/ตาราง)
// layer = กลุ่ม feature ชนิดเดียวกัน: รูปทรงชนิดเดียว + หัวข้อ property ชุดเดียวกัน (เก็บใน layers.fields เป็น jsonb)

export type FieldType = "text" | "number" | "choice" | "boolean";

/** หัวข้อ property — key สุ่มให้และไม่เปลี่ยน (เปลี่ยน label ได้โดยค่าที่กรอกไว้ไม่หาย) */
export type LayerField = { key: string; label: string; type: FieldType; options?: string[] };

export type FieldValue = string | number | boolean;
export type FieldValues = Record<string, FieldValue>;

export const FIELD_TYPES: FieldType[] = ["text", "number", "choice", "boolean"];

/** key ของหัวข้อ: f_ + ตัวอักษร/ตัวเลข (กันชนกับ key ของระบบ เช่น name, layer_id) */
export const FIELD_KEY_PATTERN = "^f_[a-z0-9]{1,32}$";

export const TEXT_MAX = 500;

/**
 * ตรวจค่าตามหัวข้อ: number ต้องเป็นตัวเลข, choice ต้องอยู่ใน options, boolean ต้องเป็น true/false, ข้อความไม่เกิน TEXT_MAX
 * key ที่ไม่มีในหัวข้อถูกตัดทิ้ง, ค่าว่าง ("" / null / undefined) = ไม่มีค่า
 * คืน { values } เมื่อผ่าน หรือ { error } เป็นข้อความภาษาไทย
 */
export function checkValues(
  fields: LayerField[],
  input: Record<string, unknown>,
): { values: FieldValues; error?: undefined } | { error: string; values?: undefined } {
  const values: FieldValues = {};
  for (const f of fields) {
    const v = input[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (f.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { error: `"${f.label}" ต้องเป็นตัวเลข` };
    } else if (f.type === "boolean") {
      if (typeof v !== "boolean") return { error: `"${f.label}" ต้องเป็น ใช่/ไม่ใช่` };
    } else if (typeof v !== "string") {
      return { error: `"${f.label}" ต้องเป็นข้อความ` };
    } else if (f.type === "choice" && !(f.options ?? []).includes(v)) {
      return { error: `"${f.label}" ต้องเป็นค่าในตัวเลือก (${(f.options ?? []).join(", ")})` };
    } else if (v.length > TEXT_MAX) {
      return { error: `"${f.label}" ยาวเกิน ${TEXT_MAX} ตัวอักษร` };
    }
    values[f.key] = v;
  }
  return { values };
}

/**
 * ตรวจรายการหัวข้อ (ตอนสร้าง/แก้ layer หรือตารางย่อย): key ถูกรูปแบบและไม่ซ้ำ, ชื่อไม่ว่างและไม่ซ้ำ, choice มีตัวเลือก
 * reserved = ชื่อที่ใช้ไม่ได้ (เช่น "ชื่อ", "คำอธิบาย" ของ feature)
 */
export function checkFields(fields: LayerField[], reserved: string[] = []): string | null {
  const keys = new Set<string>();
  const labels = new Set(reserved.map((r) => r.toLowerCase()));
  const keyPattern = new RegExp(FIELD_KEY_PATTERN);
  for (const f of fields) {
    if (!keyPattern.test(f.key)) return `key ของหัวข้อไม่ถูกต้อง: ${f.key}`;
    if (keys.has(f.key)) return `key ของหัวข้อซ้ำ: ${f.key}`;
    keys.add(f.key);
    const label = f.label.trim().toLowerCase();
    if (!label) return "ชื่อหัวข้อต้องไม่ว่าง";
    if (labels.has(label)) return `ชื่อหัวข้อซ้ำ: ${f.label}`;
    labels.add(label);
    if (!FIELD_TYPES.includes(f.type)) return `ชนิดหัวข้อไม่ถูกต้อง: ${f.type}`;
    if (f.type === "choice" && !f.options?.length) return `"${f.label}" ต้องมีตัวเลือกอย่างน้อย 1 ค่า`;
  }
  return null;
}
