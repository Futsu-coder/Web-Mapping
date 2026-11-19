import { MapPinIcon, PentagonIcon, RouteIcon, type LucideIcon } from "lucide-react";
import type { DrawShape } from "./types";

/** เครื่องมือวาด 3 ชนิด — ใช้ร่วมกันใน DrawFab, DrawHint, DrawSheet */
export const DRAW_TOOLS: { shape: DrawShape; label: string; key: string; Icon: LucideIcon; hint: string }[] = [
  { shape: "Marker", label: "จุด", key: "P", Icon: MapPinIcon, hint: "คลิกบนแผนที่เพื่อวางจุด" },
  { shape: "Line", label: "เส้น", key: "L", Icon: RouteIcon, hint: "คลิกเพื่อวางจุด · ดับเบิลคลิกหรือกด Enter เพื่อจบ" },
  { shape: "Polygon", label: "พื้นที่", key: "G", Icon: PentagonIcon, hint: "คลิกเพื่อวางจุด · คลิกจุดแรกหรือกด Enter เพื่อจบ" },
];

export const toolOf = (shape: DrawShape) => DRAW_TOOLS.find((t) => t.shape === shape)!;
