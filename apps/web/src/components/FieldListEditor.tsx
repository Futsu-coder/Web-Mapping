import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TABLE_TYPE, type DraftField } from "../lib/fieldDrafts";
import { FIELD_TYPE_LABEL, newFieldKey, type FieldType } from "../lib/layers";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Rows3Icon, SettingsIcon, Trash2Icon } from "lucide-react";

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
        <p className="rounded-lg border border-dashed bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">{emptyHint}</p>
      )}
      {fields.map((f, i) => (
        <div key={f.uid} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={f.label}
              maxLength={40}
              placeholder="ชื่อหัวข้อ"
              aria-label="ชื่อหัวข้อ"
              onChange={(e) => update(i, { label: e.target.value })}
              className="min-w-0 flex-1 bg-card"
            />
            <Select value={f.type} disabled={f.tableId !== undefined} onValueChange={(v) => changeType(i, v as DraftField["type"])}>
              <SelectTrigger
                aria-label="ชนิดข้อมูล"
                title={f.tableId !== undefined ? "ตารางย่อยที่บันทึกแล้วเปลี่ยนชนิดไม่ได้ (ลบได้)" : undefined}
                className="w-32 shrink-0 bg-card"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                  {(allowTables || f.type === TABLE_TYPE) && <SelectItem value={TABLE_TYPE}>ตารางย่อย</SelectItem>}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="flex shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="เลื่อนขึ้น"
                disabled={i === 0 || f.type === TABLE_TYPE}
                className="text-muted-foreground"
                onClick={() => move(i, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="เลื่อนลง"
                disabled={i === fields.length - 1 || f.type === TABLE_TYPE}
                className="text-muted-foreground"
                onClick={() => move(i, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="ลบหัวข้อ"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onChange((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>
          {f.type === "choice" && (
            <Input
              value={f.options}
              placeholder="ตัวเลือก คั่นด้วย , เช่น สพฐ., อบจ., เทศบาล"
              aria-label="ตัวเลือก"
              onChange={(e) => update(i, { options: e.target.value })}
              className="w-full bg-card"
            />
          )}
          {f.type === TABLE_TYPE ? (
            f.tableId !== undefined ? (
              onEditTable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-fit px-2 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => onEditTable(f.tableId!)}
                >
                  <SettingsIcon />
                  ตั้งค่าคอลัมน์ของตารางย่อย ({tableColumns?.(f.tableId) ?? 0} คอลัมน์)
                </Button>
              )
            ) : (
              <p className="flex items-start gap-1 text-[0.6875rem] text-primary">
                <Rows3Icon className="size-4 shrink-0" />
                {originalKeys.has(f.key)
                  ? "แปลงเป็นตารางย่อย — ค่าเดิมของหัวข้อนี้ย้ายไปเป็นแถวแรกของแต่ละ feature"
                  : "ตารางย่อย (หลายแถวต่อ feature) — บันทึกแล้วเพิ่มคอลัมน์ได้ที่ ⚙ หรือในตารางย่อยของ Attribute table"}
              </p>
            )
          ) : originalKeys.has(f.key) || !editing ? null : (
            <p className="text-[0.6875rem] text-muted-foreground">หัวข้อใหม่ — ข้อมูลเดิมจะมีค่าว่างในหัวข้อนี้</p>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="border-dashed text-primary hover:bg-primary/5 hover:text-primary"
        onClick={() => {
          const key = newFieldKey();
          onChange((list) => [...list, { uid: key, key, label: "", type: "text", options: "" }]);
        }}
      >
        <PlusIcon />
        เพิ่มหัวข้อ
      </Button>
      {editing && (
        <p className="text-[0.6875rem] text-muted-foreground">ลบหัวข้อ หรือเปลี่ยนชนิดของหัวข้อเดิม = ค่าที่กรอกไว้ในหัวข้อนั้นถูกลบ</p>
      )}
    </>
  );
}
