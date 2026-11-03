import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { DrawShape, Item } from "../lib/types";

export default function DrawTools({
  onItemsChange,
  onActiveToolChange,
}: {
  onItemsChange: (fn: (items: Item[]) => Item[]) => void;
  onActiveToolChange: (shape: DrawShape | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const handleCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as L.Layer & { toGeoJSON(): GeoJSON.Feature };
      const type = layer.toGeoJSON().geometry.type as Item["type"];
      const name = window.prompt("ตั้งชื่อ", type) || type;
      const id = L.Util.stamp(layer);
      layer.bindPopup(name);
      // Geoman's own toolbar (and its global Edit Mode button) is no longer mounted,
      // so make every freshly drawn shape immediately vertex-editable here instead.
      const editable = layer as L.Layer & { pm?: { enable: () => void } };
      editable.pm?.enable();
      layer.on("pm:remove", () => onItemsChange((items) => items.filter((i) => i.id !== id)));
      onItemsChange((items) => [...items, { id, name, type, layer }]);
      console.log(layer.toGeoJSON());
    };

    const handleDrawStart = (e: { shape: DrawShape }) => onActiveToolChange(e.shape);
    const handleDrawEnd = () => onActiveToolChange(null);

    const drawStartHandler = handleDrawStart as unknown as L.LeafletEventHandlerFn;

    map.on("pm:create", handleCreate);
    map.on("pm:drawstart", drawStartHandler);
    map.on("pm:drawend", handleDrawEnd);
    return () => {
      map.off("pm:create", handleCreate);
      map.off("pm:drawstart", drawStartHandler);
      map.off("pm:drawend", handleDrawEnd);
    };
  }, [map, onItemsChange, onActiveToolChange]);

  return null;
}
