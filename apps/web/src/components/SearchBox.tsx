import { useEffect, useRef, useState } from "react";
import L from "leaflet";

type Place = { place_id: number; display_name: string; lat: string; lon: string; boundingbox: [string, string, string, string] };

// Nominatim (OpenStreetMap) ใช้ฟรี แต่ตามเงื่อนไขการใช้งาน: ไม่เกิน 1 request/วินาที และห้ามทำ autocomplete
// → ค้นหาเฉพาะตอนกด Enter / ปุ่มค้นหา
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1000;

const DEFAULT_CLASS = "absolute top-4 left-16 z-20 w-[min(20rem,calc(100%-8rem))]";

export default function SearchBox({
  mapRef,
  className = DEFAULT_CLASS,
  onPicked,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
  /** ตำแหน่ง/ความกว้างของกล่อง (ค่าเริ่มต้น = มุมซ้ายบนของจอคอม) */
  className?: string;
  /** เลือกผลการค้นหาแล้ว (มือถือใช้ปิดแถบค้นหา) */
  onPicked?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const lastRequest = useRef(0);
  const pin = useRef<L.CircleMarker | null>(null);

  // ลบหมุดตำแหน่งที่ค้นหาตอน unmount
  useEffect(() => () => void pin.current?.remove(), []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;
    const wait = lastRequest.current + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest.current = Date.now();

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, format: "jsonv2", limit: "5", "accept-language": "th,en" });
      const res = await fetch(`${NOMINATIM}?${params}`);
      if (!res.ok) throw new Error(`ค้นหาไม่สำเร็จ (${res.status})`);
      setResults(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const pick = (place: Place) => {
    const map = mapRef.current;
    if (!map) return;
    const [south, north, west, east] = place.boundingbox.map(Number);
    map.flyToBounds([[south, west], [north, east]], { maxZoom: 16 });
    // หมุดชั่วคราว ไม่บันทึกลง database และไม่ให้ Geoman แก้ไข
    pin.current?.remove();
    pin.current = L.circleMarker([Number(place.lat), Number(place.lon)], {
      radius: 8,
      color: "#0f766e",
      fillColor: "#14b8a6",
      fillOpacity: 0.6,
      pmIgnore: true,
    })
      .bindTooltip(place.display_name)
      .addTo(map);
    setHasPin(true);
    setResults(null);
    onPicked?.();
  };

  const clear = () => {
    setQuery("");
    setResults(null);
    setError(null);
    pin.current?.remove();
    pin.current = null;
    setHasPin(false);
  };

  return (
    <div className={className}>
      <form
        onSubmit={search}
        className="flex items-center gap-1 pl-3 pr-1 h-10 bg-white border border-slate-200 rounded-lg shadow-md"
      >
        <span className="material-symbols-outlined text-[19px] text-slate-400">search</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาสถานที่ แล้วกด Enter"
          aria-label="ค้นหาสถานที่"
          className="flex-1 min-w-0 text-base md:text-sm outline-none bg-transparent"
        />
        {loading && <span className="text-xs text-slate-400 px-1">กำลังค้นหา…</span>}
        {(query || hasPin) && !loading && (
          <button
            type="button"
            title="ล้าง"
            aria-label="ล้าง"
            onClick={clear}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        )}
      </form>

      {(results || error) && (
        <ul className="mt-1 bg-white border border-slate-200 rounded-lg shadow-md overflow-hidden text-sm">
          {error && <li className="px-3 py-2 text-red-700">{error}</li>}
          {results?.length === 0 && <li className="px-3 py-2 text-slate-500">ไม่พบสถานที่</li>}
          {results?.map((place) => (
            <li key={place.place_id}>
              <button
                type="button"
                onClick={() => pick(place)}
                className="w-full text-left px-3 py-2 hover:bg-teal-50 text-slate-700 line-clamp-2"
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
