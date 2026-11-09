import { MapPinIcon, MoveIcon, PentagonIcon, PlusIcon, RouteIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DrawShape } from "../../lib/types";

/** มือถือ: ปุ่ม + มุมขวาล่าง เปิดเมนูเลือกชนิดที่จะวาด (วาดด้วยกากบาทกลางจอ) หรือย้าย feature */
export default function DrawFab({
  moveActive,
  onDrawSelect,
  onToggleMove,
  className,
}: {
  moveActive: boolean;
  onDrawSelect: (shape: DrawShape) => void;
  onToggleMove: () => void;
  className?: string;
}) {
  // กำลังย้ายอยู่ → ปุ่มเปลี่ยนเป็น ✕ กดเพื่อออกจากโหมดย้าย
  if (moveActive) {
    return (
      <Button aria-label="เลิกย้าย feature" onClick={onToggleMove} className={cn("size-14 rounded-2xl shadow-float", className)}>
        <XIcon className="size-6" />
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="เพิ่ม feature" className={cn("size-14 rounded-2xl shadow-float", className)}>
          <PlusIcon className="size-7" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-48 rounded-xl p-2">
        <DropdownMenuGroup>
          <DropdownMenuItem className="h-12 gap-3 text-base" onSelect={() => onDrawSelect("Marker")}>
            <MapPinIcon /> วางจุด
          </DropdownMenuItem>
          <DropdownMenuItem className="h-12 gap-3 text-base" onSelect={() => onDrawSelect("Line")}>
            <RouteIcon /> วาดเส้น
          </DropdownMenuItem>
          <DropdownMenuItem className="h-12 gap-3 text-base" onSelect={() => onDrawSelect("Polygon")}>
            <PentagonIcon /> วาดพื้นที่
          </DropdownMenuItem>
          <DropdownMenuItem className="h-12 gap-3 text-base" onSelect={onToggleMove}>
            <MoveIcon /> ย้าย feature
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
