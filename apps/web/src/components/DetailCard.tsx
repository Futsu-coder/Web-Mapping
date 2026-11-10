import type { ReactNode } from "react";

/**
 * การ์ดรายละเอียด/ฟอร์มลอยด้านขวา (จอคอม) — เนื้อใน = FeatureEditor ที่ App ส่งมา
 * ปกติเว้นด้านล่าง 16rem ให้ปุ่มควบคุมแผนที่ / tall = ยืดลงเกือบสุด (ตอนเปิด attribute table พื้นที่แผนที่เตี้ย → App ย้ายปุ่มควบคุมไปซ้ายของการ์ด)
 */
export default function DetailCard({ children, tall = false }: { children: ReactNode; tall?: boolean }) {
  return (
    <div
      data-detail-panel
      className={`absolute top-[4.5rem] right-4 z-20 flex w-[22rem] flex-col overflow-hidden rounded-xl border border-black/5 bg-card shadow-float ${
        tall ? "max-h-[calc(100%-5.5rem)]" : "max-h-[calc(100%-4.5rem-16rem)]"
      }`}
    >
      {children}
    </div>
  );
}
