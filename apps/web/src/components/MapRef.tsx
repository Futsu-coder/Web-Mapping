import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type L from "leaflet";

export default function MapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  // กล่องแผนที่เปลี่ยนขนาดโดยไม่มี window resize (เช่น แถบ error โผล่/ปิด) → ให้ Leaflet คำนวณศูนย์กลางใหม่
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}
