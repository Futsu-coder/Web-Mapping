import { useEffect, useState } from "react";
import type { Map as MlMap } from "maplibre-gl";
import { CompassIcon, MinusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const CARD = "bg-card rounded-xl shadow-float border border-black/5";
const SEG = "w-full font-semibold data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

/**
 * กลุ่มควบคุมมุมมอง (ขวาล่าง): สลับ 2D/3D, ซูม +/− (เฉพาะจอคอม), เข็มทิศ (เฉพาะตอน 3D)
 * paused = แอปบังคับให้แผนที่แบนชั่วคราวระหว่างวาด/แก้/ย้าย → ปุ่ม 3D จางลง
 */
export default function MapControls({
  map,
  is3D,
  paused,
  onToggle3D,
  compact = false,
  className,
}: {
  map: MlMap | null;
  is3D: boolean;
  paused: boolean;
  onToggle3D: () => void;
  /** มือถือ: ไม่มีปุ่มซูม (ใช้ pinch) ปุ่มสูง 44px */
  compact?: boolean;
  className?: string;
}) {
  const [bearing, setBearing] = useState(0);
  useEffect(() => {
    if (!map) return;
    const onRotate = () => setBearing(map.getBearing());
    map.on("rotate", onRotate);
    return () => void map.off("rotate", onRotate);
  }, [map]);

  const showCompass = is3D && !paused;
  const segH = compact ? "h-11" : "h-9";

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

      <div className={cn(CARD, "p-1", paused && "opacity-60")}>
        <ToggleGroup
          type="single"
          value={is3D ? "3d" : "2d"}
          onValueChange={(v) => v && (v === "3d") !== is3D && onToggle3D()}
          aria-label="มุมมองแผนที่"
          spacing={0.5}
          className={cn("flex-col", compact && "min-w-12")}
        >
          <ToggleGroupItem value="2d" aria-label="มุมมองแบน 2D" className={cn(SEG, segH)}>
            2D
          </ToggleGroupItem>
          <ToggleGroupItem value="3d" aria-label="มุมมอง 3D" className={cn(SEG, segH)}>
            3D
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

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
