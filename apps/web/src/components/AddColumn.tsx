import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FIELD_TYPE_LABEL, newFieldKey, type FieldType, type LayerField } from "../lib/layers";
import { PlusIcon } from "lucide-react";

// ชนิดพิเศษในกล่องเพิ่มคอลัมน์: สร้างตารางย่อยแทนหัวข้อ
const TABLE = "__table";

/**
 * ปุ่ม + ท้ายหัวตาราง: เพิ่มคอลัมน์ (= หัวข้อใหม่) โดยไม่ต้องเปิดหน้าตั้งค่า
 * onAddTable มี = เลือกชนิด "ตารางย่อย" ได้ (ตารางหลัก: 1 feature มีได้หลายแถว)
 */
export default function AddColumn({
  taken,
  onAdd,
  onAddTable,
  text,
}: {
  /** ข้อความข้างไอคอน + (ไม่ใส่ = ปุ่มไอคอนอย่างเดียว) */
  text?: string;
  /** ชื่อที่ใช้ไม่ได้ (คอลัมน์ที่มีอยู่แล้ว) */
  taken: string[];
  onAdd: (field: LayerField) => void;
  onAddTable?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType | typeof TABLE>("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setLabel("");
    setType("text");
    setOptions("");
    setError(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = () => {
    const name = label.trim();
    if (!name) return setError("ใส่ชื่อคอลัมน์");
    if (taken.some((l) => l.toLowerCase() === name.toLowerCase())) return setError(`มีคอลัมน์ "${name}" แล้ว`);
    if (type === TABLE) {
      onAddTable?.(name);
      return close();
    }
    const field: LayerField = { key: newFieldKey(), label: name, type };
    if (type === "choice") {
      const list = [...new Set(options.split(",").map((o) => o.trim()).filter(Boolean))];
      if (!list.length) return setError("ใส่ตัวเลือกอย่างน้อย 1 ค่า");
      field.options = list;
    }
    onAdd(field);
    close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          title="เพิ่มคอลัมน์"
          aria-label="เพิ่มคอลัมน์"
          variant={open ? "default" : "ghost"}
          size={text ? "xs" : "icon-xs"}
          className={cn("align-middle", !open && "text-primary hover:bg-primary/10 hover:text-primary")}
        >
          <PlusIcon />
          {text}
        </Button>
      </PopoverTrigger>
      {/* ไม่ใช้ <form>: ปุ่มนี้อยู่ในฟอร์มของ feature ได้ (ตารางย่อยในฟอร์มรายละเอียด) — Popover วาดใน portal แต่ event ของ React ยังไหลขึ้นไปหาฟอร์มที่ครอบอยู่ จึงใช้ปุ่ม type="button" + จับ Enter เอง */}
      <PopoverContent
        align="start"
        collisionPadding={8}
        role="group"
        aria-label="กล่องเพิ่มคอลัมน์"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Enter = เพิ่ม (กันไม่ให้ไปส่งฟอร์ม feature ที่ครอบอยู่) / Esc = Popover ปิดให้เอง
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="flex w-64 max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-xl p-3 text-left font-normal shadow-float"
      >
        <Input
          autoFocus
          value={label}
          maxLength={40}
          placeholder="ชื่อคอลัมน์ เช่น จำนวนเตียง"
          aria-label="ชื่อคอลัมน์"
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
          className="h-8"
        />
        <Select value={type} onValueChange={(v) => setType(v as FieldType | typeof TABLE)}>
          <SelectTrigger aria-label="ชนิดข้อมูล" className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {FIELD_TYPE_LABEL[t]}
                </SelectItem>
              ))}
              {onAddTable && <SelectItem value={TABLE}>ตารางย่อย (หลายแถวต่อ feature)</SelectItem>}
            </SelectGroup>
          </SelectContent>
        </Select>
        {type === TABLE && (
          <p className="text-[0.6875rem] leading-snug text-muted-foreground">
            เช่น "ปลาที่พบ" — ได้คอลัมน์สรุปที่นับให้เอง คลิกตัวเลขเพื่อเปิดตารางย่อยแล้วเพิ่มคอลัมน์ต่อได้
          </p>
        )}
        {type === "choice" && (
          <Input
            value={options}
            placeholder="ตัวเลือก คั่นด้วย ,"
            aria-label="ตัวเลือก"
            onChange={(e) => setOptions(e.target.value)}
            className="h-8"
          />
        )}
        {error && <p className="text-[0.6875rem] text-destructive">{error}</p>}
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={close}>
            ยกเลิก
          </Button>
          <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={submit}>
            เพิ่ม
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
