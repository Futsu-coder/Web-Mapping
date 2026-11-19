import { useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DRAW_TOOLS, toolOf } from "../lib/drawTools";
import type { DrawShape } from "../lib/types";

/**
 * ปุ่มสร้าง feature (ขวาล่าง ทั้งจอคอม/มือถือ): กดแล้วเด้งรายการเครื่องมือแบบ speed dial (จุด/เส้น/พื้นที่)
 * เลือกแล้วปุ่มแสดงไอคอนของเครื่องมือที่ใช้อยู่ — กดอีกครั้งเพื่อสลับเครื่องมือหรือยกเลิก
 */
export default function DrawFab({
  activeTool,
  onSelect,
  onCancel,
  layerHint,
  showKeys = false,
  className,
}: {
  activeTool: DrawShape | null;
  /** เลือกเครื่องมือ (ตัวที่ใช้อยู่ซ้ำ = ไม่ทำอะไร, ผู้เรียกจัดการถามยืนยัน/เช็ก layer เอง) */
  onSelect: (shape: DrawShape) => void;
  onCancel: () => void;
  /** ป้ายใต้ชื่อชนิดที่ยังไม่มี layer */
  layerHint?: Partial<Record<DrawShape, string>>;
  /** จอคอม: โชว์คีย์ลัด + ปุ่มขนาด 48px */
  showKeys?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const Active = activeTool ? toolOf(activeTool).Icon : null;
  const label = activeTool ? `เครื่องมือ: ${toolOf(activeTool).label} — กดเพื่อเปลี่ยนหรือยกเลิก` : "เพิ่ม feature";

  const pick = (shape: DrawShape) => {
    setOpen(false);
    if (shape !== activeTool) onSelect(shape);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button aria-label={label} className={cn("size-14 rounded-2xl shadow-float", className)}>
          {open ? (
            <XIcon className="size-7" />
          ) : Active ? (
            <Active className="size-7" />
          ) : (
            <PlusIcon className="size-7" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="left"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="flex min-w-0 flex-row items-start gap-2 overflow-visible border-0 bg-transparent p-0 shadow-none ring-0"
        // คีย์ลัด P/L/G ตอนเมนูเปิด (Radix typeahead ไม่ชนเพราะชื่อเป็นภาษาไทย)
        onKeyDown={(e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const tool = DRAW_TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
          if (tool) {
            e.preventDefault();
            pick(tool.shape);
          }
        }}
      >
        {activeTool && (
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onCancel();
            }}
            className="animate-in fade-in-0 slide-in-from-right-2 flex w-auto cursor-pointer flex-col-reverse items-center gap-1.5 rounded-full bg-transparent p-0 focus:bg-transparent motion-reduce:animate-none"
          >
            <span className="whitespace-nowrap rounded-xl border border-black/5 bg-card px-3 py-1.5 text-sm font-medium shadow-float">ยกเลิก</span>
            <span className="flex size-12 items-center justify-center rounded-full border border-black/5 bg-card text-destructive shadow-float">
              <XIcon className="size-5" />
            </span>
          </DropdownMenuItem>
        )}
        {[...DRAW_TOOLS].map(({ shape, label: name, key, Icon }, i) => {
          const on = activeTool === shape;
          const hint = layerHint?.[shape];
          return (
            <DropdownMenuItem
              key={shape}
              aria-current={on || undefined}
              onSelect={() => pick(shape)}
              style={{ animationDelay: `${(DRAW_TOOLS.length - 1 - i) * 30}ms` }}
              className="animate-in fade-in-0 slide-in-from-right-2 flex w-auto cursor-pointer flex-col-reverse items-center gap-1.5 rounded-full bg-transparent p-0 focus:bg-transparent motion-reduce:animate-none"
            >
              <span className="flex flex-col items-center whitespace-nowrap rounded-xl border border-black/5 bg-card px-3 py-1.5 text-sm leading-tight font-medium shadow-float">
                <span className="flex items-center gap-2">
                  {name}
                  {showKeys && <kbd className="rounded border bg-muted/60 px-1.5 text-[0.6875rem] leading-4 font-semibold text-muted-foreground">{key}</kbd>}
                </span>
                {hint && <span className="text-[0.6875rem] font-normal text-muted-foreground">{hint}</span>}
              </span>
              <span
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border border-black/5 shadow-float",
                  on ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                )}
              >
                <Icon className="size-5" />
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
