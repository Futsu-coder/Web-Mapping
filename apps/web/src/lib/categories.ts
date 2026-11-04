import type { Category } from "../../../shared/categories";

export { CATEGORIES } from "../../../shared/categories";
export type { Category };

// สีของ badge / จุดสีใน dropdown ต่อ category
export const CATEGORY_STYLE: Record<Category, { badge: string; dot: string }> = {
  Environment: { badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  Transport: { badge: "bg-purple-100 text-purple-800", dot: "bg-purple-500" },
  "Public Service": { badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  Other: { badge: "bg-slate-200 text-slate-800", dot: "bg-slate-500" },
};
