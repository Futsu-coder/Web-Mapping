import { TABLE_TYPE, type DraftField } from "../lib/fieldDrafts";
import { FIELD_TYPE_LABEL, newFieldKey, type FieldType } from "../lib/layers";

/**
 * รายการหัวข้อ (เพิ่ม/ลบ/เลื่อน/ตั้งชื่อ/เลือกชนิด) — ใช้ทั้งฟอร์ม layer และฟอร์มตารางย่อย
 * เปลี่ยนชนิดของหัวข้อเดิม = ได้ key ใหม่ → ค่าเดิมของหัวข้อนั้นถูกล้าง (ค่าเก่าอาจไม่ตรงชนิดใหม่)
 */
export default function FieldListEditor({
  fields,
  onChange,
  originalKeys,
  editing,
  emptyHint,
  inputCls,
  allowTables,
  tableColumns,
  onEditTable,
}: {
  /** ให้เลือกชนิด "ตารางย่อย" ได้ (ฟอร์ม layer) */
  allowTables?: boolean;
  /** จำนวนคอลัมน์ของตารางย่อยที่มีอยู่แล้ว */
  tableColumns?: (tableId: number) => number;
  /** ตั้งค่าคอลัมน์ของตารางย่อยที่มีอยู่แล้ว */
  onEditTable?: (tableId: number) => void;
  fields: DraftField[];
  onChange: (fn: (list: DraftField[]) => DraftField[]) => void;
  /** key ของหัวข้อที่บันทึกไว้แล้ว */
  originalKeys: Set<string>;
  /** แก้ของเดิม (ไม่ใช่สร้างใหม่) → แสดงคำเตือนเรื่องค่าที่จะหาย */
  editing: boolean;
  emptyHint: string;
  inputCls: string;
}) {
  const update = (i: number, patch: Partial<DraftField>) => onChange((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  // เป็นตารางย่อย = เก็บ key เดิมไว้ (รู้ว่าแปลงจากหัวข้อไหน ค่าเดิมย้ายไปเป็นแถวแรก)
  // เป็นชนิดอื่นของหัวข้อเดิม = key ใหม่ → ค่าเดิมถูกล้าง
  const changeType = (i: number, type: DraftField["type"]) =>
    update(i, type !== TABLE_TYPE && originalKeys.has(fields[i].key) ? { type, key: newFieldKey() } : { type });
  const move = (i: number, dir: -1 | 1) =>
    onChange((list) => {
      const next = [...list];
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      return next;
    });

  return (
    <>
      {fields.length === 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg px-3 py-3 text-center">
          {emptyHint}
        </p>
      )}
      {fields.map((f, i) => (
        <div key={f.uid} className="border border-slate-200 rounded-lg p-2 space-y-2 bg-slate-50/60">
          <div className="flex items-center gap-1.5">
            <input
              value={f.label}
              maxLength={40}
              placeholder="ชื่อหัวข้อ"
              aria-label="ชื่อหัวข้อ"
              onChange={(e) => update(i, { label: e.target.value })}
              className={`${inputCls} flex-1 min-w-0`}
            />
            <select
              value={f.type}
              aria-label="ชนิดข้อมูล"
              disabled={f.tableId !== undefined}
              title={f.tableId !== undefined ? "ตารางย่อยที่บันทึกแล้วเปลี่ยนชนิดไม่ได้ (ลบได้)" : undefined}
              onChange={(e) => changeType(i, e.target.value as DraftField["type"])}
              className={`${inputCls} w-28 shrink-0 disabled:bg-slate-50 disabled:text-slate-500`}
            >
              {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </option>
              ))}
              {(allowTables || f.type === TABLE_TYPE) && <option value={TABLE_TYPE}>ตารางย่อย</option>}
            </select>
            <div className="flex shrink-0">
              <button
                type="button"
                aria-label="เลื่อนขึ้น"
                disabled={i === 0 || f.type === TABLE_TYPE}
                onClick={() => move(i, -1)}
                className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 flex"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
              </button>
              <button
                type="button"
                aria-label="เลื่อนลง"
                disabled={i === fields.length - 1 || f.type === TABLE_TYPE}
                onClick={() => move(i, 1)}
                className="p-1 rounded text-slate-500 hover:bg-slate-200 disabled:opacity-30 flex"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
              </button>
              <button
                type="button"
                aria-label="ลบหัวข้อ"
                onClick={() => onChange((list) => list.filter((_, j) => j !== i))}
                className="p-1 rounded text-slate-500 hover:bg-red-50 hover:text-red-700 flex"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>
          {f.type === "choice" && (
            <input
              value={f.options}
              placeholder="ตัวเลือก คั่นด้วย , เช่น สพฐ., อบจ., เทศบาล"
              aria-label="ตัวเลือก"
              onChange={(e) => update(i, { options: e.target.value })}
              className={`${inputCls} w-full`}
            />
          )}
          {f.type === TABLE_TYPE ? (
            f.tableId !== undefined ? (
              onEditTable && (
                <button
                  type="button"
                  onClick={() => onEditTable(f.tableId!)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-teal-700 hover:bg-teal-50"
                >
                  <span className="material-symbols-outlined text-[16px]">settings</span>
                  ตั้งค่าคอลัมน์ของตารางย่อย ({tableColumns?.(f.tableId) ?? 0} คอลัมน์)
                </button>
              )
            ) : (
              <p className="flex items-start gap-1 text-[11px] text-teal-800">
                <span className="material-symbols-outlined text-[15px]">table_rows</span>
                {originalKeys.has(f.key)
                  ? "แปลงเป็นตารางย่อย — ค่าเดิมของหัวข้อนี้ย้ายไปเป็นแถวแรกของแต่ละ feature"
                  : "ตารางย่อย (หลายแถวต่อ feature) — บันทึกแล้วเพิ่มคอลัมน์ได้ที่ ⚙ หรือในตารางย่อยของ Attribute table"}
              </p>
            )
          ) : originalKeys.has(f.key) || !editing ? null : (
            <p className="text-[11px] text-amber-700">หัวข้อใหม่ — ข้อมูลเดิมจะมีค่าว่างในหัวข้อนี้</p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const key = newFieldKey();
          onChange((list) => [...list, { uid: key, key, label: "", type: "text", options: "" }]);
        }}
        className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-teal-600 text-teal-700 text-sm font-medium hover:bg-teal-50"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        เพิ่มหัวข้อ
      </button>
      {editing && (
        <p className="text-[11px] text-slate-400">ลบหัวข้อ หรือเปลี่ยนชนิดของหัวข้อเดิม = ค่าที่กรอกไว้ในหัวข้อนั้นถูกลบ</p>
      )}
    </>
  );
}
