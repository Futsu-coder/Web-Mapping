import { useEffect } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DRAW_TOOLS, toolOf } from "../lib/drawTools";
import type { DrawShape } from "../lib/types";

function Kbd({ children, on }: { children: string; on?: boolean }) {
  return (
    <kbd className={cn("rounded border px-1.5 text-[0.6875rem] leading-4 font-semibold", on ? "border-white/40 bg-white/15 text-white" : "bg-muted/60 text-muted-foreground")}>
      {children}
    </kbd>
  );
}

/** จอคอม: แถบคำแนะนำกลางล่างตอนวาด + คีย์ลัด P/L/G/Esc (ตัวเลือกเครื่องมืออยู่ที่ DrawFab ขวาล่าง) */
export default function DrawHint({
  activeTool,
  onSelect,
  onCancel,
  shortcutsEnabled = true,
}: {
  activeTool: DrawShape | null;
  onSelect: (shape: DrawShape) => void;
  onCancel: () => void;
  /** false = ปิดคีย์ลัด P/L/G (ระหว่างสร้าง/แก้ feature กันเผลอกดแล้วฟอร์มที่กรอกไว้หาย) — Esc ยังใช้ได้ */
  shortcutsEnabled?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      // เมนู/dropdown/dialog เปิดอยู่ (รวมเมนูของ DrawFab ที่จัดการคีย์เอง) — ห้ามยิงซ้ำ
      if (el?.closest('[role="combobox"],[role="listbox"],[role="menu"],[role="option"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]')) return;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (activeTool) onCancel();
        return;
      }
      if (!shortcutsEnabled) return;
      const tool = DRAW_TOOLS.find((t) => t.key.toLowerCase() === k);
      if (!tool) return;
      if (tool.shape === activeTool) onCancel(); // กดคีย์เดิมซ้ำ = ยกเลิก
      else onSelect(tool.shape);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, onSelect, onCancel, shortcutsEnabled]);

  if (!activeTool) return null;
  return (
    <div role="status" className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-zinc-900 py-2 pr-2 pl-4 text-sm text-white shadow-float">
      <span>{toolOf(activeTool).hint}</span>
      <Button size="sm" variant="secondary" className="h-8 bg-zinc-700 text-white hover:bg-zinc-600" onClick={onCancel}>
        <XIcon data-icon="inline-start" />
        ยกเลิก <Kbd on>Esc</Kbd>
      </Button>
    </div>
  );
}
