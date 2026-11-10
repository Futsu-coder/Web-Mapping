import { useEffect, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { CompassIcon, MinusIcon, PlusIcon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const CARD = "bg-card rounded-xl shadow-float border border-black/5";

/**
 * กลุ่มควบคุมมุมมอง (ขวาล่าง): ปุ่ม 3D ปุ่มเดียว (กดครั้งแรกเป็น 3D กดซ้ำกลับ 2D), เข็มทิศ reset ทิศ (เฉพาะตอน 3D),
 * ซูม +/− (เฉพาะจอคอม) + ปุ่มเปิด/ปิด Attribute table (ส่ง onToggleTable มาเท่านั้น)
 * paused = แอปบังคับให้แผนที่แบนชั่วคราว (เช่น ตอนดูรายละเอียด) → ปุ่ม 3D จางลงพร้อมป้ายอธิบาย
 * hide3D = ระหว่างวาด/สร้าง/แก้/ย้าย ซ่อนปุ่ม 3D ไปเลย
 */
export default function MapControls({
  map,
  is3D,
  paused,
  onToggle3D,
  hide3D = false,
  compact = false,
  className,
  tableOpen,
  onToggleTable,
}: {
  map: MlMap | null;
  is3D: boolean;
  paused: boolean;
  onToggle3D: () => void;
  /** ซ่อนปุ่ม 3D (ระหว่างวาด/สร้าง/แก้/ย้าย) */
  hide3D?: boolean;
  /** มือถือ: ไม่มีปุ่มซูม (ใช้ pinch) ปุ่มสูง 44px */
  compact?: boolean;
  className?: string;
  /** Attribute table — ไม่ส่ง = ไม่มีปุ่ม */
  tableOpen?: boolean;
  onToggleTable?: () => void;
}) {
  const [bearing, setBearing] = useState(0);
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    if (!map) return;
    const onRotate = () => setBearing(map.getBearing());
    map.on("rotate", onRotate);
    return () => void map.off("rotate", onRotate);
  }, [map]);

  const showCompass = is3D && !paused;
  const size = compact ? "size-12" : "size-11";
  const toggle3DLabel = is3D ? "กลับเป็นมุมมอง 2D" : "มุมมอง 3D";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* render ไว้ตลอดแล้วสลับ class → ค่อยๆ fade/scale เข้า-ออก (กลุ่มยึดขอบล่าง ปุ่มที่ซ่อนไม่ดันปุ่มอื่น) */}
      <Button
        variant="ghost"
        aria-label="หันไปทิศเหนือ"
        title="หันไปทิศเหนือ"
        aria-hidden={!showCompass}
        tabIndex={showCompass ? 0 : -1}
        className={cn(
          CARD,
          "size-12 rounded-full text-primary transition-[opacity,scale,translate,visibility] duration-300 ease-out hover:bg-card motion-reduce:transition-none",
          showCompass ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none invisible translate-y-2 scale-75 opacity-0",
        )}
        onClick={() => map?.easeTo({ bearing: 0, duration: 400 })}
      >
        <CompassIcon style={{ transform: `rotate(${-bearing}deg)` }} />
      </Button>

      {!hide3D && (
        <Tooltip open={paused && tipOpen} onOpenChange={setTipOpen}>
          <TooltipTrigger asChild>
            {/* span ครอบไว้ให้ tooltip ยังโผล่ได้ตอนปุ่มจาง (paused) */}
            <span className={cn(paused && "opacity-60")}>
              <Button
                variant={is3D ? "default" : "ghost"}
                aria-pressed={is3D}
                aria-label={toggle3DLabel}
                title={paused ? undefined : toggle3DLabel}
                className={cn(
                  CARD,
                  size,
                  "text-base font-bold",
                  is3D ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-card",
                )}
                onClick={onToggle3D}
              >
                3D
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">พัก 3D ขณะดูรายละเอียด ปิดแล้วจะเอียงกลับให้เอง</TooltipContent>
        </Tooltip>
      )}

      {onToggleTable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={tableOpen ? "default" : "ghost"}
              aria-pressed={tableOpen}
              aria-label={tableOpen ? "ปิดตาราง" : "เปิดตาราง (Attribute table)"}
              className={cn(
                CARD,
                size,
                tableOpen ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-card",
              )}
              onClick={onToggleTable}
            >
              <TableIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{tableOpen ? "ปิดตาราง" : "เปิดตาราง (Attribute table)"}</TooltipContent>
        </Tooltip>
      )}

      {!compact && (
        <div className={cn(CARD, "flex flex-col p-1")}>
          <Button variant="ghost" size="icon" className="size-10" aria-label="ซูมเข้า" onClick={() => map?.zoomIn()}>
            <PlusIcon />
          </Button>
          <Button variant="ghost" size="icon" className="size-10" aria-label="ซูมออก" onClick={() => map?.zoomOut()}>
            <MinusIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
