import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Marker, type Map as MlMap, type PaddingOptions } from "maplibre-gl";

type Place = { place_id: number; display_name: string; lat: string; lon: string; boundingbox: [string, string, string, string] };

// Nominatim (OpenStreetMap) ใช้ฟรี แต่ตามเงื่อนไขการใช้งาน: ไม่เกิน 1 request/วินาที และไม่แนะนำให้ทำ autocomplete
// → ค้นหาขณะพิมพ์แบบประหยัด: รอหยุดพิมพ์ก่อน (debounce), ยิงไม่เกิน 1 ครั้ง/วินาที, จำผลคำค้นเดิมไว้ (cache)
//   และมีคำค้นใหม่เมื่อไหร่ ยกเลิก request เก่าด้วย AbortController (ผลเก่าที่มาทีหลังจะไม่ทับผลใหม่)
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1000;
const DEBOUNCE_MS = 500;
const MIN_CHARS = 3;

/** รอแบบยกเลิกได้ — ถูก abort ระหว่างรอ = reject ทันที */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const DEFAULT_CLASS = "absolute top-4 left-16 z-20 w-[min(20rem,calc(100%-8rem))]";

export default function SearchBox({
  mapRef,
  className = DEFAULT_CLASS,
  onPicked,
  getPadding,
  floating = false,
  onClose,
}: {
  mapRef: React.MutableRefObject<MlMap | null>;
  /** ตำแหน่ง/ความกว้างของกล่อง (ค่าเริ่มต้น = มุมซ้ายบนของจอคอม) */
  className?: string;
  /** เลือกผลการค้นหาแล้ว (มือถือใช้ปิดแถบค้นหา) */
  onPicked?: () => void;
  /** ระยะเว้นขอบจากสิ่งที่บังแผนที่อยู่ (พาเนลขวา / แผ่นล่างของมือถือ) ให้หมุดไปอยู่กลางส่วนที่มองเห็น */
  getPadding?: () => PaddingOptions;
  /** แบบลอยใน SearchToggle: ฟอร์มโปร่งใสสูง 40px, รายการผลค้นหาลอยใต้ช่อง, มีปุ่ม ✕ ปิดแถบ + Esc */
  floating?: boolean;
  onClose?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const lastRequest = useRef(0);
  const pin = useRef<Marker | null>(null);
  const controller = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cache = useRef(new Map<string, Place[]>());

  // unmount: ลบหมุดตำแหน่งที่ค้นหา และยกเลิกการค้นหาที่ค้างอยู่
  useEffect(
    () => () => {
      pin.current?.remove();
      clearTimeout(debounce.current);
      controller.current?.abort();
    },
    [],
  );

  /** หยุดทุกอย่างที่ค้างอยู่ (รอ debounce / รอ throttle / request ที่ยิงไปแล้ว) */
  const cancel = () => {
    clearTimeout(debounce.current);
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
  };

  const run = async (q: string) => {
    controller.current?.abort(); // มีคำค้นใหม่ → ยกเลิกของเก่า
    const ctrl = new AbortController();
    controller.current = ctrl;
    setError(null);

    const cached = cache.current.get(q);
    if (cached) {
      controller.current = null;
      setLoading(false);
      setResults(cached);
      return;
    }

    setLoading(true);
    try {
      const wait = lastRequest.current + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await sleep(wait, ctrl.signal);
      lastRequest.current = Date.now();
      const params = new URLSearchParams({ q, format: "jsonv2", limit: "5", "accept-language": "th,en" });
      const res = await fetch(`${NOMINATIM}?${params}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`ค้นหาไม่สำเร็จ (${res.status})`);
      const places: Place[] = await res.json();
      cache.current.set(q, places);
      setResults(places);
    } catch (err) {
      if (ctrl.signal.aborted) return; // ถูกแทนที่ด้วยคำค้นใหม่ / กดล้าง → ไม่ต้องแจ้ง error
      setError(err instanceof Error ? err.message : String(err));
      setResults(null);
    } finally {
      // อัปเดตเฉพาะเมื่อยังเป็นการค้นหาล่าสุด (ตัวที่ถูกยกเลิกไม่แตะสถานะของตัวใหม่)
      if (controller.current === ctrl) {
        controller.current = null;
        setLoading(false);
      }
    }
  };

  const onChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    const q = value.trim();
    if (q.length < MIN_CHARS) {
      cancel();
      setResults(null);
      setError(null);
      return;
    }
    debounce.current = setTimeout(() => void run(q), DEBOUNCE_MS);
  };

  // กด Enter / ปุ่มค้นหา = ค้นหาทันที ไม่ต้องรอ debounce
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    clearTimeout(debounce.current);
    const q = query.trim();
    if (q) void run(q);
  };

  const pick = (place: Place) => {
    const map = mapRef.current;
    if (!map) return;
    const [south, north, west, east] = place.boundingbox.map(Number);
    const point: [number, number] = [Number(place.lon), Number(place.lat)];
    const padding = getPadding?.() ?? { top: 40, right: 40, bottom: 40, left: 40 };
    // ระดับซูมให้เห็นทั้งพื้นที่ (เช่น ทั้งจังหวัด) แต่วางหมุดไว้กลางจอ — กลางกรอบ bbox มักไม่ใช่ตำแหน่งของสถานที่
    const zoom = Math.min(16, map.cameraForBounds([[west, south], [east, north]], { padding })?.zoom ?? 12);
    const camera = map.cameraForBounds([point, point], { padding, maxZoom: zoom });
    if (camera) map.flyTo(camera);
    // หมุดชั่วคราว ไม่บันทึกลง database และไม่เข้า draw
    pin.current?.remove();
    const el = document.createElement("div");
    el.className = "w-4 h-4 rounded-full border-2 border-teal-700 bg-teal-400/60 shadow";
    el.title = place.display_name;
    pin.current = new Marker({ element: el }).setLngLat(point).addTo(map);
    setHasPin(true);
    setResults(null);
    onPicked?.();
  };

  const clear = () => {
    cancel();
    setQuery("");
    setResults(null);
    setError(null);
    pin.current?.remove();
    pin.current = null;
    setHasPin(false);
  };

  return (
    <div className={floating ? "relative w-full" : className}>
      <form
        onSubmit={search}
        className={
          floating
            ? "flex h-10 items-center gap-1 pr-1 pl-3.5"
            : "flex h-10 items-center gap-1 rounded-lg bg-muted pr-1 pl-3 focus-within:ring-2 focus-within:ring-primary/40"
        }
      >
        <SearchIcon className="size-[18px] text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose?.()}
          placeholder="ค้นหาสถานที่"
          aria-label="ค้นหาสถานที่"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {loading && <span className="px-1 text-xs text-muted-foreground">กำลังค้นหา…</span>}
        {(query || hasPin || (floating && onClose)) && (
          <button
            type="button"
            title="ล้าง"
            aria-label="ล้าง"
            onClick={() => {
              clear();
              onClose?.();
            }}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </form>

      {(results || error) && (
        <ul
          className={
            floating
              ? "absolute top-full right-0 left-0 mt-2 max-h-60 overflow-y-auto rounded-xl border bg-card text-sm shadow-float"
              : "mt-1 max-h-60 overflow-y-auto rounded-lg border bg-card text-sm"
          }
        >
          {error && <li className="px-3 py-2 text-destructive">{error}</li>}
          {results?.length === 0 && <li className="px-3 py-2 text-muted-foreground">ไม่พบสถานที่</li>}
          {results?.map((place) => (
            <li key={place.place_id}>
              <button
                type="button"
                onClick={() => pick(place)}
                className="line-clamp-2 min-h-11 w-full px-3 py-2 text-left hover:bg-accent"
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
