import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Layer, RelatedTable } from "../lib/layers";
import { parseDrafts, toDrafts, type DraftField } from "../lib/fieldDrafts";
import FieldListEditor from "./FieldListEditor";
import { CircleAlertIcon, SaveIcon, Trash2Icon } from "lucide-react";

export type RelatedTableDraft = Omit<RelatedTable, "id"> & { id?: number };

// Select ของ shadcn (Radix) ห้ามใช้ค่า "" จึงใช้คำแทน "นับจำนวนแถว"
const COUNT_ROWS = "__rows";

/**
 * ฟอร์มสร้าง/แก้ตารางย่อยของ layer: ชื่อ, หัวข้อ, และวิธีนับค่าสรุปที่แสดงใน attribute table
 * (เปิดซ้อนบนฟอร์ม layer ได้ — Esc ปิดเฉพาะอันบนสุด ซึ่ง Dialog ของ shadcn จัดการให้)
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
  const originalKeys = new Set(table?.fields.map((f) => f.key));

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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-[480px]">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-0.5 border-b px-5 pt-4 pb-3 pr-12">
            <DialogTitle className="text-base font-bold">{table ? "แก้ไขตารางย่อย" : "สร้างตารางย่อย"}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 text-xs">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
              ใน layer {layer.name} — 1 feature มีได้หลายแถว
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="table-name">ชื่อตาราง</Label>
              <Input
                id="table-name"
                value={name}
                maxLength={60}
                autoFocus
                placeholder="เช่น ปลาที่พบ, แผนก, ผลตรวจน้ำ"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>หัวข้อ (คอลัมน์ของตารางย่อย)</Label>
              <FieldListEditor
                fields={fields}
                onChange={setFields}
                originalKeys={originalKeys}
                editing={!!table}
                emptyHint='ยังไม่มีหัวข้อ — เช่น "ชนิดปลา" (ข้อความ), "จำนวน" (ตัวเลข), "วันที่สำรวจ" (ข้อความ)'
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="table-count">คอลัมน์สรุปใน Attribute table</Label>
              <Select value={countField ? countKey : COUNT_ROWS} onValueChange={(v) => setCountKey(v === COUNT_ROWS ? "" : v)}>
                <SelectTrigger id="table-count" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={COUNT_ROWS}>นับจำนวนแถว</SelectItem>
                    {fields
                      .filter((f) => f.label.trim())
                      .map((f) => (
                        <SelectItem key={f.uid} value={f.key}>
                          นับค่าไม่ซ้ำของ "{f.label.trim()}"
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-[0.6875rem] text-muted-foreground">
                เช่น นับค่าไม่ซ้ำของ "ชนิดปลา" = จำนวนชนิดปลา (สำรวจเจอปลาชนิดเดิมหลายครั้งนับเป็น 1) — ระบบนับให้เอง แก้ด้วยมือไม่ได้
              </p>
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
                  <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
                    ยืนยันลบ{recordCount ? ` (+ ข้อมูล ${recordCount} แถว)` : ""}
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
                  ลบตาราง
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
