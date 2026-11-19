import { useRef } from "react";
import { useSortable } from "../hooks/useSortable";
import type { Layer } from "../lib/layers";
import LayerOrderRow from "./LayerOrderRow";

/**
 * รายการ layer ในโหมดเรียงลำดับ (บนสุดของรายการ = วาดทับ layer ล่าง) — ใช้ร่วมจอคอม + มือถือ
 * ลากด้ามจับ ⠿ หรือกด ↑/↓ — ตาควบคุมการซ่อนจากแผนที่ (เฉพาะบัญชีนี้)
 * scrollRef = กล่องที่เลื่อนอยู่ (ลากชิดขอบแล้วเลื่อนให้เอง)
 */
export default function LayerOrderList({
  layers,
  hidden,
  onMove,
  onSetVisible,
  large,
  scrollRef,
}: {
  layers: Layer[];
  hidden: Set<number>;
  onMove: (layerId: number, toIndex: number) => void;
  onSetVisible: (layerId: number, visible: boolean) => void;
  large?: boolean;
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const own = useRef<HTMLUListElement>(null);
  const sortable = useSortable({ ids: layers.map((l) => l.id), onMove, scrollRef: scrollRef ?? own });
  return (
    <ul ref={own} className="flex flex-col gap-1 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-1.5" aria-label="ลำดับ layer (บนสุด = วาดทับ)">
      {layers.map((layer, i) => (
        <LayerOrderRow
          key={layer.id}
          layer={layer}
          index={i}
          total={layers.length}
          hidden={hidden.has(layer.id)}
          dragging={sortable.dragId === layer.id}
          offset={sortable.offsetFor(layer.id)}
          grip={sortable.gripProps(layer.id)}
          large={large}
          onMoveBy={(d) => onMove(layer.id, i + d)}
          onToggleVisible={() => onSetVisible(layer.id, hidden.has(layer.id))}
        />
      ))}
    </ul>
  );
}
