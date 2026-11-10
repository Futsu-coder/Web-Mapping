import type { ReactNode } from "react";

/**
 * การ์ดรายละเอียด/ฟอร์มลอยด้านขวา (จอคอม) — เนื้อใน = FeatureEditor ที่ App ส่งมา
 * ยืดลงเกือบสุดจอเสมอ (บน 4.5rem + ล่าง 1rem) ให้เห็นฟอร์มมากที่สุดบนจอเตี้ย — ปุ่มควบคุมแผนที่ App ย้ายไปอยู่ซ้ายของการ์ดแทน
 */
export default function DetailCard({ children }: { children: ReactNode }) {
  return (
    <div
      data-detail-panel
      className="absolute top-[4.5rem] right-4 z-[25] flex max-h-[calc(100%-5.5rem)] w-[22rem] flex-col overflow-hidden rounded-xl border border-black/5 bg-card shadow-float"
    >
      {children}
    </div>
  );
}
