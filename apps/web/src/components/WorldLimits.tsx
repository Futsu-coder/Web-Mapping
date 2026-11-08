import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { WORLD_BOUNDS } from "../lib/baseLayers";

/**
 * ซูมออกได้สุดแค่ระดับที่โลก 1 ใบเต็มกรอบแผนที่พอดี (ไม่เห็นพื้นที่ว่างนอกโลก)
 * คำนวณใหม่ทุกครั้งที่กรอบแผนที่เปลี่ยนขนาด เพราะจอคอมกับมือถือต้องใช้ระดับซูมต่างกัน
 */
export default function WorldLimits() {
  const map = useMap();
  useEffect(() => {
    const update = () => map.setMinZoom(map.getBoundsZoom(WORLD_BOUNDS, true));
    update();
    map.on("resize", update);
    return () => {
      map.off("resize", update);
    };
  }, [map]);
  return null;
}
