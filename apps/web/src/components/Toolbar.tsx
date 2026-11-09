import { useEffect } from "react";
import { MapPinIcon, MoveIcon, PentagonIcon, RouteIcon, XIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DrawShape } from "../lib/types";

const TOOLS: { shape: DrawShape; label: string; key: string; Icon: LucideIcon; hint: string }[] = [
  { shape: "Marker", label: "จุด", key: "P", Icon: MapPinIcon, hint: "คลิกบนแผนที่เพื่อวางจุด" },
  { shape: "Line", label: "เส้น", key: "L", Icon: RouteIcon, hint: "คลิกเพื่อวางจุด · ดับเบิลคลิกหรือกด Enter เพื่อจบ" },
  { shape: "Polygon", label: "พื้นที่", key: "G", Icon: PentagonIcon, hint: "คลิกเพื่อวางจุด · คลิกจุดแรกหรือกด Enter เพื่อจบ" },
];

function Kbd({ children, on }: { children: string; on?: boolean }) {
  return (
    <kbd
      className={cn(
        "rounded border px-1.5 text-[0.6875rem] leading-4 font-semibold",
        on ? "border-white/40 bg-white/15 text-white" : "bg-muted/60 text-muted-foreground",
      )}
    >
      {children}
    </kbd>
  );
}

/** เครื่องมือวาด (จอคอม): pill กลางล่าง + แถบคำแนะนำตอนวาด + คีย์ลัด P/L/G/M/Esc — มือถือใช้ DrawFab แทน */
export default function Toolbar({
  activeTool,
  moveActive,
  onDrawSelect,
  onToggleMove,
  shortcutsEnabled = true,
}: {
  activeTool: DrawShape | null;
  moveActive: boolean;
  /** เลือกเครื่องมือวาด (เลือกตัวเดิมซ้ำ = ยกเลิก) */
  onDrawSelect: (shape: DrawShape) => void;
  /** เปิด/ปิดเครื่องมือ Move (ย้ายทั้งก้อน) */
  onToggleMove: () => void;
  /** false = ปิดคีย์ลัด P/L/G/M (ระหว่างสร้าง/แก้ feature กันเผลอกดแล้วฟอร์มที่กรอกไว้หาย) — Esc ยังใช้ได้ */
  shortcutsEnabled?: boolean;
}) {
  // คีย์ลัด — ข้ามเมื่อกำลังพิมพ์ในช่องกรอก หรือมี dialog เปิดอยู่
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // dropdown/เมนูของ shadcn (Select, DropdownMenu, Popover) พิมพ์ตัวอักษรเพื่อค้นรายการ — ห้ามไปเริ่มวาด
      if (el?.closest('[role="combobox"],[role="listbox"],[role="menu"],[role="option"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (activeTool) onDrawSelect(activeTool);
        else if (moveActive) onToggleMove();
        return;
      }
      if (!shortcutsEnabled) return;
      if (k === "m") return void onToggleMove();
      const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
      if (tool) onDrawSelect(tool.shape);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, moveActive, onDrawSelect, onToggleMove, shortcutsEnabled]);

  const hint = activeTool
    ? TOOLS.find((t) => t.shape === activeTool)?.hint
    : moveActive
      ? "คลิก feature ที่ต้องการ แล้วลากเพื่อย้ายทั้งรูป"
      : null;

  return (
    <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      {hint && (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-zinc-900 py-2 pr-2 pl-4 text-sm text-white shadow-float">
          <span>{hint}</span>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 bg-zinc-700 text-white hover:bg-zinc-600"
            onClick={() => (activeTool ? onDrawSelect(activeTool) : onToggleMove())}
          >
            <XIcon data-icon="inline-start" />
            ยกเลิก <Kbd on>Esc</Kbd>
          </Button>
        </div>
      )}
      <div role="toolbar" aria-label="เครื่องมือวาด" className="flex items-center gap-0.5 rounded-2xl border border-black/5 bg-card p-1 shadow-float">
        {TOOLS.map(({ shape, label, key, Icon }) => (
          <Tooltip key={shape}>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === shape ? "default" : "ghost"}
                aria-pressed={activeTool === shape}
                className="h-10 gap-2 px-3.5"
                onClick={() => onDrawSelect(shape)}
              >
                <Icon data-icon="inline-start" />
                {label}
                <Kbd on={activeTool === shape}>{key}</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              วาด{label} ({key})
            </TooltipContent>
          </Tooltip>
        ))}
        <div className="mx-1 h-6 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={moveActive ? "default" : "ghost"} aria-pressed={moveActive} className="h-10 gap-2 px-3.5" onClick={onToggleMove}>
              <MoveIcon data-icon="inline-start" />
              ย้าย
              <Kbd on={moveActive}>M</Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">ย้ายทั้งรูป (M)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
