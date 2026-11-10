import type { FieldType, LayerField, RelatedTable } from "./layers";

// หัวข้อระหว่างแก้ในฟอร์ม layer / ตารางย่อย (ใช้กับ components/FieldListEditor)

/** ชนิดพิเศษในรายการหัวข้อของ layer: แถวนี้คือตารางย่อย (หลายแถวต่อ feature) ไม่ใช่หัวข้อ */
export const TABLE_TYPE = "table";

/**
 * หัวข้อระหว่างแก้ในฟอร์ม — options เป็นข้อความคั่นด้วย , (แปลงเป็น array ตอนบันทึก), uid = key ของแถวใน React (key จริงเปลี่ยนได้)
 * type = TABLE_TYPE → แถวตารางย่อย: tableId = ตารางที่มีอยู่แล้ว, ไม่มี tableId แต่ key เป็นหัวข้อเดิม = แปลงหัวข้อนั้นเป็นตารางย่อย
 */
export type DraftField = {
  uid: string;
  key: string;
  label: string;
  type: FieldType | typeof TABLE_TYPE;
  options: string;
  tableId?: number;
};

/** ตารางย่อยที่มีอยู่ → แถวชนิดตารางย่อยในรายการหัวข้อ */
export const tableDrafts = (tables: RelatedTable[]): DraftField[] =>
  tables.map((t) => ({ uid: `t${t.id}`, key: `t${t.id}`, label: t.name, type: TABLE_TYPE, options: "", tableId: t.id }));

export const toDrafts = (fields: LayerField[] | undefined): DraftField[] =>
  fields?.map((f) => ({ ...f, uid: f.key, options: f.options?.join(", ") ?? "" })) ?? [];

const splitOptions = (s: string) => [...new Set(s.split(",").map((o) => o.trim()).filter(Boolean))];

/** แปลงหัวข้อในฟอร์มกลับเป็น LayerField — ไม่ผ่าน = คืนข้อความ error */
export function parseDrafts(rows: DraftField[], reserved: string[] = []): LayerField[] | string {
  // ตรวจชื่อว่าง/ซ้ำรวมทุกแถว (ทั้งหัวข้อและตารางย่อย) — แถวตารางย่อยไม่ใช่หัวข้อของ layer จึงตัดออกจากผลลัพธ์
  const all = rows.map((f) => f.label.trim());
  if (all.some((l) => !l)) return "ใส่ชื่อหัวข้อให้ครบทุกช่อง";
  if (new Set(all.map((l) => l.toLowerCase())).size !== all.length) return "ชื่อหัวข้อซ้ำกัน";
  const clash = all.find((l) => reserved.some((r) => r.toLowerCase() === l.toLowerCase()));
  if (clash) return `ใช้ชื่อหัวข้อ "${clash}" ไม่ได้ (มีอยู่แล้ว)`;
  const fields = rows.filter((f) => f.type !== TABLE_TYPE) as (DraftField & { type: FieldType })[];
  const labels = fields.map((f) => f.label.trim());
  const out: LayerField[] = [];
  for (const [i, f] of fields.entries()) {
    const field: LayerField = { key: f.key, label: labels[i], type: f.type };
    if (f.type === "choice") {
      const options = splitOptions(f.options);
      if (!options.length) return `ใส่ตัวเลือกของ "${labels[i]}" อย่างน้อย 1 ค่า`;
      field.options = options;
    }
    out.push(field);
  }
  return out;
}
