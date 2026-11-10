import { useRef, useState, type ReactNode } from "react";
import type { FeatureProps } from "../api";
import { centerOf, message } from "../lib/featureMeta";
import { badInputLabel, badNumberMessage, formatValue, pickValues, type FieldValue, type FieldValues, type Layer, type LayerField } from "../lib/layers";
import { describeGeometry, fmtLat, fmtLng } from "../lib/measure";
import FieldInput from "./FieldInput";
import type { GeomType } from "../lib/types";

/** Point = ตำแหน่งจุด, Line/Polygon = จุดกึ่งกลางของกรอบ (อัปเดตเมื่อลากแก้เสร็จ) */
function LocationView({ geometry, mobile }: { geometry: GeoJSON.Geometry; mobile: boolean }) {
  const [lng, lat] = centerOf(geometry);
  const pos = { lat, lng };

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

// ตัวเลือกใน dropdown Layer: ไม่อยู่ใน layer / ท้ายรายการ = เปิดฟอร์มสร้าง layer (ไม่ได้เลือกค่านี้จริง)
const NO_LAYER = "";
const NEW_LAYER = "__new";

/** เลือก layer (หรือไม่อยู่ใน layer) + ช่องกรอกตามหัวข้อของ layer ที่เลือก */
function LayerFields({
  type,
  layers,
  layer,
  values,
  readOnly,
  inputCls,
  onLayerChange,
  onValueChange,
  onCreateLayer,
}: {
  type: GeomType;
  /** layer ที่รูปทรงตรงกับ feature นี้ */
  layers: Layer[];
  layer: Layer | undefined;
  values: FieldValues;
  readOnly: boolean;
  inputCls: string;
  onLayerChange: (id: number | null) => void;
  onValueChange: (key: string, v: FieldValue | undefined) => void;
  onCreateLayer?: (type: GeomType) => void;
}) {
  const input = (f: LayerField) => {
    const v = values[f.key];
    const id = `fe-${f.key}`;
    if (readOnly) {
      const text = formatValue(f, v);
      return (
        <div id={id} className={`px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 ${text ? "text-slate-700" : "text-slate-400"}`}>
          {text || "—"}
        </div>
      );
    }
    return (
      <FieldInput
        id={id}
        field={f}
        value={v}
        onChange={(nv) => onValueChange(f.key, nv)}
        className={f.type === "choice" || f.type === "boolean" ? `${inputCls} py-2` : inputCls}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="fe-layer" className="text-xs font-semibold text-slate-600">
          Layer
        </label>
        <div className="relative">
          <span
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none ${
              layer ? "" : "border border-dashed border-slate-400"
            }`}
            style={layer ? { backgroundColor: layer.color } : undefined}
          />
          <select
            id="fe-layer"
            value={layer?.id ?? NO_LAYER}
            disabled={readOnly}
            onChange={(e) => {
              if (e.target.value === NEW_LAYER) onCreateLayer?.(type);
              else onLayerChange(e.target.value === NO_LAYER ? null : Number(e.target.value));
            }}
            className={`${inputCls} w-full pl-8 py-2 font-medium`}
          >
            <option value={NO_LAYER}>— ไม่มี layer —</option>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            {onCreateLayer && <option value={NEW_LAYER}>+ สร้าง layer ใหม่…</option>}
          </select>
        </div>
      </div>
      {layer?.fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1">
          <label htmlFor={`fe-${f.key}`} className="text-xs font-semibold text-slate-600">
            {f.label}
          </label>
          {input(f)}
        </div>
      ))}
    </>
  );
}

/**
 * ฟอร์ม Edit Feature Properties (ชื่อ / layer + ค่าของหัวข้อ / คำอธิบาย) — feature ไม่อยู่ใน layer ก็บันทึกได้
 * ใช้ทั้งตอนแก้ feature เดิมและตอนเพิ่ง วาดเสร็จ — parent ต้องใส่ `key` ให้เปลี่ยนตาม feature ที่เลือก
 * variant="mobile" = หน้าตาตามดีไซน์มือถือ (อยู่ใน bottom sheet; ตอน create ปุ่มบันทึกอยู่ที่ navbar ผ่าน formId)
 */
export default function FeatureEditor({
  mode,
  type,
  geometry,
  initial,
  onSave,
  onCancel,
  onDelete,
  onEdit,
  variant = "desktop",
  formId,
  ownerName,
  canModify = true,
  layers,
  onCreateLayer,
  related,
}: {
  /** ตารางย่อยของ feature (ระบบ layer) — แสดงใต้คำอธิบาย */
  related?: ReactNode;
  /** layer ทั้งหมด (dropdown แสดงเฉพาะที่รูปทรงตรงกัน) */
  layers: Layer[];
  /** ตัวเลือก "+ สร้าง layer ใหม่…" (เฉพาะคนที่จัดการ layer ได้) */
  onCreateLayer?: (type: GeomType) => void;
  /** ชื่อคนสร้าง (แสดงเมื่อ login แล้ว) */
  ownerName?: string | null;
  /** แก้/ลบได้ไหม (เจ้าของ feature หรือเจ้าของ group) — ไม่ได้ก็ซ่อนปุ่ม Edit/Delete บนมือถือ */
  canModify?: boolean;
  mode: "view" | "edit" | "create";
  type: GeomType;
  /** รูปทรงปัจจุบัน (ระหว่างวาด/แก้ = ค่าล่าสุดจาก draw) ใช้แสดงตำแหน่ง/พื้นที่ */
  geometry: GeoJSON.Geometry;
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
  const [description, setDescription] = useState(initial.description ?? "");
  // วาดใหม่: ใช้ layer แรกที่รูปทรงตรงกัน (ไม่มีก็ "ไม่มี layer") / feature เดิม: layer ที่อยู่ (หรือไม่มี)
  const [layerId, setLayerId] = useState<number | null>(() =>
    mode === "create"
      ? (initial.layerId ?? layers.find((l) => l.geomType === type)?.id ?? null)
      : (initial.layerId ?? null),
  );
  // ฟอร์ม — ตอนบันทึกตรวจช่องตัวเลขที่พิมพ์ไม่เป็นตัวเลข (ไม่ทิ้งค่าเงียบๆ)
  const formRef = useRef<HTMLFormElement>(null);
  // กดสร้าง layer จากฟอร์ม → จำ layer ที่มีอยู่ตอนนั้นไว้ พอมี layer ใหม่โผล่มาให้เลือกอันนั้นให้เลย
  const [knownLayers, setKnownLayers] = useState<Set<number> | null>(null);
  const [values, setValues] = useState<FieldValues>(initial.values ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const matching = layers.filter((l) => l.geomType === type);
  const created = knownLayers && matching.find((l) => !knownLayers.has(l.id));
  if (created) {
    setKnownLayers(null);
    setLayerId(created.id);
  }
  const createLayer =
    onCreateLayer &&
    ((t: GeomType) => {
      setKnownLayers(new Set(layers.map((l) => l.id)));
      onCreateLayer(t);
    });
  // layer ที่เลือกถูกลบไปแล้ว = ไม่มี layer
  const layer = matching.find((l) => l.id === layerId);
  const trimmed = name.trim();
  const canSave = !!trimmed;
  const save = () => {
    const wrong = badInputLabel(formRef.current);
    if (wrong !== null) return setError(badNumberMessage(wrong));
    return run(() =>
      onSave({
        name: trimmed,
        description: description.trim() || undefined,
        layerId: layer?.id,
        values: layer ? pickValues(values, layer.fields) : undefined,
      }),
    );
  };

  const setValue = (key: string, v: FieldValue | undefined) =>
    setValues((old) => {
      const next = { ...old };
      if (v === undefined || v === "") delete next[key];
      else next[key] = v;
      return next;
    });

  const inputCls = `bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700/20 disabled:bg-slate-50 disabled:text-slate-600 ${
    mobile ? "px-3 py-2 text-base min-h-11" : "px-2.5 py-1.5 text-sm"
  }`;

  const info = describeGeometry(geometry);

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

      <LayerFields
        type={type}
        layers={matching}
        layer={layer}
        values={values}
        readOnly={readOnly}
        inputCls={inputCls}
        onLayerChange={setLayerId}
        onValueChange={setValue}
        onCreateLayer={createLayer}
      />

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

      {ownerName && (
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <span className="material-symbols-outlined text-[16px]">person</span>
          สร้างโดย <strong className="text-slate-700">{ownerName}</strong>
        </p>
      )}

      {related}

      <LocationView geometry={geometry} mobile={mobile} />

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
    if (!readOnly && canSave && !busy) void save();
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
                {layer && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                    {layer.name}
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

        <form id={formId} ref={formRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-1 space-y-3.5 pb-4" onSubmit={onSubmit}>
          {fields}
        </form>

        {mode !== "create" && (
          <div className="shrink-0 px-4 py-3 border-t border-slate-200 flex items-center gap-2.5 pb-safe">
            {mode === "view" ? (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className={`${btn} ${canModify ? "px-4" : "flex-1"} text-slate-600 bg-slate-100`}
                >
                  Close
                </button>
                {canModify && (
                  <>
                    {deleteBtn}
                    <button type="button" onClick={onEdit} className={`${btn} flex-1 bg-teal-700 text-white shadow-md`}>
                      <span className="material-symbols-outlined text-[19px]">edit</span>
                      Edit
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {deleteBtn}
                <button type="button" disabled={busy} onClick={onCancel} className={`${btn} px-3 text-slate-600 bg-slate-100`}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !canSave}
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

      <form id={formId} ref={formRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3" onSubmit={onSubmit}>
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
            disabled={busy || !canSave}
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
