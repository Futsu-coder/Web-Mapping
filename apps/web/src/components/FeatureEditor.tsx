import { useRef, useState, type ReactNode } from "react";
import { InfoIcon, MoveIcon, PencilIcon, SaveIcon, Trash2Icon, UserIcon } from "lucide-react";
import type { FeatureProps } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { centerOf, message } from "../lib/featureMeta";
import {
  badInputLabel,
  badNumberMessage,
  formatValue,
  pickValues,
  type FieldValue,
  type FieldValues,
  type Layer,
  type LayerField,
} from "../lib/layers";
import { describeGeometry, fmtLat, fmtLng } from "../lib/measure";
import type { GeomType } from "../lib/types";
import FieldInput from "./FieldInput";

const TYPE_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

/** Point = ตำแหน่งจุด, Line/Polygon = จุดกึ่งกลางของกรอบ (อัปเดตเมื่อลากแก้เสร็จ) */
function LocationView({ geometry, mobile }: { geometry: GeoJSON.Geometry; mobile: boolean }) {
  const [lng, lat] = centerOf(geometry);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">ตำแหน่ง</span>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["ละติจูด", fmtLat(lat)],
          ["ลองจิจูด", fmtLng(lng)],
        ].map(([label, value]) => (
          <div key={label} className={cn("rounded-lg border bg-muted/50 text-xs", mobile ? "p-3" : "p-2.5")}>
            <span className="block text-[11px] text-muted-foreground">{label}</span>
            <span className="font-mono font-medium">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ตัวเลือกใน dropdown Layer: ไม่อยู่ใน layer / ท้ายรายการ = เปิดฟอร์มสร้าง layer (ไม่ได้เลือกค่านี้จริง)
// Select ของ shadcn (Radix) ห้ามใช้ค่า "" จึงใช้คำแทน
const NO_LAYER = "none";
const NEW_LAYER = "__new";

// ช่องกรอกของหัวข้อ layer (input/select ธรรมดา) ให้หน้าตาเหมือน Input ของ shadcn
const FIELD_CLS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** เลือก layer (หรือไม่อยู่ใน layer) + ช่องกรอกตามหัวข้อของ layer ที่เลือก */
function LayerFields({
  type,
  layers,
  layer,
  values,
  readOnly,
  mobile,
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
  mobile: boolean;
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
        <div id={id} className={cn("rounded-md border bg-muted/50 px-3 py-2 text-sm", !text && "text-muted-foreground")}>
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
        className={cn(FIELD_CLS, mobile && "h-11 text-base")}
      />
    );
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fe-layer">Layer</Label>
        <Select
          value={layer ? String(layer.id) : NO_LAYER}
          disabled={readOnly}
          onValueChange={(v) => {
            if (v === NEW_LAYER) onCreateLayer?.(type);
            else onLayerChange(v === NO_LAYER ? null : Number(v));
          }}
        >
          <SelectTrigger id="fe-layer" className={cn("w-full", mobile && "h-11 text-base")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={NO_LAYER}>
                <span className="size-2.5 rounded-full border border-dashed border-muted-foreground" />— ไม่มี layer —
              </SelectItem>
              {layers.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </SelectItem>
              ))}
              {onCreateLayer && <SelectItem value={NEW_LAYER}>+ สร้าง layer ใหม่…</SelectItem>}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {layer?.fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`fe-${f.key}`}>{f.label}</Label>
          {input(f)}
        </div>
      ))}
    </>
  );
}

/**
 * ฟอร์มรายละเอียด feature (ชื่อ / layer + ค่าของหัวข้อ / คำอธิบาย) — feature ไม่อยู่ใน layer ก็บันทึกได้
 * ใช้ทั้งตอนแก้ feature เดิมและตอนเพิ่งวาดเสร็จ — parent ต้องใส่ `key` ให้เปลี่ยนตาม feature ที่เลือก
 * variant="mobile" = อยู่ใน bottom sheet (ตอน create ปุ่มบันทึกอยู่ที่หัวจอผ่าน formId)
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
  /** id ของ <form> ให้ปุ่มนอก component (บันทึกบนหัวจอมือถือ) สั่ง submit ได้ */
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
  const info = describeGeometry(geometry);
  // มือถือ: input สูง 44px+ และตัวอักษร 16px กัน iOS ซูมเอง
  const ctl = mobile ? "h-11 text-base md:text-base" : "";

  const fields = (
    <>
      {!readOnly && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-2.5 py-2 text-xs text-teal-900">
          <MoveIcon className="mt-0.5 size-4 shrink-0" />
          <span>{mobile ? "ลากจุดยอดบนแผนที่เพื่อปรับรูปร่าง" : "ลากจุดยอดบนแผนที่เพื่อปรับรูปร่าง หรือลากทั้งรูปเพื่อย้ายตำแหน่ง"}</span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fe-name" className="justify-between">
          <span>ชื่อ</span>
          <span className="font-normal text-destructive">จำเป็น</span>
        </Label>
        <Input
          id="fe-name"
          value={name}
          maxLength={100}
          required
          autoFocus={mode === "create" && !mobile}
          disabled={readOnly}
          placeholder={mobile ? "ใส่ชื่อ" : undefined}
          onChange={(e) => setName(e.target.value)}
          className={ctl}
        />
      </div>

      <LayerFields
        type={type}
        layers={matching}
        layer={layer}
        values={values}
        readOnly={readOnly}
        mobile={mobile}
        onLayerChange={setLayerId}
        onValueChange={setValue}
        onCreateLayer={createLayer}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fe-desc">คำอธิบาย</Label>
        <Textarea
          id="fe-desc"
          rows={3}
          value={description}
          disabled={readOnly}
          maxLength={2000}
          placeholder={mobile ? "ใส่คำอธิบาย" : undefined}
          onChange={(e) => setDescription(e.target.value)}
          className={cn("resize-none", mobile && "text-base md:text-base")}
        />
      </div>

      {ownerName && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserIcon className="size-4" />
          สร้างโดย <strong className="text-foreground">{ownerName}</strong>
        </p>
      )}

      {related}

      <LocationView geometry={geometry} mobile={mobile} />

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800">
          {error}
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

  const deleteButton = (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={() => void run(onDelete)}
      className={cn("border-red-200 text-destructive hover:bg-red-50 hover:text-destructive", mobile && "h-11")}
    >
      <Trash2Icon data-icon="inline-start" />
      ลบ
    </Button>
  );

  if (mobile) {
    const h = "h-11 text-[15px]";
    return (
      <div className="flex h-full min-h-0 flex-col bg-card">
        {mode === "create" ? (
          <div className="mx-4 mb-2 flex shrink-0 items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-primary" />
              <h2 className="text-lg font-bold">{TYPE_LABEL[type]}</h2>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{[info.metric, info.count].filter(Boolean).join(" · ")}</span>
          </div>
        ) : (
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{TYPE_LABEL[type]}</Badge>
                {layer && (
                  <Badge variant="outline">
                    <span className="size-2 rounded-full" style={{ backgroundColor: layer.color }} />
                    {layer.name}
                  </Badge>
                )}
              </div>
              <h2 className="truncate text-lg font-semibold">{initial.name}</h2>
            </div>
            {info.metric && (
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-[15px] font-semibold text-primary">{info.metric}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{info.count}</span>
              </div>
            )}
          </div>
        )}

        <form id={formId} ref={formRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-1 pb-4" onSubmit={onSubmit}>
          {fields}
        </form>

        {mode !== "create" && (
          <div className="pb-safe flex shrink-0 items-center gap-2.5 border-t px-4 py-3">
            {mode === "view" ? (
              <>
                <Button type="button" variant="secondary" onClick={onCancel} className={cn(h, canModify ? "px-4" : "flex-1")}>
                  ปิด
                </Button>
                {canModify && (
                  <>
                    {deleteButton}
                    <Button type="button" onClick={onEdit} className={cn(h, "flex-1")}>
                      <PencilIcon data-icon="inline-start" />
                      แก้ไข
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                {deleteButton}
                <Button type="button" variant="secondary" disabled={busy} onClick={onCancel} className={h}>
                  ยกเลิก
                </Button>
                <Button type="button" disabled={busy || !trimmed} onClick={() => void save()} className={cn(h, "flex-1")}>
                  <SaveIcon data-icon="inline-start" />
                  {busy ? "กำลังบันทึก…" : "บันทึก"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <InfoIcon className="size-4.5 text-primary" />
        <h2 className="text-sm font-semibold">
          {mode === "create" ? "เพิ่มรายการใหม่" : mode === "view" ? "รายละเอียด" : "แก้ไขรายละเอียด"} · {TYPE_LABEL[type]}
        </h2>
        {info.metric && <span className="ml-auto text-xs font-medium text-muted-foreground">{info.metric}</span>}
      </div>

      <form id={formId} ref={formRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3" onSubmit={onSubmit}>
        {fields}
      </form>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {readOnly ? "ปิด" : "ยกเลิก"}
        </Button>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {mode !== "create" && deleteButton}
            <Button type="button" disabled={busy || !trimmed} onClick={() => void save()}>
              <SaveIcon data-icon="inline-start" />
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
