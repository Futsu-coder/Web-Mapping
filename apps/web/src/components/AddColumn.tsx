import { useState } from "react";
import { FIELD_TYPE_LABEL, newFieldKey, type FieldType, type LayerField } from "../lib/layers";
import { PlusIcon } from "lucide-react";

// ชนิดพิเศษในกล่องเพิ่มคอลัมน์: สร้างตารางย่อยแทนหัวข้อ
const TABLE = "__table";

/**
 * ปุ่ม + ท้ายหัวตาราง: เพิ่มคอลัมน์ (= หัวข้อใหม่) โดยไม่ต้องเปิดหน้าตั้งค่า
 * onAddTable มี = เลือกชนิด "ตารางย่อย" ได้ (ตารางหลัก: 1 feature มีได้หลายแถว)
 */
export default function AddColumn({
  taken,
  onAdd,
  onAddTable,
  text,
}: {
  /** ข้อความข้างไอคอน + (ไม่ใส่ = ปุ่มไอคอนอย่างเดียว) */
  text?: string;
  /** ชื่อที่ใช้ไม่ได้ (คอลัมน์ที่มีอยู่แล้ว) */
  taken: string[];
  onAdd: (field: LayerField) => void;
  onAddTable?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType | typeof TABLE>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setLabel("");
    setType("text");
    setOptions("");
    setError(null);
  };

  const submit = () => {
    const name = label.trim();
    if (!name) return setError("ใส่ชื่อคอลัมน์");
    if (taken.some((l) => l.toLowerCase() === name.toLowerCase())) return setError(`มีคอลัมน์ "${name}" แล้ว`);
    if (type === TABLE) {
      onAddTable?.(name);
      return close();
    }
    const field: LayerField = { key: newFieldKey(), label: name, type };
    if (type === "choice") {
      const list = [...new Set(options.split(",").map((o) => o.trim()).filter(Boolean))];
      if (!list.length) return setError("ใส่ตัวเลือกอย่างน้อย 1 ค่า");
      field.options = list;
    }
    onAdd(field);
    close();
  };

  const inputCls =
    "w-full px-2 py-1 bg-white border border-slate-300 rounded-md text-base md:text-sm font-normal text-slate-900 focus:outline-none focus:border-teal-700";

  return (
    <div className="relative inline-block align-middle">
      <button
        type="button"
        title="เพิ่มคอลัมน์"
        aria-label="เพิ่มคอลัมน์"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={`p-0.5 rounded flex items-center gap-0.5 ${text ? "px-1.5 text-xs font-medium" : ""} ${
          open ? "bg-teal-700 text-white" : "text-teal-700 hover:bg-teal-50"
        }`}
      >
        <PlusIcon className="size-[18px] shrink-0" />
        {text}
      </button>
      {open && (
        // ไม่ใช้ <form>: ปุ่มนี้อยู่ในฟอร์มของ feature ได้ (ตารางย่อยในฟอร์มรายละเอียด) — form ซ้อน form ทำให้ browser ส่งฟอร์มจริง
        <div
          role="group"
          aria-label="กล่องเพิ่มคอลัมน์"
          onKeyDown={(e) => {
            // Enter = เพิ่ม (กันไม่ให้ไปส่งฟอร์ม feature ที่ครอบอยู่) / Esc = ปิด
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") close();
          }}
          className="absolute left-0 top-full mt-1 z-20 w-60 p-2.5 space-y-2 bg-white border border-slate-200 rounded-lg shadow-lg text-left"
        >
          <input
            autoFocus
            value={label}
            maxLength={40}
            placeholder="ชื่อคอลัมน์ เช่น จำนวนเตียง"
            aria-label="ชื่อคอลัมน์"
            onChange={(e) => setLabel(e.target.value)}
            className={inputCls}
          />
          <select
            value={type}
            aria-label="ชนิดข้อมูล"
            onChange={(e) => setType(e.target.value as FieldType | typeof TABLE)}
            className={inputCls}
          >
            {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            ))}
            {onAddTable && <option value={TABLE}>ตารางย่อย (หลายแถวต่อ feature)</option>}
          </select>
          {type === TABLE && (
            <p className="text-[11px] font-normal text-slate-500 leading-snug">
              เช่น "ปลาที่พบ" — ได้คอลัมน์สรุปที่นับให้เอง คลิกตัวเลขเพื่อเปิดตารางย่อยแล้วเพิ่มคอลัมน์ต่อได้
            </p>
          )}
          {type === "choice" && (
            <input
              value={options}
              placeholder="ตัวเลือก คั่นด้วย ,"
              aria-label="ตัวเลือก"
              onChange={(e) => setOptions(e.target.value)}
              className={inputCls}
            />
          )}
          {error && <p className="text-[11px] font-normal text-red-700">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={close} className="px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button type="button" onClick={submit} className="px-2.5 py-1 rounded-md text-xs font-medium bg-teal-700 text-white hover:bg-teal-800">
              เพิ่ม
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
