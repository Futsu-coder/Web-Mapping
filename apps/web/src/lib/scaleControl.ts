import type { IControl, Map as MlMap } from "maplibre-gl";

/** ความกว้างแถบสเกล (px) — คงที่ตลอด เลขข้างในเปลี่ยนตามระดับซูม */
const WIDTH_PX = 96;

/** แปลงเมตร → ข้อความ (m / km) */
export function formatDistance(meters: number): string {
  // ปัดก่อนแล้วค่อยเลือกหน่วย กันเคส 999.6 m → "1000 m" หรือ 9.96 km → "10.0 km"
  const m = meters < 10 ? Math.round(meters * 10) / 10 : Math.round(meters);
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : m} m`;
  const km = meters / 1000;
  const k = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  return `${k < 10 ? k.toFixed(1) : k.toLocaleString("en-US")} km`;
}

/** สเกลบาร์ความยาวคงที่ (ต่างจาก ScaleControl ที่ปรับความยาวให้เลขลงตัว) */
export class FixedScaleControl implements IControl {
  private map?: MlMap;
  private el?: HTMLDivElement;

  onAdd(map: MlMap): HTMLElement {
    this.map = map;
    // ใช้ class เดิมของ MapLibre → ได้สไตล์ใน index.css และตำแหน่งยกเหนือแผ่นล่างบนมือถือ
    const el = document.createElement("div");
    el.className = "maplibregl-ctrl maplibregl-ctrl-scale";
    el.style.width = `${WIDTH_PX}px`;
    el.style.boxSizing = "border-box";
    el.style.textAlign = "center";
    this.el = el;
    map.on("move", this.update);
    map.on("resize", this.update);
    map.on("terrain", this.update); // เปิด/ปิด 3D เปลี่ยนผล unproject แต่ไม่ยิง move
    this.update();
    return el;
  }

  onRemove() {
    this.map?.off("move", this.update);
    this.map?.off("resize", this.update);
    this.map?.off("terrain", this.update);
    this.el?.remove();
    this.map = undefined;
    this.el = undefined;
  }

  private update = () => {
    const { map, el } = this;
    if (!map || !el) return;
    const c = map.getContainer();
    const y = c.clientHeight / 2;
    const x = c.clientWidth / 2;
    const meters = map.unproject([x - WIDTH_PX / 2, y]).distanceTo(map.unproject([x + WIDTH_PX / 2, y]));
    el.textContent = formatDistance(meters);
  };
}
