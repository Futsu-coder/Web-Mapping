import { useEffect, useRef, useState } from "react";
import type { GeomType } from "../api";
import { GEOM_LABEL, LAYER_COLORS, type Layer, type RelatedTable } from "../lib/layers";
import { parseDrafts, TABLE_TYPE, tableDrafts, toDrafts, type DraftField } from "../lib/fieldDrafts";
import FieldListEditor from "./FieldListEditor";

export type LayerDraft = Omit<Layer, "id"> & { id?: number };

/** การเปลี่ยนแปลงตารางย่อยจากรายการหัวข้อ (ทำหลังบันทึก layer — layer ใหม่ต้องได้ id ก่อน) */
export type TableChanges = {
  /** ตารางย่อยใหม่ (ยังไม่มีคอลัมน์) */
  create: string[];
  /** หัวข้อเดิมที่เปลี่ยนเป็นตารางย่อย → ค่าเดิมย้ายเป็นแถวแรก */
  convert: { key: string; name: string }[];
  rename: { id: number; name: string }[];
  remove: number[];
};

const GEOM_TYPES: GeomType[] = ["Point", "LineString", "Polygon"];
const GEOM_ICON: Record<GeomType, string> = { Point: "location_on", LineString: "timeline", Polygon: "polyline" };

/**
 * ฟอร์มสร้าง/แก้ layer: ชื่อ, ชนิดรูปทรง (เลือกได้แค่ตอนสร้าง), สี และหัวข้อ property
 * เปลี่ยนชนิดของหัวข้อเดิม = ได้ key ใหม่ → ค่าเดิมของหัวข้อนั้นถูกล้าง (ค่าเก่าอาจไม่ตรงชนิดใหม่)
 * ตารางย่อยอยู่ในรายการเดียวกับหัวข้อ (ชนิด "ตารางย่อย") — เลือกได้ตั้งแต่ตอนสร้าง layer
 */
export default function LayerDialog({
  layer,
  lockType,
  takenNames,
  featureCount,
  onSave,
  onDelete,
  onClose,
  tables = [],
  onEditTable,
}: {
  /** ตารางย่อยของ layer นี้ */
  tables?: RelatedTable[];
  /** ตั้งค่าคอลัมน์ของตารางย่อยที่มีอยู่แล้ว */
  onEditTable?: (table: RelatedTable) => void;
  /** null = สร้างใหม่ */
  layer: Layer | null;
  /** สร้างจากฟอร์ม feature ที่เพิ่งวาด → ล็อกชนิดรูปทรงให้ตรงกับที่วาด */
  lockType?: GeomType;
  /** ชื่อ layer อื่นที่มีอยู่แล้ว (ห้ามซ้ำ) */
  takenNames: string[];
  /** จำนวน feature ใน layer นี้ (แสดงตอนยืนยันลบ — feature ไม่ถูกลบ แค่ออกจาก layer) */
  featureCount: number;
  onSave: (layer: LayerDraft, tables: TableChanges) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(layer?.name ?? "");
  const [geomType, setGeomType] = useState<GeomType>(layer?.geomType ?? lockType ?? "Point");
  const [color, setColor] = useState(layer?.color ?? LAYER_COLORS[0]);
  const [fields, setFields] = useState<DraftField[]>(() => [...toDrafts(layer?.fields), ...tableDrafts(tables)]);
  // ชื่อตารางย่อยตอนเปิดฟอร์ม — เปลี่ยนชื่อเฉพาะแถวที่ผู้ใช้แก้ในฟอร์มนี้ (ไม่ทับชื่อที่แก้จากหน้าต่าง ⚙)
  const [initialTableNames] = useState(() => new Map(tables.map((t) => [t.id, t.name])));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const downOnBackdrop = useRef(false);
  const originalKeys = new Set(layer?.fields.map((f) => f.key));
  const typeLocked = !!layer || !!lockType;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("ใส่ชื่อ layer");
    if (takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return setError(`มี layer ชื่อ "${trimmed}" แล้ว`);
    const out = parseDrafts(fields, ["ชื่อ", "คำอธิบาย"]);
    if (typeof out === "string") return setError(out);
    const rows = fields.filter((f) => f.type === TABLE_TYPE);
    const kept = new Set(rows.map((f) => f.tableId));
    onSave(
      { id: layer?.id, name: trimmed, geomType, color, fields: out },
      {
        create: rows.filter((f) => f.tableId === undefined && !originalKeys.has(f.key)).map((f) => f.label.trim()),
        convert: rows
          .filter((f) => f.tableId === undefined && originalKeys.has(f.key))
          .map((f) => ({ key: f.key, name: f.label.trim() })),
        rename: rows
          .filter((f) => f.tableId !== undefined && f.label.trim() !== initialTableNames.get(f.tableId))
          .map((f) => ({ id: f.tableId!, name: f.label.trim() })),
        remove: [...initialTableNames.keys()].filter((id) => !kept.has(id)),
      },
    );
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
        aria-labelledby="layer-title"
        onSubmit={submit}
        className="w-full max-w-[480px] max-h-full flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100"
      >
        <div className="px-5 pt-4 pb-3 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 id="layer-title" className="text-base font-bold text-slate-900">
            {layer ? "แก้ไข Layer" : "สร้าง Layer"}
          </h2>
          <button type="button" aria-label="ปิด" onClick={onClose} className="p-1 rounded text-slate-500 hover:bg-slate-100 flex">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="layer-name" className="text-xs font-semibold text-slate-600">
              ชื่อ Layer
            </label>
            <input
              id="layer-name"
              value={name}
              maxLength={60}
              autoFocus
              placeholder="เช่น โรงเรียน, แม่น้ำ"
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">
              ชนิดรูปทรง {typeLocked && <span className="font-normal text-slate-400">(เปลี่ยนไม่ได้)</span>}
            </span>
            <div className="grid grid-cols-3 gap-2">
              {GEOM_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={typeLocked && t !== geomType}
                  onClick={() => setGeomType(t)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm transition-colors disabled:opacity-40 ${
                    geomType === t ? "border-teal-700 bg-teal-50 text-teal-800 font-semibold" : "border-slate-300 text-slate-600"
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{GEOM_ICON[t]}</span>
                  {GEOM_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">สีบนแผนที่</span>
            <div className="flex gap-2 flex-wrap">
              {LAYER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`สี ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : ""}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">หัวข้อ Property (คอลัมน์ในตาราง)</span>
              <span className="text-[11px] text-slate-400">ทุก feature มี "ชื่อ" และ "คำอธิบาย" อยู่แล้ว</span>
            </div>
            <FieldListEditor
              fields={fields}
              onChange={setFields}
              originalKeys={originalKeys}
              editing={!!layer}
              emptyHint='ยังไม่มีหัวข้อ — เพิ่มเช่น "สังกัด" (ตัวเลือก), "จำนวนนักเรียน" (ตัวเลข) หรือ "ปลาที่พบ" (ตารางย่อย)'
              inputCls={inputCls}
              allowTables
              tableColumns={(id) => tables.find((t) => t.id === id)?.fields.length ?? 0}
              onEditTable={
                onEditTable &&
                ((id) => {
                  const t = tables.find((x) => x.id === id);
                  if (t) onEditTable(t);
                })
              }
            />
            <p className="text-[11px] text-slate-400">ตารางย่อย = 1 feature มีได้หลายแถว (เช่น ปลาหลายชนิดในแม่น้ำ 1 สาย)</p>
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
                {featureCount > 0 && (
                  <span className="text-[11px] text-slate-500 max-w-[11rem] leading-tight">
                    feature {featureCount} ชิ้นจะกลายเป็น "ไม่มี layer" (ค่าในคอลัมน์ของ layer และตารางย่อยหาย)
                  </span>
                )}
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 shrink-0"
                >
                  ยืนยันลบ
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
                <span className="material-symbols-outlined text-[16px]">delete</span>
                ลบ Layer
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
              <span className="material-symbols-outlined text-[16px]">save</span>
              บันทึก
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
