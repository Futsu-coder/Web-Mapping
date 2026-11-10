import { useState } from "react";
import { CircleXIcon, EyeIcon, EyeOffIcon, LockIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLE } from "../../lib/categories";
import { geometrySummary } from "../../lib/measure";
import { FILTERS, type GeomType, type Item } from "../../lib/types";

const FILTER_LABEL: Record<GeomType | "All", string> = { All: "ทั้งหมด", Point: "Point", LineString: "Line", Polygon: "Polygon" };
const TYPE_LABEL: Record<GeomType, string> = { Point: "Point", LineString: "Line", Polygon: "Polygon" };

/** แท็บรายการทั้งหมดบนมือถือ: ช่องกรอง + ตัวกรองชนิด + แถว feature (สูง ≥56px) */
export default function MobileFeatureList({
  items,
  filter,
  onFilterChange,
  selectedId,
  hiddenIds,
  canModify,
  showOwner,
  onFocus,
  onToggleVisible,
  onRemove,
}: {
  items: Item[];
  filter: GeomType | "All";
  onFilterChange: (f: GeomType | "All") => void;
  selectedId: number | null;
  hiddenIds: Set<number>;
  /** แก้/ลบได้ไหม (เจ้าของ feature หรือเจ้าของ group) — ไม่ได้ก็ซ่อนปุ่มลบและแสดงแม่กุญแจ */
  canModify: (item: Item) => boolean;
  /** แสดงชื่อคนสร้าง (login แล้ว) */
  showOwner: boolean;
  onFocus: (item: Item) => void;
  onToggleVisible: (item: Item) => void;
  onRemove: (item: Item) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const count = (f: GeomType | "All") => (f === "All" ? items.length : items.filter((i) => i.type === f).length);
  const shown = items.filter(
    (i) =>
      (filter === "All" || i.type === filter) &&
      (!q || i.props.name.toLowerCase().includes(q) || (i.props.category ?? "").toLowerCase().includes(q)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 shrink-0 px-4">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-3 size-4.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="กรองตามชื่อหรือหมวดหมู่"
            aria-label="กรอง feature"
            className="h-11 bg-muted pr-10 pl-9 text-base md:text-base"
          />
          {query && (
            <button type="button" aria-label="ล้าง" onClick={() => setQuery("")} className="absolute right-1 grid size-9 place-items-center text-muted-foreground">
              <CircleXIcon className="size-4.5" />
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar mb-3 shrink-0 overflow-x-auto px-4">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(v) => v && onFilterChange(v as GeomType | "All")}
          aria-label="กรองตามชนิด"
          className="w-max gap-2"
        >
          {FILTERS.map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className="h-9 rounded-full px-3.5 text-[0.8125rem] data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {FILTER_LABEL[f]}
              <span className="font-normal opacity-80">({count(f)})</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-6">
        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "ยังไม่มีข้อมูล กดปุ่ม + แล้วเริ่มวาดบนแผนที่" : "ไม่พบ feature ที่ตรงกับตัวกรอง"}
          </li>
        )}
        {shown.map((item) => {
          const selected = item.id === selectedId;
          const hidden = hiddenIds.has(item.id);
          const category = item.props.category ?? "Other";
          return (
            <li
              key={item.id}
              onClick={() => onFocus(item)}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 transition-colors",
                selected ? "bg-primary/10" : "active:bg-muted",
                hidden && "opacity-55",
              )}
            >
              <span className={cn("ml-1 size-3 shrink-0 rounded-full", CATEGORY_STYLE[category].dot)} title={category} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9375rem] font-semibold">{item.props.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[0.625rem]">
                    {TYPE_LABEL[item.type]}
                  </Badge>
                  {item.props.category && (
                    <Badge className={cn("border-0 text-[0.625rem]", CATEGORY_STYLE[item.props.category].badge)}>{item.props.category}</Badge>
                  )}
                </div>
                <div className="mt-1 truncate text-[0.6875rem] text-muted-foreground">
                  {geometrySummary(item.geometry)}
                  {showOwner && item.ownerName ? ` · โดย ${item.ownerName}` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-11 shrink-0", hidden && "text-muted-foreground")}
                aria-label={hidden ? "แสดงบนแผนที่" : "ซ่อนจากแผนที่"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisible(item);
                }}
              >
                {hidden ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
              {canModify(item) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 text-destructive hover:text-destructive"
                  aria-label="ลบ"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item);
                  }}
                >
                  <Trash2Icon />
                </Button>
              ) : (
                <span title="แก้ไขได้เฉพาะเจ้าของ feature หรือเจ้าของ group" className="grid size-11 shrink-0 place-items-center text-muted-foreground/60">
                  <LockIcon className="size-4.5" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
