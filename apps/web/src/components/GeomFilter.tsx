import { LayersIcon, MapPinIcon, PentagonIcon, SplineIcon, type LucideIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { FILTERS, type GeomType } from "../lib/types";

export type GeomFilterValue = GeomType | "All";

const LABEL: Record<GeomFilterValue, string> = { All: "ทั้งหมด", Point: "Point", LineString: "Line", Polygon: "Polygon" };
const ICON: Record<GeomFilterValue, LucideIcon> = {
  All: LayersIcon,
  Point: MapPinIcon,
  LineString: SplineIcon,
  Polygon: PentagonIcon,
};

/**
 * ตัวกรองชนิดรูปทรง — segmented control รางเดียว 4 ช่อง (ไอคอน + ชื่อ + จำนวน)
 * ใช้ทั้งการ์ดจอคอมและแท็บรายการมือถือ; กรองทั้งรายการและแผนที่ (App ส่ง value มา)
 */
export default function GeomFilter({
  value,
  onChange,
  counts,
  size = "sm",
}: {
  value: GeomFilterValue;
  onChange: (f: GeomFilterValue) => void;
  /** จำนวน layer ของแต่ละชนิด (นับจากทั้งหมด ไม่ใช่เฉพาะที่กรองแล้ว) */
  counts: Record<GeomFilterValue, number>;
  /** lg = มือถือ (แตะง่าย สูง 44px) */
  size?: "sm" | "lg";
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as GeomFilterValue)}
      aria-label="กรองตามชนิด"
      className={cn("grid w-full grid-cols-4 gap-0.5 rounded-lg bg-muted p-0.5", size === "lg" && "gap-1 p-1")}
    >
      {FILTERS.map((f) => {
        const Icon = ICON[f];
        return (
          <ToggleGroupItem
            key={f}
            value={f}
            aria-label={`${LABEL[f]} ${counts[f]} layer`}
            className={cn(
              "flex h-auto min-w-0 flex-col items-center gap-0 rounded-md! border-0 px-1 py-1 text-muted-foreground shadow-none transition-colors",
              "hover:bg-transparent hover:text-foreground",
              "data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[state=on]:[&_svg]:text-primary",
              size === "lg" ? "min-h-12 py-1.5" : "min-h-10",
            )}
          >
            <span className="flex items-center gap-1">
              <Icon />
              <span className="text-[0.6875rem] font-normal tabular-nums opacity-70">{counts[f]}</span>
            </span>
            <span className="max-w-full truncate text-xs font-semibold">{LABEL[f]}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
