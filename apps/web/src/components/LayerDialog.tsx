import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { GeomType } from "../api";
import { GEOM_LABEL, LAYER_COLORS, type Layer, type RelatedTable } from "../lib/layers";
import { parseDrafts, TABLE_TYPE, tableDrafts, toDrafts, type DraftField } from "../lib/fieldDrafts";
import FieldListEditor from "./FieldListEditor";
import { CircleAlertIcon, type LucideIcon, MapPinIcon, PentagonIcon, RouteIcon, SaveIcon, Trash2Icon } from "lucide-react";

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
const GEOM_ICON: Record<GeomType, LucideIcon> = { Point: MapPinIcon, LineString: RouteIcon, Polygon: PentagonIcon };

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
  // ชื่อว่าง/ซ้ำ → กรอบแดงที่ช่องชื่อ + ข้อความใต้ช่อง (แยกจาก error ของหัวข้อด้านล่าง)
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const originalKeys = new Set(layer?.fields.map((f) => f.key));
  const typeLocked = !!layer || !!lockType;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const badName = (msg: string) => {
      setNameError(msg);
      e.currentTarget.querySelector<HTMLInputElement>("#layer-name")?.focus();
    };
    if (!trimmed) return badName("ลืมใส่ชื่อ layer");
    if (takenNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return badName(`มี layer ชื่อ "${trimmed}" แล้ว`);
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[480px]">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 border-b px-5 pt-4 pb-3 pr-12">
            <DialogTitle className="text-base font-bold">{layer ? "แก้ไข Layer" : "สร้าง Layer"}</DialogTitle>
            <DialogDescription className="sr-only">ตั้งชื่อ ชนิดรูปทรง สี และหัวข้อของ layer</DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="layer-name">ชื่อ Layer</Label>
              <Input
                id="layer-name"
                value={name}
                maxLength={60}
                autoFocus
                placeholder="เช่น โรงเรียน, แม่น้ำ"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "layer-name-error" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                  setNameError(null);
                }}
              />
              {nameError && (
                <p id="layer-name-error" role="alert" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label id="layer-geom">
                ชนิดรูปทรง {typeLocked && <span className="font-normal text-muted-foreground">(เปลี่ยนไม่ได้)</span>}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={geomType}
                onValueChange={(v) => v && setGeomType(v as GeomType)}
                aria-labelledby="layer-geom"
                spacing={2}
                className="grid w-full grid-cols-3"
              >
                {GEOM_TYPES.map((t) => {
                  const Icon = GEOM_ICON[t];
                  return (
                    <ToggleGroupItem
                      key={t}
                      value={t}
                      disabled={typeLocked && t !== geomType}
                      className="h-9 gap-1.5 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:font-semibold data-[state=on]:text-primary"
                    >
                      <Icon />
                      {GEOM_LABEL[t]}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>สีบนแผนที่</Label>
              <div className="flex flex-wrap gap-2">
                {LAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`สี ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={cn(
                      "size-7 rounded-full outline-none transition-transform focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      color === c && "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background",
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>หัวข้อ Property (คอลัมน์ในตาราง)</Label>
                <span className="text-[0.6875rem] text-muted-foreground">ทุก feature มี "ชื่อ" และ "คำอธิบาย" อยู่แล้ว</span>
              </div>
              <FieldListEditor
                fields={fields}
                onChange={setFields}
                originalKeys={originalKeys}
                editing={!!layer}
                emptyHint='ยังไม่มีหัวข้อ — เพิ่มเช่น "สังกัด" (ตัวเลือก), "จำนวนนักเรียน" (ตัวเลข) หรือ "ปลาที่พบ" (ตารางย่อย)'
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
              <p className="text-[0.6875rem] text-muted-foreground">ตารางย่อย = 1 feature มีได้หลายแถว (เช่น ปลาหลายชนิดในแม่น้ำ 1 สาย)</p>
            </div>

            {error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t px-5 py-3 sm:justify-between">
            {onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  {featureCount > 0 && (
                    <span className="max-w-[11rem] text-[0.6875rem] leading-tight text-muted-foreground">
                      feature {featureCount} ชิ้นจะกลายเป็น "ไม่มี layer" (ค่าในคอลัมน์ของ layer และตารางย่อยหาย)
                    </span>
                  )}
                  <Button type="button" variant="destructive" size="sm" className="shrink-0" onClick={onDelete}>
                    ยืนยันลบ
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                    ไม่ลบ
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2Icon />
                  ลบ Layer
                </Button>
              )
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button type="submit" size="sm">
                <SaveIcon />
                บันทึก
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
