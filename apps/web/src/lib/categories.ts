import type { Category } from "../../../shared/categories";

export { CATEGORIES } from "../../../shared/categories";
export type { Category };

// สีของ badge / จุดสีใน dropdown ต่อ category — hex ใช้วาด feature บนแผนที่ให้ตรงกับจุดสีในรายการ
export const CATEGORY_STYLE: Record<Category, { badge: string; dot: string; hex: string }> = {
  Environment: { badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", hex: "#10b981" },
  Transport: { badge: "bg-purple-100 text-purple-800", dot: "bg-purple-500", hex: "#a855f7" },
  "Public Service": { badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500", hex: "#3b82f6" },
  Other: { badge: "bg-zinc-200 text-zinc-800", dot: "bg-zinc-500", hex: "#71717a" },
};
