import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type L from "leaflet";

export default function MapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);
  return null;
}
