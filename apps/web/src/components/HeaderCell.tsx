import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FIELD_TYPE_LABEL, type FieldType, type LayerField } from "../lib/layers";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronDownIcon, PencilIcon, Rows3Icon, ShapesIcon, SigmaIcon, Trash2Icon } from "lucide-react";

/** ฟอร์มย่อยในเมนูที่เปิดอยู่ */
type Panel = null | "rename" | "type" | "delete";

const ITEM = "h-8 w-full justify-start gap-2 px-2.5 text-xs font-normal";

/**
 * หัวคอลัมน์ของตาราง: คลิกชื่อ = เมนู (เรียง / เปลี่ยนชื่อ / เปลี่ยนชนิด / แปลงเป็นตารางย่อย / ลบ)
 * เมนูแสดงเฉพาะคำสั่งที่ส่ง callback มา — คอลัมน์ระบบ (ชื่อ, ขนาด, คอลัมน์สรุป) มีแค่เรียง
 */
export default function HeaderCell({
  label,
  numeric,
  computed,
  sortDir,
  onSort,
  taken = [],
  field,
  onRename,
  onChangeType,
  onConvertToTable,
  onDelete,
}: {
  label: string;
  numeric?: boolean;
  /** คอลัมน์ที่ระบบนับให้ (แก้ไม่ได้) */
  computed?: boolean;
  sortDir: 1 | -1 | null;
  /** เลือกทิศทางการเรียง (null = ไม่เรียง) */
  onSort: (dir: 1 | -1 | null) => void;
  /** ชื่อที่ใช้ไม่ได้ตอนเปลี่ยนชื่อ (คอลัมน์อื่น) */
  taken?: string[];
  /** หัวข้อของคอลัมน์นี้ (ใช้แสดงชนิดปัจจุบัน) */
  field?: LayerField;
  onRename?: (label: string) => void;
  /** เปลี่ยนชนิด → ค่าเดิมของคอลัมน์ถูกล้าง */
  onChangeType?: (type: FieldType, options?: string[]) => void;
  /** ย้ายคอลัมน์นี้ไปเป็นตารางย่อย (ค่าเดิมกลายเป็นแถวแรกของแต่ละ feature) */
  onConvertToTable?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<FieldType>(field?.type ?? "text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  // เปิด/ปิดเมนู — ปิดเมื่อไหร่ก็กลับไปหน้าคำสั่งหลักและล้าง error (Popover ของ shadcn จัดการตำแหน่ง/Esc/คลิกนอกให้)
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPanel(null);
      setError(null);
    }
  };
  const close = () => onOpenChange(false);

  const rename = () => {
    const next = draft.trim();
    if (!next || next === label) return close();
    if (taken.some((l) => l.toLowerCase() === next.toLowerCase())) return setError(`มีคอลัมน์ "${next}" แล้ว`);
    onRename?.(next);
    close();
  };

  const changeType = () => {
    if (type === "choice") {
      const list = [...new Set(options.split(",").map((o) => o.trim()).filter(Boolean))];
      if (!list.length) return setError("ใส่ตัวเลือกอย่างน้อย 1 ค่า");
      onChangeType?.(type, list);
    } else {
      onChangeType?.(type);
    }
    close();
  };

  const run = (fn: () => void) => () => {
    fn();
    close();
  };

  const hasEdit = !!(onRename || onChangeType || onConvertToTable || onDelete);

  const backButton = (
    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPanel(null)}>
      กลับ
    </Button>
  );

  return (
    <th
      className={cn("border-b px-3 py-1.5 whitespace-nowrap", numeric ? "text-right" : "text-left", computed && "bg-primary/5")}
      title={computed ? "ระบบนับจากตารางย่อยให้เอง (แก้ไม่ได้) — คลิกตัวเลขเพื่อเปิดตารางย่อย" : undefined}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-haspopup="menu"
            className={cn(
              "-mx-1 h-6 gap-0.5 px-1 text-xs font-semibold text-muted-foreground hover:text-foreground",
              open && "bg-accent text-foreground",
            )}
          >
            {computed && <SigmaIcon className="text-primary" />}
            {label}
            {sortDir === 1 ? <ArrowUpIcon /> : sortDir === -1 ? <ArrowDownIcon /> : <ChevronDownIcon className="text-muted-foreground/60" />}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" collisionPadding={8} className="w-60 max-w-[calc(100vw-1rem)] rounded-xl p-1 text-left font-normal whitespace-normal shadow-float">
          {panel === null && (
            <div role="menu" className="flex flex-col">
              <Button type="button" role="menuitem" variant="ghost" className={ITEM} onClick={run(() => onSort(1))}>
                <ArrowUpIcon className="text-muted-foreground" />
                เรียงน้อย → มาก
              </Button>
              <Button type="button" role="menuitem" variant="ghost" className={ITEM} onClick={run(() => onSort(-1))}>
                <ArrowDownIcon className="text-muted-foreground" />
                เรียงมาก → น้อย
              </Button>
              {sortDir !== null && (
                <Button type="button" role="menuitem" variant="ghost" className={ITEM} onClick={run(() => onSort(null))}>
                  <ArrowUpDownIcon className="text-muted-foreground" />
                  เลิกเรียง
                </Button>
              )}
              {hasEdit && <Separator className="my-1" />}
              {onRename && (
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  className={ITEM}
                  onClick={() => {
                    setDraft(label);
                    setPanel("rename");
                  }}
                >
                  <PencilIcon className="text-muted-foreground" />
                  เปลี่ยนชื่อ
                </Button>
              )}
              {onChangeType && (
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  className={ITEM}
                  onClick={() => {
                    setType(field?.type ?? "text");
                    setOptions(field?.options?.join(", ") ?? "");
                    setPanel("type");
                  }}
                >
                  <ShapesIcon className="text-muted-foreground" />
                  เปลี่ยนชนิด
                  {field && <span className="ml-auto text-[0.6875rem] text-muted-foreground">{FIELD_TYPE_LABEL[field.type]}</span>}
                </Button>
              )}
              {onConvertToTable && (
                <Button type="button" role="menuitem" variant="ghost" className={cn(ITEM, "h-auto items-start py-1.5")} onClick={run(onConvertToTable)}>
                  <Rows3Icon className="mt-0.5 text-primary" />
                  <span className="text-left whitespace-normal">
                    แปลงเป็นตารางย่อย
                    <span className="block text-[0.6875rem] text-muted-foreground">หลายค่าต่อ feature — ค่าเดิมย้ายไปเป็นแถวแรก</span>
                  </span>
                </Button>
              )}
              {onDelete && (
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  className={cn(ITEM, "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                  onClick={() => setPanel("delete")}
                >
                  <Trash2Icon />
                  ลบคอลัมน์
                </Button>
              )}
            </div>
          )}

          {panel === "rename" && (
            <form
              className="flex flex-col gap-2 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
            >
              <Input
                autoFocus
                value={draft}
                maxLength={60}
                aria-label="ชื่อคอลัมน์ใหม่"
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                className="h-8"
              />
              {error && <p className="text-[0.6875rem] text-destructive">{error}</p>}
              <div className="flex justify-end gap-1.5">
                {backButton}
                <Button type="submit" size="sm" className="h-7 px-3 text-xs">
                  บันทึก
                </Button>
              </div>
            </form>
          )}

          {panel === "type" && (
            <form
              className="flex flex-col gap-2 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                changeType();
              }}
            >
              <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                <SelectTrigger aria-label="ชนิดใหม่" className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {FIELD_TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {type === "choice" && (
                <Input
                  value={options}
                  placeholder="ตัวเลือก คั่นด้วย ,"
                  aria-label="ตัวเลือก"
                  onChange={(e) => setOptions(e.target.value)}
                  className="h-8"
                />
              )}
              <p className="text-[0.6875rem] text-muted-foreground">เปลี่ยนชนิด = ค่าเดิมในคอลัมน์นี้จะถูกล้าง</p>
              {error && <p className="text-[0.6875rem] text-destructive">{error}</p>}
              <div className="flex justify-end gap-1.5">
                {backButton}
                <Button type="submit" size="sm" className="h-7 px-3 text-xs">
                  เปลี่ยน
                </Button>
              </div>
            </form>
          )}

          {panel === "delete" && (
            <div className="flex flex-col gap-2 p-1.5">
              <p className="text-xs">ลบคอลัมน์ "{label}" และค่าทั้งหมดในคอลัมน์นี้?</p>
              <div className="flex justify-end gap-1.5">
                {backButton}
                <Button type="button" variant="destructive" size="sm" autoFocus className="h-7 px-3 text-xs" onClick={run(() => onDelete?.())}>
                  ลบ
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </th>
  );
}
