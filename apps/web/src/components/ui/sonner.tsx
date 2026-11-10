import { Toaster as Sonner, type ToasterProps } from "sonner"

// เว็บเป็นธีม light อย่างเดียว — toast ที่เราวาดเอง (toast.custom) ใช้ token ของธีมเองทั้งหมด
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    position="top-center"
    visibleToasts={3}
    // กลางบนทุกขนาดจอ — คอม: แนวเดียวกับแถวบน (panel/ปุ่มบัญชี top-4) / มือถือ: ลงมาใต้แถบค้นหา+บัญชี ไม่ทับแผ่นรายละเอียดด้านล่าง
    // ต้องส่งเป็น prop เพราะ sonner ใส่เป็น inline style
    offset={{ top: "1rem" }}
    mobileOffset={{ top: "calc(4.25rem + env(safe-area-inset-top, 0px))" }}
    className="toaster group"
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
