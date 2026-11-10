import { useEffect, useRef, useState } from "react";
import type { Layer, RelatedTable } from "../lib/layers";
import { parseDrafts, toDrafts, type DraftField } from "../lib/fieldDrafts";
import FieldListEditor from "./FieldListEditor";
import { SaveIcon, Trash2Icon, XIcon } from "lucide-react";

export type RelatedTableDraft = Omit<RelatedTable, "id"> & { id?: number };

/**
 * ฟอร์มสร้าง/แก้ตารางย่อยของ layer: ชื่อ, หัวข้อ, และวิธีนับค่าสรุปที่แสดงใน attribute table
 * (เปิดซ้อนบนฟอร์ม layer ได้ — Esc ปิดเฉพาะอันบนสุด)
 */
export default function RelatedTableDialog({
  layer,
  table,
  takenNames,
  recordCount,
  onSave,
  onDelete,
  onClose,
}: {
  layer: Layer;
  /** null = สร้างใหม่ */
  table: RelatedTable | null;
  /** ชื่อตารางย่อยอื่นใน layer นี้ (ห้ามซ้ำ) */
  takenNames: string[];
  /** จำนวนแถวในตารางนี้ (แสดงตอนยืนยันลบ) */
  recordCount: number;
  onSave: (table: RelatedTableDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(table?.name ?? "");
  const [fields, setFields] = useState<DraftField[]>(() => toDrafts(table?.fields));
  const [countKey, setCountKey] = useState(table?.countKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const downOnBackdrop = useRef(false);
  const originalKeys = new Set(table?.fields.map((f) => f.key));

  useEffect(() => {
    // capture + หยุดต่อ → ฟอร์ม layer ที่อยู่ข้างใต้ไม่ปิดตาม
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // หัวข้อที่เลือกให้นับถูกลบ/เปลี่ยน key ไปแล้ว → กลับไปนับจำนวนแถว
  const countField = fields.find((f) => f.key === countKey);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อตาราง");
    if (takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return setError(`มีตารางชื่อ "${trimmed}" แล้ว`);
    const out = parseDrafts(fields);
    if (typeof out === "string") return setError(out);
    onSave({ id: table?.id, layerId: layer.id, name: trimmed, fields: out, countKey: countField ? countKey : undefined });
  };

  const inputCls =
    "px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-base md:text-sm text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700/20";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3 sm:p-4"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="table-title"
        onSubmit={submit}
        className="w-full max-w-[480px] max-h-full flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100"
      >
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 id="table-title" className="text-base font-bold text-slate-900">
              {table ? "แก้ไขตารางย่อย" : "สร้างตารางย่อย"}
            </h2>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
              ใน layer {layer.name} — 1 feature มีได้หลายแถว
            </p>
          </div>
          <button type="button" aria-label="ปิด" onClick={onClose} className="p-1 rounded text-slate-500 hover:bg-slate-100 flex">
            <XIcon className="size-[20px] shrink-0" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="table-name" className="text-xs font-semibold text-slate-600">
              ชื่อตาราง
            </label>
            <input
              id="table-name"
              value={name}
              maxLength={60}
              autoFocus
              placeholder="เช่น ปลาที่พบ, แผนก, ผลตรวจน้ำ"
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-600">หัวข้อ (คอลัมน์ของตารางย่อย)</span>
            <FieldListEditor
              fields={fields}
              onChange={setFields}
              originalKeys={originalKeys}
              editing={!!table}
              emptyHint='ยังไม่มีหัวข้อ — เช่น "ชนิดปลา" (ข้อความ), "จำนวน" (ตัวเลข), "วันที่สำรวจ" (ข้อความ)'
              inputCls={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="table-count" className="text-xs font-semibold text-slate-600">
              คอลัมน์สรุปใน Attribute table
            </label>
            <select
              id="table-count"
              value={countField ? countKey : ""}
              onChange={(e) => setCountKey(e.target.value)}
              className={inputCls}
            >
              <option value="">นับจำนวนแถว</option>
              {fields
                .filter((f) => f.label.trim())
                .map((f) => (
                  <option key={f.uid} value={f.key}>
                    นับค่าไม่ซ้ำของ "{f.label.trim()}"
                  </option>
                ))}
            </select>
            <p className="text-[11px] text-slate-400">
              เช่น นับค่าไม่ซ้ำของ "ชนิดปลา" = จำนวนชนิดปลา (สำรวจเจอปลาชนิดเดิมหลายครั้งนับเป็น 1) — ระบบนับให้เอง แก้ด้วยมือไม่ได้
            </p>
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              ⚠️ {error}
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          {onDelete ? (
            confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700"
                >
                  ยืนยันลบ{recordCount ? ` (+ ข้อมูล ${recordCount} แถว)` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
                >
                  ไม่ลบ
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium"
              >
                <Trash2Icon className="size-[16px] shrink-0" />
                ลบตาราง
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-700 text-white hover:bg-teal-800 rounded-lg text-xs font-medium shadow-sm"
            >
              <SaveIcon className="size-[16px] shrink-0" />
              บันทึก
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
