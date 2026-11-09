import type { ReactNode } from "react";

/** การ์ดรายละเอียด/ฟอร์มลอยด้านขวา (จอคอม) — เนื้อใน = FeatureEditor ที่ App ส่งมา */
export default function DetailCard({ children }: { children: ReactNode }) {
  return (
    <div
      data-detail-panel
      className="absolute top-[4.5rem] right-4 z-20 flex max-h-[calc(100%-4.5rem-16rem)] w-[22rem] flex-col overflow-hidden rounded-xl border border-black/5 bg-card shadow-float"
    >
      {children}
    </div>
  );
}
