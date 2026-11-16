import { useRef, useState } from "react";
import { ArrowUpDownIcon, CheckIcon, CircleXIcon, EyeIcon, EyeOffIcon, LockIcon, PlusIcon, SearchIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { layerCounts, type Layer } from "../../lib/layers";
import { geometrySummary } from "../../lib/measure";
import type { GeomType, Item } from "../../lib/types";
import GeomFilter from "../GeomFilter";
import LayerOrderList from "../LayerOrderList";

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
  layers,
  onEditLayer,
  onAddLayer,
  hiddenLayers,
  onMoveLayer,
  onSetLayerVisible,
}: {
  /** layer ทั้งหมด: แสดงชื่อ/สี layer ของแต่ละ feature + แถบ layer (แตะเพื่อตั้งค่า เฉพาะคนที่จัดการได้) */
  layers?: Layer[];
  onEditLayer?: (layer: Layer) => void;
  onAddLayer?: () => void;
  /** ลำดับ/ซ่อน layer ของบัญชีนี้ — layers ที่ส่งมาต้องเรียงบนสุด → ล่างสุดแล้ว */
  hiddenLayers?: Set<number>;
  onMoveLayer?: (layerId: number, toIndex: number) => void;
  onSetLayerVisible?: (layerId: number, visible: boolean) => void;
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
  // โหมดเรียงลำดับ layer (แทนรายการ feature) — เหลือ layer ≤ 1 = ไม่มีอะไรให้เรียง
  const [reordering, setReordering] = useState(false);
  const orderRef = useRef<HTMLDivElement>(null);
  const canReorder = !!onMoveLayer && (layers?.length ?? 0) > 1;
  // เหลือ layer ≤ 1 = ออกจากโหมดจริงๆ (ไม่งั้นพอมี layer ใหม่ โหมดจะเปิดกลับมาเอง)
  if (reordering && !canReorder) setReordering(false);
  const orderMode = reordering && canReorder;
  const q = query.trim().toLowerCase();
  const layerOf = (i: Item) => layers?.find((l) => l.id === i.props.layerId);
  const groupName = (i: Item) => layerOf(i)?.name ?? "";
  const shown = items.filter(
    (i) =>
      (filter === "All" || i.type === filter) &&
      (!q || i.props.name.toLowerCase().includes(q) || groupName(i).toLowerCase().includes(q)),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 shrink-0 px-4">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-3 size-4.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="กรองตามชื่อหรือ layer"
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

      {layers && (
        <div className="no-scrollbar mb-3 flex shrink-0 gap-2 overflow-x-auto px-4">
          {canReorder && (
            <Button
              type="button"
              variant={orderMode ? "default" : "outline"}
              size="sm"
              aria-pressed={orderMode}
              onClick={() => setReordering((r) => !r)}
              className="h-8 shrink-0 gap-1 rounded-lg text-xs"
            >
              {orderMode ? <CheckIcon className="size-3.5" /> : <ArrowUpDownIcon className="size-3.5" />}
              {orderMode ? "เสร็จ" : "เรียงลำดับ"}
            </Button>
          )}
          {layers.map((l) => (
            <Button
              key={l.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditLayer?.(l)}
              className={cn("h-8 shrink-0 gap-1.5 rounded-lg text-xs", hiddenLayers?.has(l.id) && "opacity-55")}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
              {onEditLayer && <SettingsIcon className="size-3.5 text-muted-foreground" />}
            </Button>
          ))}
          {onAddLayer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddLayer}
              className="h-8 shrink-0 gap-0.5 rounded-lg border-dashed border-primary text-xs text-primary"
            >
              <PlusIcon className="size-4" />
              Layer
            </Button>
          )}
        </div>
      )}

      {layers && layers.length === 0 && !onAddLayer && (
        <p className="mb-3 shrink-0 px-4 text-xs text-muted-foreground">ยังไม่มี layer — เจ้าของ group เป็นคนสร้าง</p>
      )}

      <div className="mb-3 shrink-0 px-4">
        <GeomFilter
          size="lg"
          value={filter}
          onChange={onFilterChange}
          counts={layerCounts(layers ?? [])}
        />
      </div>

      {orderMode && layers ? (
        <div ref={orderRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <LayerOrderList
            layers={layers}
            hidden={hiddenLayers ?? new Set()}
            onMove={onMoveLayer!}
            onSetVisible={(id, visible) => onSetLayerVisible?.(id, visible)}
            large
            scrollRef={orderRef}
          />
        </div>
      ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-6">
        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "ยังไม่มีข้อมูล กดปุ่ม + แล้วเริ่มวาดบนแผนที่" : "ไม่พบ feature ที่ตรงกับตัวกรอง"}
          </li>
        )}
        {shown.map((item) => {
          const selected = item.id === selectedId;
          const hidden = hiddenIds.has(item.id);
          const layer = layerOf(item);
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
              <span
                className="ml-1 size-3 shrink-0 rounded-full bg-zinc-500"
                style={layer ? { backgroundColor: layer.color } : undefined}
                title={layer?.name ?? "ไม่มี layer"}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.9375rem] font-semibold">{item.props.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[0.625rem]">
                    {TYPE_LABEL[item.type]}
                  </Badge>
                  {layer && (
                    <Badge variant="outline" className="text-[0.625rem]">
                      {layer.name}
                    </Badge>
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
      )}
    </div>
  );
}
