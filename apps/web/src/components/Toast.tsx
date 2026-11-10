import { toast } from "sonner";
import { FlaskConicalIcon, InfoIcon, MapPinIcon, PentagonIcon, RouteIcon, type LucideIcon } from "lucide-react";
import type { GeomType } from "../lib/types";
import ToastCard from "./ToastCard";

const TOAST_DURATION = 4000;

const SHAPE: Record<GeomType, { label: string; Icon: LucideIcon }> = {
  Point: { label: "จุด", Icon: MapPinIcon },
  LineString: { label: "เส้น", Icon: RouteIcon },
  Polygon: { label: "พื้นที่", Icon: PentagonIcon },
};

/**
 * แสดง toast แล้วปิดเองเมื่อครบ TOAST_DURATION โดยนับต่อแม้ชี้เมาส์ค้าง
 * sonner หยุดนับเวลาเมื่อชี้เมาส์และปิดตัวเลือกนี้ไม่ได้ จึงให้ sonner ไม่ปิดเอง (Infinity) แล้วตั้งเวลาปิดเอง
 */
function show(render: (close: () => void) => React.ReactElement) {
  const id = toast.custom((id) => render(() => toast.dismiss(id)), { duration: Infinity });
  setTimeout(() => toast.dismiss(id), TOAST_DURATION);
}

/** แจ้งว่าบันทึก feature แล้ว — ล่างกลางแผนที่ ปิดเองใน 4 วินาที */
export function notifySaved({ name, type, layerName, temp }: { name: string; type: GeomType; layerName?: string; temp?: boolean }) {
  const { label, Icon } = SHAPE[type];
  show((close) => (
    <ToastCard
      duration={TOAST_DURATION}
      badge
      icon={<Icon className="size-4.5" />}
      title={
        <>
          บันทึก <strong className="font-semibold">&quot;{name}&quot;</strong> แล้ว
        </>
      }
      detail={
        temp ? (
          <>
            <FlaskConicalIcon className="size-3 shrink-0 text-amber-600" />
            <span className="truncate">เก็บชั่วคราวในเบราว์เซอร์นี้</span>
          </>
        ) : (
          [label, layerName].filter(Boolean).join(" · ")
        )
      }
      onClose={close}
    />
  ));
}

/** ข้อความแจ้งทั่วไป (เช่น ลบข้อมูลทดลองแล้ว) */
export function notifyInfo(message: string) {
  show((close) => <ToastCard duration={TOAST_DURATION} icon={<InfoIcon className="size-4.5" />} title={message} onClose={close} />);
}
