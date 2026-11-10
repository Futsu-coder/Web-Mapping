import { useState } from "react";
import { InfoIcon, MoveIcon, PencilIcon, SaveIcon, Trash2Icon, UserIcon } from "lucide-react";
import type { FeatureProps } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { message } from "../lib/featureMeta";
import { pickValues, type FieldValues, type Layer } from "../lib/layers";
import { fmtLat, fmtLng, formatArea, formatLength, lineLength, polygonArea, polygonPerimeter } from "../lib/measure";
import type { GeomType } from "../lib/types";

const TYPE_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

/** ข้อมูลรูปทรงตามชนิด: Point = ตำแหน่ง, Line = ความยาวรวม, Polygon = พื้นที่ + ความยาวรอบรูป (อัปเดตตาม geometry ล่าสุด) */
function GeometryInfo({ geometry, mobile }: { geometry: GeoJSON.Geometry; mobile: boolean }) {
  let title = "ขนาด";
  let rows: [string, string][] = [];
  if (geometry.type === "Point") {
    title = "ตำแหน่ง";
    const [lng, lat] = geometry.coordinates;
    rows = [
      ["ละติจูด", fmtLat(lat)],
      ["ลองจิจูด", fmtLng(lng)],
    ];
  } else if (geometry.type === "LineString") {
    rows = [["ความยาวรวม", formatLength(lineLength(geometry.coordinates))]];
  } else if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    rows = [
      ["พื้นที่", formatArea(polygonArea(ring))],
      ["ความยาวรอบรูป", formatLength(polygonPerimeter(ring))],
    ];
  }
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{title}</span>
      <div className={cn("grid gap-2", rows.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {rows.map(([label, value]) => (
          <div key={label} className={cn("rounded-lg border bg-muted/50 text-xs", mobile ? "p-3" : "p-2.5")}>
            <span className="block text-[0.6875rem] text-muted-foreground">{label}</span>
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

/** เลือก layer (หรือไม่อยู่ใน layer) — ค่าของหัวข้อ layer / ตารางย่อยแก้ใน Attribute table */
function LayerFields({
  type,
  layers,
  layer,
  readOnly,
  mobile,
  onLayerChange,
  onCreateLayer,
}: {
  type: GeomType;
  /** layer ที่รูปทรงตรงกับ feature นี้ */
  layers: Layer[];
  layer: Layer | undefined;
  readOnly: boolean;
  mobile: boolean;
  onLayerChange: (id: number | null) => void;
  onCreateLayer?: (type: GeomType) => void;
}) {
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
      {!readOnly && layer && layer.fields.length > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground">ค่าของคอลัมน์และตารางย่อยของ layer แก้ได้ใน Attribute table</p>
      )}
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
}: {
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
  // กดสร้าง layer จากฟอร์ม → จำ layer ที่มีอยู่ตอนนั้นไว้ พอมี layer ใหม่โผล่มาให้เลือกอันนั้นให้เลย
  const [knownLayers, setKnownLayers] = useState<Set<number> | null>(null);
  // ค่าของหัวข้อ layer ไม่แก้ในการ์ดนี้ — เก็บไว้ส่งกลับตอนบันทึก (ค่าเดิมไม่หาย; เปลี่ยน layer = ตัดค่าของ layer เก่า)
  const [values] = useState<FieldValues>(initial.values ?? {});
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
    return run(() =>
      onSave({
        name: trimmed,
        description: description.trim() || undefined,
        layerId: layer?.id,
        values: layer ? pickValues(values, layer.fields) : undefined,
      }),
    );
  };

  // มือถือ: input สูง 44px+ และตัวอักษร 16px กัน iOS ซูมเอง
  const ctl = mobile ? "h-11 text-base md:text-base" : "";

  const fields = (
    <>
      {!readOnly && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-2.5 py-2 text-xs text-teal-900">
          <MoveIcon className="mt-0.5 size-4 shrink-0" />
          <span>
            {mobile ? "ลากจุดยอดบนแผนที่เพื่อปรับรูปร่าง" : "ลากจุดยอดบนแผนที่เพื่อปรับรูปร่าง หรือลากทั้งรูปเพื่อย้ายตำแหน่ง"}
            {mode === "edit" && ` · กดยกเลิกหรือ${mobile ? "แตะ" : "คลิก"}นอกรูปเพื่อออกโดยไม่บันทึก`}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fe-name">
          ชื่อ
          {!readOnly && (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          )}
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
        readOnly={readOnly}
        mobile={mobile}
        onLayerChange={setLayerId}
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

      <GeometryInfo geometry={geometry} mobile={mobile} />

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
      variant="destructive"
      disabled={busy}
      onClick={() => void run(onDelete)}
      className={cn(mobile && "h-11 px-4")}
    >
      <Trash2Icon data-icon="inline-start" />
      ลบ
    </Button>
  );

  if (mobile) {
    const h = "h-11 text-[0.9375rem]";
    return (
      <div className="flex h-full min-h-0 flex-col bg-card">
        {mode === "create" ? (
          <div className="mx-4 mb-2 flex shrink-0 items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-primary" />
              <h2 className="text-lg font-bold">{TYPE_LABEL[type]}</h2>
            </div>
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
          </div>
        )}

        <form id={formId} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-1 pb-4" onSubmit={onSubmit}>
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
                <Button type="button" variant="secondary" disabled={busy} onClick={onCancel} className={cn(h, "px-4")}>
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
      </div>

      <form id={formId} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-3" onSubmit={onSubmit}>
        {fields}
      </form>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
        {/* แก้ไข: ลบชิดซ้าย ยกเลิก+บันทึกชิดขวา (ยกเลิก = เหมือนคลิกพื้นที่ว่าง) / สร้างใหม่: ยกเลิกชิดซ้าย เพราะคลิกพื้นที่ว่างไม่ทิ้ง draft */}
        {mode === "edit" ? (
          deleteButton
        ) : (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {readOnly ? "ปิด" : "ยกเลิก"}
          </Button>
        )}
        {!readOnly && (
          <div className="flex items-center gap-2">
            {mode === "edit" && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
                ยกเลิก
              </Button>
            )}
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
