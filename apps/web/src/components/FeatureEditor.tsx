import { useEffect, useReducer, useState } from "react";
import L from "leaflet";
import type { FeatureProps } from "../api";
import { CATEGORIES, CATEGORY_STYLE, type Category } from "../lib/categories";
import { message } from "../lib/featureMeta";
import { describeLayer, fmtLat, fmtLng } from "../lib/measure";
import type { GeomType } from "../lib/types";

/** วาดซ้ำเมื่อแก้จุดของ layer เสร็จ (pm:edit) — ใช้อัปเดตตำแหน่ง/พื้นที่ที่แสดง */
function useLayerRefresh(layer: L.Layer) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    layer.on("pm:edit", refresh);
    return () => void layer.off("pm:edit", refresh);
  }, [layer]);
}

/** Point = ตำแหน่งจุด, Line/Polygon = จุดกึ่งกลางของกรอบ (อัปเดตเมื่อลากแก้เสร็จ) */
function LocationView({ layer, mobile }: { layer: L.Layer; mobile: boolean }) {
  useLayerRefresh(layer);

  const pos =
    layer instanceof L.Marker ? layer.getLatLng() : layer instanceof L.Polyline ? layer.getBounds().getCenter() : null;
  if (!pos) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Location</div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["Latitude", fmtLat(pos.lat)],
          ["Longitude", fmtLng(pos.lng)],
        ].map(([label, value]) => (
          <div key={label} className={`bg-slate-50 border border-slate-200 rounded text-xs ${mobile ? "p-3 rounded-lg" : "p-2.5"}`}>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">{label}</span>
            <span className="font-mono font-medium text-slate-700">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ฟอร์ม Edit Feature Properties (ชื่อ / category / description)
 * ใช้ทั้งตอนแก้ feature เดิมและตอนเพิ่ง วาดเสร็จ — parent ต้องใส่ `key` ให้เปลี่ยนตาม feature ที่เลือก
 * variant="mobile" = หน้าตาตามดีไซน์มือถือ (อยู่ใน bottom sheet; ตอน create ปุ่มบันทึกอยู่ที่ navbar ผ่าน formId)
 */
export default function FeatureEditor({
  mode,
  type,
  layer,
  initial,
  onSave,
  onCancel,
  onDelete,
  onEdit,
  variant = "desktop",
  formId,
}: {
  mode: "view" | "edit" | "create";
  type: GeomType;
  layer: L.Layer;
  initial: FeatureProps;
  onSave: (props: FeatureProps) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  /** มือถือ โหมดดู: ปุ่ม Edit */
  onEdit?: () => void;
  variant?: "desktop" | "mobile";
  /** id ของ <form> ให้ปุ่มนอก component (Done บน navbar มือถือ) สั่ง submit ได้ */
  formId?: string;
}) {
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<Category>(initial.category ?? "Other");
  const [description, setDescription] = useState(initial.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayerRefresh(layer);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const mobile = variant === "mobile";
  const readOnly = mode === "view";
  const trimmed = name.trim();
  const save = () =>
    run(() => onSave({ name: trimmed, category, description: description.trim() || undefined }));

  const inputCls = `bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700/20 disabled:bg-slate-50 disabled:text-slate-600 ${
    mobile ? "px-3 py-2 text-base min-h-11" : "px-2.5 py-1.5 text-sm"
  }`;

  const info = describeLayer(layer);

  const fields = (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="fe-name" className="text-xs font-semibold text-slate-600 flex items-center justify-between">
          <span>Feature Name</span>
          <span className="text-red-700 font-normal">*required</span>
        </label>
        <input
          id="fe-name"
          type="text"
          value={name}
          maxLength={100}
          required
          autoFocus={mode === "create" && !mobile}
          disabled={readOnly}
          placeholder={mobile ? "Add a name" : undefined}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fe-category" className="text-xs font-semibold text-slate-600">
          Category
        </label>
        <div className="relative">
          <span
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none ${CATEGORY_STYLE[category].dot}`}
          />
          <select
            id="fe-category"
            value={category}
            disabled={readOnly}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={`${inputCls} w-full pl-8 py-2 font-medium`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fe-desc" className="text-xs font-semibold text-slate-600">
          Description &amp; {mobile ? "Notes" : "Operational Notes"}
        </label>
        <textarea
          id="fe-desc"
          rows={3}
          value={description}
          disabled={readOnly}
          maxLength={2000}
          placeholder={mobile ? "Add a description" : undefined}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} resize-none`}
        />
      </div>

      <LocationView layer={layer} mobile={mobile} />

      {error && (
        <p role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          ⚠️ {error}
        </p>
      )}
      {/* ให้กด Enter ในช่องชื่อเพื่อบันทึกได้ */}
      <button type="submit" hidden />
    </>
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!readOnly && trimmed && !busy) void save();
  };

  if (mobile) {
    const btn =
      "h-11 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-1.5 transition-opacity active:opacity-80 disabled:opacity-50";
    const deleteBtn = (
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(onDelete)}
        className={`${btn} px-4 bg-red-100 text-red-800`}
      >
        <span className="material-symbols-outlined text-[19px]">delete</span>
        Delete
      </button>
    );
    return (
      <div className="flex flex-col min-h-0 h-full bg-white">
        {mode === "create" ? (
          <div className="shrink-0 mx-4 mb-2 pb-2 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-700" />
              <h2 className="text-lg font-bold text-slate-900">{type === "LineString" ? "Line" : type}</h2>
            </div>
            <span className="text-xs font-medium text-slate-500">{[info.metric, info.count].filter(Boolean).join(" · ")}</span>
          </div>
        ) : (
          <div className="shrink-0 px-4 pb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[11px] font-semibold">{type}</span>
                {initial.category && (
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${CATEGORY_STYLE[initial.category].badge}`}>
                    {initial.category}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-slate-900 truncate">{initial.name}</h2>
            </div>
            {info.metric && (
              <div className="flex flex-col items-end shrink-0">
                <span className="text-[15px] font-semibold text-teal-700">{info.metric}</span>
                <span className="text-[11px] font-mono text-slate-500">{info.count}</span>
              </div>
            )}
          </div>
        )}

        <form id={formId} className="flex-1 min-h-0 overflow-y-auto px-4 py-1 space-y-3.5 pb-4" onSubmit={onSubmit}>
          {fields}
        </form>

        {mode !== "create" && (
          <div className="shrink-0 px-4 py-3 border-t border-slate-200 flex items-center gap-2.5 pb-safe">
            {mode === "view" ? (
              <>
                <button type="button" onClick={onCancel} className={`${btn} px-4 text-slate-600 bg-slate-100`}>
                  Close
                </button>
                {deleteBtn}
                <button type="button" onClick={onEdit} className={`${btn} flex-1 bg-teal-700 text-white shadow-md`}>
                  <span className="material-symbols-outlined text-[19px]">edit</span>
                  Edit
                </button>
              </>
            ) : (
              <>
                {deleteBtn}
                <button type="button" disabled={busy} onClick={onCancel} className={`${btn} px-3 text-slate-600 bg-slate-100`}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !trimmed}
                  onClick={() => void save()}
                  className={`${btn} flex-1 bg-teal-700 text-white shadow-md`}
                >
                  <span className="material-symbols-outlined text-[19px]">save</span>
                  {busy ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full bg-white">
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-teal-700 text-[18px]">info</span>
          <span className="text-sm font-semibold text-slate-900">
            {mode === "create" ? "New Feature" : mode === "view" ? "Details" : "Edit Details"}
          </span>
        </div>
      </div>

      <form id={formId} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3" onSubmit={onSubmit}>
        {fields}
      </form>

      <div className="px-3 py-2.5 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {readOnly ? "Close" : "Cancel"}
        </button>
        <div className={`flex items-center gap-2 ${readOnly ? "hidden" : ""}`}>
          <button
            type="button"
            title="Delete Selected Feature"
            disabled={busy}
            onClick={() => void run(onDelete)}
            className="flex items-center gap-1 px-2.5 py-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Delete
          </button>
          <button
            type="button"
            disabled={busy || !trimmed}
            onClick={() => void save()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-700 text-white hover:bg-teal-800 rounded-lg text-xs font-medium shadow-sm disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            {busy ? "Saving…" : mode === "create" ? "Save" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
