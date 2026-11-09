import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** รวม className แบบ shadcn (ตัด class ที่ซ้ำกันของ Tailwind) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
