import { MoreHorizontalIcon, Redo2Icon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Props = {
  /** drawing = ยกเลิก/undo/redo/ถัดไป, form = ยกเลิก/บันทึก (กรอกข้อมูลหลังวาด) — โหมดปกติใช้แถบค้นหา */
  mode: "drawing" | "form";
  formId: string;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onNext: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canNext: boolean;
};

/** แถบบนมือถือตอนวาด/กรอกฟอร์ม — ลอยทับแผนที่ (ไม่ดันขนาดแผนที่) */
export default function MobileHeader(p: Props) {
  return (
    <header className="pt-safe absolute inset-x-0 top-0 z-40 border-b border-black/5 bg-card shadow-float">
      <div className="flex h-14 items-center justify-between gap-2 px-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={p.onCancel}>
          ยกเลิก
        </Button>

        {p.mode === "drawing" ? (
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11" aria-label="เมนูเพิ่มเติม">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" className="h-11" disabled={!p.canUndo} onSelect={p.onClear}>
                    <Trash2Icon /> ล้างทุกจุด
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" className="size-11" aria-label="ย้อนกลับ" disabled={!p.canUndo} onClick={p.onUndo}>
              <Undo2Icon />
            </Button>
            <Button variant="ghost" size="icon" className="size-11" aria-label="ทำซ้ำ" disabled={!p.canRedo} onClick={p.onRedo}>
              <Redo2Icon />
            </Button>
            <Button type="button" className="ml-1 h-11 px-5" disabled={!p.canNext} onClick={p.onNext}>
              ถัดไป
            </Button>
          </div>
        ) : (
          <Button type="submit" form={p.formId} className="h-11 px-5">
            บันทึก
          </Button>
        )}
      </div>
    </header>
  );
}
