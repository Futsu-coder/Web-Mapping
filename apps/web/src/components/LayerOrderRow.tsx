import type { CSSProperties, HTMLAttributes } from "react";
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, GripVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GEOM_LABEL, type Layer } from "../lib/layers";


/**
 * แถว layer ในโหมดเรียงลำดับ (ใช้ร่วมคอม + มือถือ): ด้ามจับลาก ⠿ + ปุ่ม ↑/↓ + จุดสี/ชื่อ + ปุ่มตา
 * บนสุดของรายการ = วาดทับ layer ที่อยู่ล่างกว่า
 */
export default function LayerOrderRow({
  layer,
  index,
  total,
  hidden,
  dragging,
  offset,
  grip,
  large,
  onMoveBy,
  onToggleVisible,
}: {
  layer: Layer;
  index: number;
  total: number;
  hidden: boolean;
  dragging: boolean;
  /** ระยะเลื่อนระหว่างลาก (px) */
  offset: number;
  grip: HTMLAttributes<HTMLSpanElement>;
  /** มือถือ: ปุ่มใหญ่ ≥44px */
  large?: boolean;
  onMoveBy: (delta: number) => void;
  onToggleVisible: () => void;
}) {
  const size = large ? "size-11" : "size-8";
  const style: CSSProperties = {
    transform: offset ? `translateY(${offset}px)` : undefined,
    transition: dragging ? "none" : "transform 150ms ease",
    position: "relative",
    zIndex: dragging ? 10 : undefined,
  };
  return (
    <li
      style={style}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-black/5 bg-card px-1 py-1 shadow-xs",
        dragging && "border-transparent shadow-float ring-2 ring-primary motion-safe:scale-[1.02]",
        hidden && "opacity-55",
      )}
    >
      <span
        {...grip}
        role="button"
        tabIndex={-1}
        aria-label={`ลากเพื่อย้าย ${layer.name}`}
        title="ลากเพื่อย้าย"
        className={cn("grid shrink-0 place-items-center text-primary", size, grip.className)}
      >
        <GripVerticalIcon className="size-4.5" />
      </span>
      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{layer.name}</span>
        <span className="block text-[0.6875rem] text-muted-foreground">{GEOM_LABEL[layer.geomType]}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={size}
        disabled={index === 0}
        aria-label={`ย้าย ${layer.name} ขึ้น`}
        title="ย้ายขึ้น (ทับ layer ล่าง)"
        onClick={() => onMoveBy(-1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={size}
        disabled={index === total - 1}
        aria-label={`ย้าย ${layer.name} ลง`}
        title="ย้ายลง"
        onClick={() => onMoveBy(1)}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={size}
        aria-pressed={!hidden}
        aria-label={hidden ? `แสดง ${layer.name} บนแผนที่` : `ซ่อน ${layer.name} จากแผนที่`}
        title={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}
        onClick={onToggleVisible}
      >
        {hidden ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </li>
  );
}
